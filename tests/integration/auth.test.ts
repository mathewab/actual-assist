import express, { Router } from 'express';
import type { Server } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createHttpAuth } from '../../src/auth/httpAuth.js';
import { StaticCredentialProvider } from '../../src/auth/principals.js';
import { mountAccessBoundary } from '../../src/auth/mountAccessBoundary.js';
import { requestContext, attributedMetadata } from '../../src/infra/requestContext.js';
import { envSchema } from '../../src/infra/env.js';

const operator = 'fixture-operator-credential-at-least-32';
const reader = 'fixture-reader-credential-at-least-32';
const credentials = [
  { id: 'owner', role: 'operator' as const, token: operator },
  { id: 'client', role: 'reader' as const, token: reader },
];
const origin = 'https://fixture.invalid';
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));
async function fixture(mode: 'legacy' | 'enforced' = 'enforced') {
  let now = Date.now();
  const audit = vi.fn();
  const auth = createHttpAuth({
    mode,
    origins: [origin],
    secureCookie: true,
    ttlSeconds: 300,
    provider: new StaticCredentialProvider(credentials),
    audit,
    now: () => now,
  });
  const app = express();
  mountAccessBoundary(app, auth, Router());
  const legacyOperation = vi.fn();
  app.use('/api/job-events/stream', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    res.write('data: ready\n\n');
  });
  app.use('/api', (_req, res) => {
    legacyOperation(attributedMetadata({ fixture: true }));
    res.json({ fixture: true });
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No listener');
  cleanup.push(() => {
    auth.close();
    server.closeAllConnections();
    server.close();
  });
  const url = `http://127.0.0.1:${address.port}`;
  const login = (token = operator, headers: Record<string, string> = {}) =>
    fetch(url + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ token }),
    });
  return {
    url,
    login,
    legacyOperation,
    audit,
    advance: () => {
      now += 301_000;
    },
  };
}
it('protects every legacy route family and unknown API routes against anonymous/reader callers', async () => {
  const f = await fixture();
  for (const path of [
    '/budgets',
    '/budgets/templates/apply',
    '/snapshots',
    '/suggestions',
    '/sync/apply',
    '/jobs',
    '/jobs/budget-sync',
    '/job-events/stream',
    '/payees/merge',
    '/audit',
    '/config',
    '/unknown',
  ]) {
    for (const method of ['GET', 'POST']) {
      expect((await fetch(f.url + '/api' + path, { method })).status).toBe(401);
      expect(
        (
          await fetch(f.url + '/api' + path, {
            method,
            headers: { Authorization: `Bearer ${reader}` },
          })
        ).status
      ).toBe(403);
    }
  }
  expect(f.legacyOperation).not.toHaveBeenCalled();
  expect((await fetch(f.url + '/health')).status).toBe(200);
  expect(
    (await fetch(f.url + '/api/jobs', { headers: { Authorization: `Bearer ${operator}` } })).status
  ).toBe(200);
});
it('requires explicit operator login and ignores forwarded identities', async () => {
  const f = await fixture();
  expect((await f.login(reader)).status).toBe(401);
  expect(
    (
      await fetch(f.url + '/api/jobs', {
        headers: {
          'Remote-User': 'owner',
          'X-Forwarded-User': 'owner',
          'X-Forwarded-Groups': 'operator',
        },
      })
    ).status
  ).toBe(401);
  expect((await f.login(operator, { Origin: 'https://untrusted.invalid' })).status).toBe(403);
  const response = await f.login();
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie')!;
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).toContain('Path=/api');
  expect(cookie).not.toContain(operator);
  const state = await response.json();
  expect(state.principal).toEqual({ id: 'owner', role: 'operator' });
  expect(JSON.stringify(f.audit.mock.calls)).not.toContain(operator);
});
it('enforces CSRF/origin, rotates sessions, expires them, and does not fall back from bad bearer to cookie', async () => {
  const f = await fixture();
  const login = await f.login();
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const state = await login.json();
  expect(
    (await fetch(f.url + '/api/jobs', { method: 'POST', headers: { Cookie: cookie } })).status
  ).toBe(403);
  expect(
    (
      await fetch(f.url + '/api/jobs', {
        method: 'POST',
        headers: { Cookie: cookie, Origin: origin, 'X-CSRF-Token': state.csrf },
      })
    ).status
  ).toBe(200);
  expect(
    (
      await fetch(f.url + '/api/jobs', {
        headers: { Cookie: cookie, Authorization: 'Bearer wrong' },
      })
    ).status
  ).toBe(401);
  expect(
    (
      await fetch(f.url + '/api/jobs', {
        headers: { Cookie: cookie, Origin: 'https://untrusted.invalid' },
      })
    ).status
  ).toBe(403);
  const rotated = await f.login(operator, { Cookie: cookie });
  const nextCookie = rotated.headers.get('set-cookie')!.split(';')[0];
  expect(nextCookie).not.toBe(cookie);
  expect((await fetch(f.url + '/api/jobs', { headers: { Cookie: cookie } })).status).toBe(401);
  f.advance();
  expect((await fetch(f.url + '/api/jobs', { headers: { Cookie: nextCookie } })).status).toBe(401);
  expect(
    await (await fetch(f.url + '/api/auth/session', { headers: { Cookie: nextCookie } })).json()
  ).toEqual({ mode: 'enforced', authenticated: false });
});
it('logout revokes the session and ends its SSE stream', async () => {
  const f = await fixture();
  const login = await f.login();
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const state = await login.json();
  const stream = await fetch(f.url + '/api/job-events/stream', { headers: { Cookie: cookie } });
  const body = stream.body!.getReader();
  await body.read();
  const headers = { Cookie: cookie, Origin: origin, 'X-CSRF-Token': state.csrf };
  expect((await fetch(f.url + '/api/auth/logout', { method: 'POST', headers })).status).toBe(204);
  expect((await body.read()).done).toBe(true);
  expect((await fetch(f.url + '/api/jobs', { headers: { Cookie: cookie } })).status).toBe(401);
});
it('bounds login attempts without echoing secrets', async () => {
  const f = await fixture();
  for (let i = 0; i < 5; i++) expect((await f.login('wrong')).status).toBe(401);
  expect((await f.login()).status).toBe(429);
  expect(JSON.stringify(f.audit.mock.calls)).not.toContain('wrong');
});
it('allows legacy UI only with machine access disabled and rejects unsafe/obsolete configuration', async () => {
  const f = await fixture('legacy');
  expect((await fetch(f.url + '/api/jobs', { method: 'POST' })).status).toBe(200);
  const base = {
    ACTUAL_SERVER_URL: 'http://fixture.invalid',
    ACTUAL_PASSWORD: 'fixture',
    ACTUAL_BUDGET_ID: '00000000-0000-4000-8000-000000000001',
  };
  expect(envSchema.parse(base).MACHINE_API_ENABLED).toBe(false);
  expect(envSchema.safeParse({ ...base, MACHINE_API_ENABLED: 'true' }).success).toBe(false);
  expect(envSchema.safeParse({ ...base, INTEGRATIONS_ENABLED: 'true' }).success).toBe(false);
  const enforced = {
    ...base,
    NODE_ENV: 'production',
    AUTH_MODE: 'enforced',
    MACHINE_API_ENABLED: 'true',
    AUTH_ALLOWED_ORIGINS: origin,
    AUTH_CREDENTIALS_JSON: JSON.stringify(credentials),
  };
  expect(envSchema.safeParse(enforced).success).toBe(true);
  for (const change of [
    { AUTH_COOKIE_SECURE: 'false' },
    { AUTH_ALLOWED_ORIGINS: 'http://fixture.invalid' },
    { AUTH_CREDENTIALS_JSON: '[]' },
    { AUTH_CREDENTIALS_JSON: JSON.stringify([credentials[1]]) },
    { AUTH_CREDENTIALS_JSON: JSON.stringify([credentials[0], credentials[0]]) },
  ])
    expect(envSchema.safeParse({ ...enforced, ...change }).success).toBe(false);
});

