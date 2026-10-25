import { describe, expect, it, vi, beforeEach } from 'vitest';
const cron = vi.hoisted(() => ({ schedule: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('node-cron', () => ({ default: cron }));
vi.mock('../../../src/infra/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
import { startScheduler } from '../../../src/scheduler/SyncScheduler.js';
import { envSchema } from '../../../src/infra/env.js';
import type { JobOrchestrator } from '../../../src/services/JobOrchestrator.js';
const fixture = {
  ACTUAL_SERVER_URL: 'https://fixture.invalid',
  ACTUAL_PASSWORD: 'fixture',
  ACTUAL_BUDGET_ID: '00000000-0000-4000-8000-000000000000',
};
beforeEach(() => vi.clearAllMocks());

describe('optional scheduled sync', () => {
  it('preserves enabled scheduling by default without running a job immediately', () => {
    const env = envSchema.parse(fixture);
    const startJob = vi.fn();
    const jobs = { startScheduledSyncAndSuggestJob: startJob } as unknown as JobOrchestrator;
    expect(env.SCHEDULED_SYNC_ENABLED).toBe(true);
    const scheduler = startScheduler(env, jobs, 'fixture-budget');
    expect(scheduler).not.toBeNull();
    expect(cron.schedule).toHaveBeenCalledOnce();
    expect(startJob).not.toHaveBeenCalled();
    scheduler?.stop();
  });
  it('creates no timer or scheduled work when explicitly disabled', () => {
    const env = envSchema.parse({ ...fixture, SCHEDULED_SYNC_ENABLED: 'false' });
    const startJob = vi.fn();
    const jobs = { startScheduledSyncAndSuggestJob: startJob } as unknown as JobOrchestrator;
    expect(startScheduler(env, jobs, 'fixture-budget')).toBeNull();
    expect(cron.schedule).not.toHaveBeenCalled();
    expect(startJob).not.toHaveBeenCalled();
    expect(envSchema.safeParse({ ...fixture, SCHEDULED_SYNC_ENABLED: 'no' }).success).toBe(false);
  });
});
