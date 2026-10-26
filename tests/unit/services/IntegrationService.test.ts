import { describe, expect, it, vi } from 'vitest';
import { IntegrationService } from '../../../src/services/IntegrationService.js';
import type { Job } from '../../../src/domain/entities/Job.js';
import { envSchema } from '../../../src/infra/env.js';

describe('integration configuration and draining', () => {
  it('defaults machine access off and rejects obsolete activation', () => {
    const base = {
      ACTUAL_SERVER_URL: 'https://fixture.invalid',
      ACTUAL_PASSWORD: 'fixture',
      ACTUAL_BUDGET_ID: '00000000-0000-4000-8000-000000000000',
    };
    expect(envSchema.parse(base).MACHINE_API_ENABLED).toBe(false);
    expect(envSchema.safeParse({ ...base, INTEGRATIONS_ENABLED: 'true' }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, MACHINE_API_ENABLED: 'true' }).success).toBe(false);
  });
  it('bounds pending reads and waits for job/audit completion during shutdown', async () => {
    let release!: (rows: never[]) => void;
    const gate = new Promise<never[]>((resolve) => {
      release = resolve;
    });
    const budget = {
      isInitialized: () => true,
      getAccounts: () => gate,
      getCategories: async () => [],
      getPayees: async () => [],
      getSchedules: async () => [],
      getAccountTransactions: async () => [],
    };
    const audit = { log: vi.fn() };
    const jobs = {
      createJob: () => ({ id: 'fixture' }) as Job,
      markJobRunning: vi.fn(),
      markJobSucceeded: vi.fn(),
      markJobFailed: vi.fn(),
    };
    const service = new IntegrationService(budget, audit, jobs, 'fixture');
    const reads = Array.from({ length: 16 }, () => service.read('accounts', {}, 'rest'));
    await expect(service.read('accounts', {}, 'mcp')).rejects.toMatchObject({ code: 'BUSY' });
    service.stop();
    let drained = false;
    const draining = service.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    await expect(service.read('accounts', {}, 'mcp')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    release([]);
    await Promise.all(reads);
    await draining;
    expect(jobs.markJobSucceeded).toHaveBeenCalledTimes(16);
    expect(audit.log).toHaveBeenCalledTimes(16);
  });
});
