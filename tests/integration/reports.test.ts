import { ReportDeliveryService } from '../../src/services/ReportDeliveryService.js';
import { ReportNotificationAdapter } from '../../src/infra/reports/ReportNotificationAdapter.js';
import { NotificationFailure } from '../../src/infra/reports/PushoverTransport.js';
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
async function fixture(mode: 'legacy' | 'enforced' = 'enforced') {
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
    mode,
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
  it('does not publish a report after its job was canceled or timed out', async () => {
    const f = await fixture();
    f.capture.mockImplementationOnce(async () => {
      const [job] = f.jobs.listJobs({
        budgetId: f.env.ACTUAL_BUDGET_ID,
        type: 'report_generate',
        status: 'running',
      });
      f.jobs.markJobCanceled(job.id);
      return structuredClone(f.source);
    });
    await expect(f.service.generate(f.input)).rejects.toThrow('REPORT_JOB_INACTIVE');
    expect(f.service.list(100, 0)).toHaveLength(0);
  });
  it('keeps other-budget history during orphan cleanup and rejects cross-month regeneration', async () => {
    const f = await fixture();
    const original = await f.service.generate(f.input);
    f.db.execute('UPDATE monthly_reports SET budget_id = ? WHERE id = ?', [
      'other-budget',
      original.id,
    ]);
    await utimes(join(f.dir, `${original.id}.pdf`), new Date(0), new Date(0));
    await f.service.recover();
    await expect(access(join(f.dir, `${original.id}.pdf`))).resolves.toBeUndefined();
    expect(() => f.service.get(original.id)).toThrow('NOT_FOUND');
    const own = await f.service.generate({ ...f.input, requestKey: randomUUID() });
    await expect(
      f.service.generate({
        ...f.input,
        month: '2026-08',
        requestKey: randomUUID(),
        supersedesId: own.id,
      })
    ).rejects.toThrow('INVALID_PREDECESSOR');
  });
  it('leaves no ready row when rendering or persistence fails; retry can succeed', async () => {
    const f = await fixture();
    const files = vi.spyOn(f.files, 'save').mockRejectedValueOnce(new Error('synthetic disk full'));
    await expect(f.service.generate(f.input)).rejects.toThrow('REPORT_GENERATION_FAILED');
    expect(f.service.list(100, 0)).toEqual([]);
    files.mockRestore();
    expect((await f.service.generate(f.input)).version).toBe(1);
    vi.spyOn(f.repo, 'save').mockImplementationOnce(() => {
      throw new Error('synthetic DB write failure');
    });
    await expect(f.service.generate({ ...f.input, requestKey: randomUUID() })).rejects.toThrow(
      'REPORT_GENERATION_FAILED'
    );
    expect(f.service.list(100, 0)).toHaveLength(1);
  });
  it('does not expose report routes when authentication is in legacy mode', async () => {
    const f = await fixture('legacy');
    const response = await fetch(f.url);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'REPORTS_REQUIRE_ENFORCED_AUTH' });
    expect(f.capture).not.toHaveBeenCalled();
  });
  it('drills into frozen category/payee rows after recategorization and subsequent imports', async () => {
    const f = await fixture();
    f.source.payees = [{ id: 'merchant', name: 'Original merchant' }];
    f.source.accounts[0].transactions[0].payee = 'merchant';
    f.source.accounts[0].transactions.push({
      id: 'older',
      date: '2026-08-10',
      amount: -1000,
      category: 'food',
      payee: 'merchant',
    });
    const original = await f.service.generate(f.input);
    const query = { limit: 25, offset: 0, payeeId: 'merchant' };
    expect(f.service.transactions(original.id, query)).toMatchObject({
      netSpending: 1234,
      total: 1,
      rows: [{ payeeName: 'Original merchant', amount: -1234 }],
    });
    expect(f.service.explore(original.id).history).toHaveLength(2);
    expect(
      f.service.transactions(original.id, { limit: 25, offset: 0, observationId: 'previous-month' })
        .periodTotals
    ).toEqual([
      { month: '2026-08', netSpending: 1000 },
      { month: '2026-09', netSpending: 1234 },
    ]);
    expect(f.service.detail(original.id).analysis?.evidence).toEqual([]);
    expect(f.service.list(100, 0)[0].analysis).toBeUndefined();
    f.source.payees[0].name = 'Renamed merchant';
    f.source.accounts[0].transactions[0].amount = -9999;
    const revised = await f.service.generate({
      ...f.input,
      requestKey: randomUUID(),
      supersedesId: original.id,
    });
    expect(f.service.transactions(original.id, query).rows[0].payeeName).toBe('Original merchant');
    expect(f.service.transactions(revised.id, query).netSpending).toBe(9999);
    expect(() =>
      f.service.transactions(original.id, {
        limit: 25,
        offset: 0,
        observationId: 'other-report-id',
      })
    ).toThrow('NOT_FOUND');
    const response = await fetch(`${f.url}/${original.id}/transactions?categoryId=food`, {
      headers: { Authorization: `Bearer ${reader}` },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).netSpending).toBe(1234);
    expect((await fetch(`${f.url}/${original.id}/transactions`)).status).toBe(401);
    f.db.execute('UPDATE monthly_reports SET budget_id=? WHERE id=?', [
      'different-budget',
      original.id,
    ]);
    expect(
      (
        await fetch(`${f.url}/${original.id}/transactions`, {
          headers: { Authorization: `Bearer ${reader}` },
        })
      ).status
    ).toBe(404);
  });
  it('old report versions explicitly lack evidence rather than fetching current transactions', async () => {
    const f = await fixture();
    const report = await f.service.generate(f.input);
    f.db.execute(
      "UPDATE monthly_reports SET report_json=json_remove(report_json,'$.analysis') WHERE id=?",
      [report.id]
    );
    expect(() => f.service.transactions(report.id, { limit: 25, offset: 0 })).toThrow(
      'DETAIL_UNAVAILABLE'
    );
    expect(f.capture).toHaveBeenCalledTimes(1);
  });
  it('deduplicates delivery and never retries an uncertain provider outcome', async () => {
    const f = await fixture();
    const report = await f.service.generate(f.input);
    const transport = { send: vi.fn(async () => undefined) };
    const delivery = new ReportDeliveryService(
      f.db,
      new ReportNotificationAdapter(transport, true),
      'https://fixture.invalid',
      true,
      f.jobs,
      new AuditRepository(f.db),
      f.env.ACTUAL_BUDGET_ID
    );
    await Promise.all([delivery.notify(report.id), delivery.notify(report.id)]);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(delivery.status(report.id)).toBe('sent');
    const next = await f.service.generate({ ...f.input, requestKey: randomUUID() });
    transport.send.mockRejectedValueOnce(new NotificationFailure('uncertain'));
    expect(await delivery.notify(next.id)).toBe('uncertain');
    expect(await delivery.notify(next.id, true)).toBe('uncertain');
    expect(transport.send).toHaveBeenCalledTimes(2);
    const pending = randomUUID();
    f.db.execute("INSERT INTO report_delivery VALUES (?,'pending',?)", [
      pending,
      new Date().toISOString(),
    ]);
    delivery.recover();
    expect(delivery.status(pending)).toBe('uncertain');
  });
  it('failed notification preserves the ready PDF and only explicit retry resends', async () => {
    const f = await fixture();
    const transport = {
      send: vi.fn(async () => undefined).mockRejectedValueOnce(new NotificationFailure('failed')),
    };
    const delivery = new ReportDeliveryService(
      f.db,
      new ReportNotificationAdapter(transport, true),
      'https://fixture.invalid',
      true,
      f.jobs,
      new AuditRepository(f.db),
      f.env.ACTUAL_BUDGET_ID
    );
    const service = new ReportService(
      f.env.ACTUAL_BUDGET_ID,
      f.capture,
      f.repo,
      f.files,
      f.jobs,
      new AuditRepository(f.db),
      undefined,
      { delivery }
    );
    const report = await service.generate(f.input);
    expect(delivery.status(report.id)).toBe('failed');
    expect((await service.pdf(report.id)).subarray(0, 5).toString()).toBe('%PDF-');
    expect(await delivery.notify(report.id)).toBe('failed');
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(await delivery.notify(report.id, true)).toBe('sent');
    expect(transport.send).toHaveBeenCalledTimes(2);
  });
});
