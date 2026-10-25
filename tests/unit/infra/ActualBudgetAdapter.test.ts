import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  init: vi.fn(),
  downloadBudget: vi.fn(),
  shutdown: vi.fn(),
  getBudgets: vi.fn(),
  getAccounts: vi.fn(),
  getTransactions: vi.fn(),
  getPayees: vi.fn(),
}));
vi.mock('@actual-app/api', () => ({ default: api }));
vi.mock('../../../src/infra/logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
import { ActualBudgetAdapter } from '../../../src/infra/ActualBudgetAdapter.js';
import type { Env } from '../../../src/infra/env.js';
const env = {
  ACTUAL_SERVER_URL: 'https://fixture.invalid',
  ACTUAL_PASSWORD: 'fixture',
  ACTUAL_BUDGET_ID: 'fixture-budget',
  DATA_DIR: '/unused-fixture',
} as Env;
beforeEach(() => {
  vi.resetAllMocks();
});

describe('shared Actual adapter lifetime (mock API only)', () => {
  it('initializes once, reuses the budget session when listing and shuts down once', async () => {
    const adapter = new ActualBudgetAdapter(env);
    api.getBudgets.mockResolvedValue([{ id: 'fixture-budget', name: 'Mock budget' }]);
    await Promise.all([adapter.initialize(), adapter.initialize()]);
    expect(api.init).toHaveBeenCalledTimes(1);
    expect(api.downloadBudget).toHaveBeenCalledTimes(1);
    await adapter.listBudgets();
    expect(api.init).toHaveBeenCalledTimes(1);
    expect(api.shutdown).not.toHaveBeenCalled();
    await Promise.all([adapter.shutdown(), adapter.shutdown()]);
    expect(api.shutdown).toHaveBeenCalledTimes(1);
    expect(adapter.isInitialized()).toBe(false);
    await expect(adapter.getAccounts()).rejects.toThrow('shutting down');
  });
  it('serializes new and legacy reads and drains the reader before API shutdown', async () => {
    const adapter = new ActualBudgetAdapter(env);
    await adapter.initialize();
    let release!: (rows: unknown[]) => void;
    api.getAccounts.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    api.getPayees.mockResolvedValue([{ id: 'fixture-payee', name: 'Fixture' }]);
    const accounts = adapter.getAccounts();
    const legacyRead = adapter.findPayeeByName('fixture');
    const shutdown = adapter.shutdown();
    await Promise.resolve();
    expect(api.getPayees).not.toHaveBeenCalled();
    expect(api.shutdown).not.toHaveBeenCalled();
    release([]);
    await accounts;
    await expect(legacyRead).resolves.toEqual({ id: 'fixture-payee', name: 'Fixture' });
    await shutdown;
    expect(api.shutdown).toHaveBeenCalledTimes(1);
  });
  it('passes bounded transaction filters directly to the official API', async () => {
    const adapter = new ActualBudgetAdapter(env);
    await adapter.initialize();
    api.getTransactions.mockResolvedValue([{ id: 'fixture-transaction', amount: 123 }]);
    await expect(
      adapter.getAccountTransactions('fixture-account', '2026-01-01', '2026-01-02')
    ).resolves.toEqual([{ id: 'fixture-transaction', amount: 123 }]);
    expect(api.getTransactions).toHaveBeenCalledWith('fixture-account', '2026-01-01', '2026-01-02');
  });
});
