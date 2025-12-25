import { describe, it, expect } from 'vitest';
import { createBudgetSnapshot } from '../../../src/domain/entities/BudgetSnapshot.ts';

describe('BudgetSnapshot', () => {
  it('should create a snapshot with required fields', () => {
    const snapshot = createBudgetSnapshot({
      budgetId: 'test-budget-id',
      filepath: '/tmp/budget-test.db',
      transactionCount: 12,
      categoryCount: 4,
      downloadedAt: '2024-01-01T00:00:00.000Z',
    });

    expect(snapshot.budgetId).toBe('test-budget-id');
    expect(snapshot.filepath).toBe('/tmp/budget-test.db');
    expect(snapshot.transactionCount).toBe(12);
    expect(snapshot.categoryCount).toBe(4);
    expect(snapshot.downloadedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('should apply defaults for counts and timestamp', () => {
    const snapshot = createBudgetSnapshot({
      budgetId: 'test-budget-id',
      filepath: '/tmp/budget-default.db',
    });

    expect(snapshot.transactionCount).toBe(0);
    expect(snapshot.categoryCount).toBe(0);
    expect(typeof snapshot.downloadedAt).toBe('string');
  });

  it('should allow zero counts with valid file path', () => {
    const snapshot = createBudgetSnapshot({
      budgetId: 'budget-2',
      filepath: '/tmp/budget-2.db',
      transactionCount: 0,
      categoryCount: 0,
    });

    expect(snapshot.transactionCount).toBe(0);
    expect(snapshot.categoryCount).toBe(0);
  });
});