it('redacts malformed and oversized login bodies before invoking authentication', async () => {
  const f = await fixture();
  for (const body of [
    '{"token":"PRIVATE_FIXTURE",',
    JSON.stringify({ token: 'PRIVATE_FIXTURE'.repeat(300) }),
  ]) {
    const result = await fetch(f.url + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body,
    });
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: 'INVALID_REQUEST' });
  }
  expect(f.audit).not.toHaveBeenCalled();
});
it('attributes operator work and isolates concurrent request contexts', async () => {
  const f = await fixture();
  await fetch(f.url + '/api/jobs', { headers: { Authorization: `Bearer ${operator}` } });
  expect(f.legacyOperation).toHaveBeenCalledWith({ fixture: true, principalId: 'owner' });
  const values = await Promise.all(
    ['first', 'second'].map((principalId) =>
      requestContext.run({ principalId }, async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return attributedMetadata({ principalId: 'untrusted', operation: 'fixture' });
      })
    )
  );
  expect(values).toEqual([
    { principalId: 'first', operation: 'fixture' },
    { principalId: 'second', operation: 'fixture' },
  ]);
  expect(requestContext.getStore()).toBeUndefined();
  expect(attributedMetadata({ operation: 'scheduled' })).toEqual({ operation: 'scheduled' });
});
