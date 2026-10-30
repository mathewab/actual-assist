import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  init: vi.fn(),
  downloadBudget: vi.fn(),
  shutdown: vi.fn(),
  getBudgets: vi.fn(),
  getAccounts: vi.fn(),
  getTransactions: vi.fn(),
  getPayees: vi.fn(),
  getCategories: vi.fn(),
  getCategoryGroups: vi.fn(),
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

it('captures hidden categories and closed-account history without syncing, excluding off-budget accounts', async () => {
  const adapter = new ActualBudgetAdapter(env);
  await adapter.initialize();
  api.getAccounts.mockResolvedValue([
    { id: 'closed', name: 'Closed', closed: true },
    { id: 'off', offbudget: true },
  ]);
  api.getCategories.mockResolvedValue([
    { id: 'hidden', name: 'Hidden income', group_id: 'income', hidden: true },
  ]);
  api.getCategoryGroups.mockResolvedValue([{ id: 'income', is_income: true }]);
  api.getTransactions.mockResolvedValue([
    {
      id: 't',
      date: '2026-09-01',
      amount: 100,
      notes: 'MUST_NOT_LEAVE_CAPTURE',
      category: 'hidden',
    },
  ]);
  const capture = await adapter.captureReport('2026-09');
  expect(capture.categories).toEqual([{ id: 'hidden', name: 'Hidden income', income: true }]);
  expect(capture.accounts).toHaveLength(1);
  expect(api.getTransactions).toHaveBeenCalledWith('closed', '2026-09-01', '2026-09-30');
  expect(JSON.stringify(capture)).not.toContain('MUST_NOT_LEAVE_CAPTURE');
});
