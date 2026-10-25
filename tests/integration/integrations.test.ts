import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createIntegrationRouter } from '../../src/api/integrationRoutes.js';
import { IntegrationService } from '../../src/services/IntegrationService.js';
import type { Job } from '../../src/domain/entities/Job.js';

const token = 'fixture-only-token-for-isolated-tests';
const headers = { Authorization: `Bearer ${token}` };
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        })
    )
  );
});

function fixture() {
  const budget = {
    isInitialized: vi.fn(() => true),
    getAccounts: vi.fn(async () => [{ id: 'fixture', name: 'Mock account' }]),
    getCategories: vi.fn(async () => []),
    getPayees: vi.fn(async () => []),
    getSchedules: vi.fn(async () => []),
    getAccountTransactions: vi.fn(async () => []),
  };
  const audit = { log: vi.fn() };
  const jobs = {
    createJob: vi.fn(() => ({ id: 'fixture-job' }) as Job),
    markJobRunning: vi.fn(),
    markJobSucceeded: vi.fn(),
    markJobFailed: vi.fn(),
  };
  return {
    budget,
    audit,
    jobs,
    service: new IntegrationService(budget, audit, jobs, 'fixture-budget'),
  };
}
async function start(enabled = true) {
  const f = fixture();
  const app = express();
  app.use(
    '/integrations',
    createIntegrationRouter(f.service, { enabled, token, allowedOrigins: [], version: 'test' })
  );
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  return { ...f, url: `http://127.0.0.1:${address.port}/integrations` };
}

describe('authenticated REST and MCP', () => {
  it('defaults to a disabled, closed surface', async () => {
    const f = await start(false);
    expect((await fetch(`${f.url}/v1/accounts`, { headers })).status).toBe(404);
    expect(f.budget.getAccounts).not.toHaveBeenCalled();
  });
  it('fails closed without an adequate token', () => {
    expect(() =>
      createIntegrationRouter(fixture().service, {
        enabled: true,
        token: 'short',
        allowedOrigins: [],
        version: 'test',
      })
    ).toThrow();
  });
  it('requires bearer authentication for REST, MCP and health', async () => {
    const f = await start();
    for (const path of ['/v1/accounts', '/v1/health', '/mcp']) {
      for (const authorization of ['', 'Bearer wrong', `Basic ${token}`]) {
        expect(
          (await fetch(f.url + path, { headers: { Authorization: authorization } })).status
        ).toBe(401);
      }
    }
    expect(f.jobs.createJob).not.toHaveBeenCalled();
  });
  it('rejects unapproved browser origins and does not emit permissive CORS', async () => {
    const f = await start();
    const result = await fetch(`${f.url}/v1/accounts`, {
      headers: { ...headers, Origin: 'https://evil.invalid' },
    });
    expect(result.status).toBe(403);
    expect(result.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('validates pagination and transaction dates before invoking the budget', async () => {
    const f = await start();
    for (const path of [
      'accounts?limit=501',
      'accounts?offset=-1',
      'accounts?unknown=true',
      'accounts?limit=1&limit=2',
      'transactions',
      'transactions?accountId=00000000-0000-4000-8000-000000000000&startDate=2026-02-30&endDate=2026-03-01',
      'transactions?accountId=00000000-0000-4000-8000-000000000000&startDate=2026-01-01&endDate=2026-12-31',
    ]) {
      expect((await fetch(`${f.url}/v1/${path}`, { headers })).status).toBe(400);
    }
    expect(f.jobs.createJob).not.toHaveBeenCalled();
  });
  it('serves REST reads with audit/jobs without storing financial output', async () => {
    const f = await start();
    const result = await fetch(`${f.url}/v1/accounts?limit=1`, { headers });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      data: [{ id: 'fixture', name: 'Mock account' }],
      pagination: { offset: 0, limit: 1, total: 1 },
      jobId: 'fixture-job',
    });
    expect(f.jobs.markJobSucceeded).toHaveBeenCalledWith('fixture-job');
    expect(JSON.stringify(f.audit.log.mock.calls)).not.toContain('Mock account');
    expect(result.headers.get('cache-control')).toBe('no-store');
  });
  it('supports a real SDK initialize/list/call lifecycle sharing REST semantics', async () => {
    const f = await start();
    const client = new Client({ name: 'fixture-client', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${f.url}/mcp`), { requestInit: { headers } })
    );
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'list_accounts',
      'list_categories',
      'list_payees',
      'list_schedules',
      'list_transactions',
    ]);
    const mcp = await client.callTool({ name: 'list_accounts', arguments: { limit: 1 } });
    const rest = await (await fetch(`${f.url}/v1/accounts?limit=1`, { headers })).json();
    expect(mcp.structuredContent).toEqual(rest);
    const invalid = await client.callTool({ name: 'list_transactions', arguments: {} });
    expect(invalid.isError).toBe(true);
    f.budget.getAccounts.mockRejectedValueOnce(new Error('PRIVATE_CREDENTIAL_AND_RECORD'));
    const failed = await client.callTool({ name: 'list_accounts', arguments: {} });
    expect(failed.isError).toBe(true);
    expect(JSON.stringify(failed)).not.toContain('PRIVATE_CREDENTIAL');
    await client.close();
    expect(f.budget.isInitialized()).toBe(true);
  });
  it('normalizes malformed JSON, oversized input and unsupported MCP methods', async () => {
    const f = await start();
    const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
    expect(
      (await fetch(`${f.url}/mcp`, { method: 'POST', headers: jsonHeaders, body: '{' })).status
    ).toBe(400);
    expect(
      (
        await fetch(`${f.url}/mcp`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ data: 'x'.repeat(40000) }),
        })
      ).status
    ).toBe(413);
    expect((await fetch(`${f.url}/mcp`, { headers })).status).toBe(405);
    expect((await fetch(`${f.url}/mcp`, { method: 'DELETE', headers })).status).toBe(405);
  });
  it('redacts backend failures and rejects reads during shutdown', async () => {
    const f = await start();
    f.budget.getAccounts.mockRejectedValueOnce(new Error('PRIVATE_CREDENTIAL_AND_RECORD'));
    const failure = await fetch(`${f.url}/v1/accounts`, { headers });
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain('PRIVATE_CREDENTIAL');
    expect(f.jobs.markJobFailed).toHaveBeenCalledWith('fixture-job', 'Budget service unavailable');
    f.service.stop();
    expect((await fetch(`${f.url}/v1/health`, { headers })).status).toBe(503);
    expect((await fetch(`${f.url}/v1/accounts`, { headers })).status).toBe(503);
  });
});
