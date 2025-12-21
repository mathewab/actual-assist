import { describe, it, expect } from 'vitest';
import { createBudgetSnapshot } from '../../src/domain/entities/BudgetSnapshot.js';

describe('BudgetSnapshot', () => {
  it('should create a snapshot with generated ID', () => {
    const snapshot = createBudgetSnapshot({
      budgetId: 'test-budget-id',
      syncId: 'test-sync-id',
      transactions: [],
      categories: [],
    });

    expect(snapshot.id).toBeDefined();
    expect(snapshot.budgetId).toBe('test-budget-id');
    expect(snapshot.syncId).toBe('test-sync-id');
    expect(snapshot.transactions).toEqual([]);
    expect(snapshot.categories).toEqual([]);
    expect(snapshot.createdAt).toBeInstanceOf(Date);
  });

  it('should handle null syncId', () => {
    const snapshot = createBudgetSnapshot({
      budgetId: 'test-budget-id',
      syncId: null,
      transactions: [],
      categories: [],
    });

    expect(snapshot.syncId).toBeNull();
  });

  it('should store transactions and categories', () => {
    const transactions = [
      {
        id: 'txn-1',
        accountId: 'acc-1',
        date: '2024-01-01',
        payeeId: 'payee-1',
        payeeName: 'Test Payee',
        notes: null,
        categoryId: null,
        categoryName: null,
        amount: 5000,
        cleared: true,
      },
    ];

    const categories = [
      {
        id: 'cat-1',
        name: 'Groceries',
        groupId: 'group-1',
        groupName: 'Food',
        isIncome: false,
        hidden: false,
      },
    ];

    const snapshot = createBudgetSnapshot({
      budgetId: 'test-budget-id',
      syncId: null,
      transactions,
      categories,
    });

    expect(snapshot.transactions).toEqual(transactions);
    expect(snapshot.categories).toEqual(categories);
  });
});
