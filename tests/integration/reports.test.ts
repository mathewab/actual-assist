import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, utimes, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import express, { Router } from 'express';
import { DatabaseAdapter } from '../../src/infra/DatabaseAdapter.js';
import { runMigrations } from '../../src/infra/migrations.js';
import { envSchema } from '../../src/infra/env.js';
import { ReportRepository } from '../../src/infra/repositories/ReportRepository.js';
import { ReportFileStore } from '../../src/infra/reports/ReportFileStore.js';
import { ReportService } from '../../src/services/ReportService.js';
import { JobService } from '../../src/services/JobService.js';
import { JobRepository } from '../../src/infra/repositories/JobRepository.js';
import { JobStepRepository } from '../../src/infra/repositories/JobStepRepository.js';
import { JobEventRepository } from '../../src/infra/repositories/JobEventRepository.js';
import { AuditRepository } from '../../src/infra/repositories/AuditRepository.js';
import { createReportRouter } from '../../src/api/reportRoutes.js';
import { createHttpAuth } from '../../src/auth/httpAuth.js';
import { StaticCredentialProvider } from '../../src/auth/principals.js';
import { mountAccessBoundary } from '../../src/auth/mountAccessBoundary.js';
import type { ReportCapture } from '../../src/domain/reports/Report.js';
vi.mock('../../src/infra/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const reader = 'synthetic-reader-credential-at-least-32';
const operator = 'synthetic-operator-credential-at-least-32';
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'reports-test-'));
  const env = envSchema.parse({
    ACTUAL_SERVER_URL: 'https://fixture.invalid',
    ACTUAL_PASSWORD: 'fixture',
    ACTUAL_BUDGET_ID: '00000000-0000-4000-8000-000000000000',
    SQLITE_DB_PATH: join(dir, 'audit.db'),
  });
  const db = new DatabaseAdapter(env);
  await runMigrations(env);
  cleanups.push(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  const jobs = new JobService(
    new JobRepository(db),
    new JobStepRepository(db),
    new JobEventRepository(db)
  );
  const repo = new ReportRepository(db);
  const files = new ReportFileStore(dir);
  const source: ReportCapture = {
    capturedAt: '2026-10-01T10:00:00Z',
    categories: [{ id: 'food', name: 'Food', income: false }],
    accounts: [
      {
        id: 'a',
        name: 'Synthetic account',
        transactions: [{ id: 't', date: '2026-09-10', amount: -1234, category: 'food' }],
      },
    ],
  };
  const capture = vi.fn(async () => structuredClone(source));
  const service = new ReportService(
    env.ACTUAL_BUDGET_ID,
    capture,
    repo,
    files,
    jobs,
    new AuditRepository(db)
  );
  const auth = createHttpAuth({
    mode: 'enforced',
    origins: ['https://fixture.invalid'],
    secureCookie: false,
    ttlSeconds: 300,
    provider: new StaticCredentialProvider([
      { id: 'r', role: 'reader', token: reader },
      { id: 'o', role: 'operator', token: operator },
    ]),
    audit: vi.fn(),
  });
  const app = express();
  const router = Router();
  router.use('/api/v1/reports', createReportRouter(service, auth));
  mountAccessBoundary(app, auth, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  cleanups.push(async () => {
    service.stop();
    await service.drain();
    auth.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing listener');
  const url = `http://127.0.0.1:${address.port}/api/v1/reports`;
  const input = { month: '2026-09', currency: 'USD', requestKey: randomUUID() };
  return { service, repo, files, jobs, source, capture, dir, url, input, env, db };
}
describe('saved reports with real SQLite and local PDF renderer', () => {
  it('persists immutable revisions, idempotent retries, and report files independently of jobs', async () => {
    const f = await fixture();
    const [v1, retry] = await Promise.all([
      f.service.generate(f.input),
      f.service.generate(f.input),
    ]);
    expect(v1.id).toBe(retry.id);
    expect(f.capture).toHaveBeenCalledTimes(1);
    const bytes = await f.service.pdf(v1.id);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    f.source.accounts[0].transactions[0].amount = -2000;
    const v2 = await f.service.generate({
      ...f.input,
      requestKey: randomUUID(),
      supersedesId: v1.id,
    });
    expect(v2.version).toBe(2);
    expect(v2.facts.spending).toBe(2000);
    expect(f.repo.get(f.env.ACTUAL_BUDGET_ID, v1.id)?.facts.spending).toBe(1234);
    expect(await f.service.pdf(v1.id)).toEqual(bytes);
    const reopened = new DatabaseAdapter(f.env);
    expect(new ReportRepository(reopened).get(f.env.ACTUAL_BUDGET_ID, v1.id)?.pdfHash).toBe(
      v1.pdfHash
    );
    reopened.close();
    await expect(f.service.generate({ ...f.input, currency: 'EUR' })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    f.db.execute('DELETE FROM job_events');
    f.db.execute('DELETE FROM jobs');
    expect(await f.service.pdf(v1.id)).toEqual(bytes);
  });
  it('enforces authentication, roles, private PDF responses and scoped lookup', async () => {
    const f = await fixture();
    expect((await fetch(f.url)).status).toBe(401);
    const post = (token: string) =>
      fetch(f.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(f.input),
      });
    expect((await post(reader)).status).toBe(403);
    const response = await post(operator);
    expect(response.status).toBe(201);
    const saved = await response.json();
    const pdf = await fetch(`${f.url}/${saved.id}/pdf?download=1`, {
      headers: { Authorization: `Bearer ${reader}` },
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('cache-control')).toContain('no-store');
    expect(pdf.headers.get('content-disposition')).toContain('attachment');
    expect(
      (await fetch(`${f.url}/${randomUUID()}`, { headers: { Authorization: `Bearer ${reader}` } }))
        .status
    ).toBe(404);
    expect(f.repo.get('another-budget', saved.id)).toBeNull();
    await expect(f.files.read('../../private')).rejects.toThrow();
  });
  it('fails corrupt downloads and render failures without publishing incomplete rows', async () => {
    const f = await fixture();
    const saved = await f.service.generate(f.input);
    await writeFile(join(f.dir, `${saved.id}.pdf`), 'corrupt');
    await expect(f.service.pdf(saved.id)).rejects.toMatchObject({ code: 'REPORT_FILE_CORRUPT' });
    f.capture.mockRejectedValueOnce(new Error('sensitive raw contents'));
    await expect(f.service.generate({ ...f.input, requestKey: randomUUID() })).rejects.toThrow(
      'REPORT_GENERATION_FAILED'
    );
    expect(f.service.list(100, 0)).toHaveLength(1);
    expect(
      f.jobs
        .listJobs({ budgetId: f.env.ACTUAL_BUDGET_ID })
        .some((j) => j.failureReason === 'REPORT_GENERATION_FAILED')
    ).toBe(true);
  });
  it('cleans only old orphan files and fails interrupted jobs at restart', async () => {
    const f = await fixture();
    const saved = await f.service.generate(f.input);
    const orphan = randomUUID();
    const path = join(f.dir, `${orphan}.pdf`);
    await writeFile(path, 'orphan');
    await utimes(path, new Date(0), new Date(0));
    const job = f.jobs.createJob({ budgetId: f.env.ACTUAL_BUDGET_ID, type: 'report_generate' });
    f.jobs.markJobRunning(job.id);
    await f.service.recover();
    expect(f.jobs.getJob(job.id).failureReason).toBe('REPORT_INTERRUPTED');
    await expect(access(path)).rejects.toThrow();
    expect((await f.service.pdf(saved.id)).subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('session generation requires CSRF and origin while authenticated download is allowed', async () => {
    const f = await fixture();
    const login = await fetch(f.url.replace('/v1/reports', '/auth/login'), {
      method: 'POST',
      headers: { Origin: 'https://fixture.invalid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: operator }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const session = await login.json();
    const generate = (csrf?: string) =>
      fetch(f.url, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Origin: 'https://fixture.invalid',
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify(f.input),
      });
    expect((await generate()).status).toBe(403);
    expect((await generate(session.csrf)).status).toBe(201);
  });
});
