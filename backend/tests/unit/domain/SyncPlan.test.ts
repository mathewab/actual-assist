import { describe, it, expect } from 'vitest';
import { createSyncPlan, createChange } from '../../../src/domain/entities/SyncPlan.js';

describe('SyncPlan', () => {
  it('should create sync plan with changes', () => {
    const changes = [
      createChange({
        transactionId: 'txn-1',
        proposedCategoryId: 'cat-1',
        currentCategoryId: null,
        suggestionId: 'sugg-1',
        transactionPayee: 'Test Payee',
        transactionDate: '2024-01-01',
        transactionAmount: 1000,
        transactionAccountName: 'Checking',
        proposedCategoryName: 'Groceries',
        currentCategoryName: null,
        proposedPayeeName: null,
        hasPayeeChange: false,
      }),
      createChange({
        transactionId: 'txn-2',
        proposedCategoryId: 'cat-2',
        currentCategoryId: 'cat-old',
        suggestionId: 'sugg-2',
        transactionPayee: 'Gas Station',
        transactionDate: '2024-01-02',
        transactionAmount: 5000,
        transactionAccountName: 'Checking',
        proposedCategoryName: 'Gas',
        currentCategoryName: 'Uncategorized',
        proposedPayeeName: 'Shell Gas Station',
        hasPayeeChange: true,
      }),
    ];

    const syncPlan = createSyncPlan('plan-123', 'budget-1', changes);

    expect(syncPlan.id).toBe('plan-123');
    expect(syncPlan.budgetId).toBe('budget-1');
    expect(syncPlan.changes).toHaveLength(2);
    expect(syncPlan.dryRunSummary.totalChanges).toBe(2);
    expect(syncPlan.dryRunSummary.categoryChanges).toBe(2);
    expect(syncPlan.dryRunSummary.payeeChanges).toBe(1);
    expect(syncPlan.createdAt).toBeDefined();
  });

  it('should create change with correct structure and human-readable data', () => {
    const change = createChange({
      transactionId: 'txn-1',
      proposedCategoryId: 'cat-1',
      currentCategoryId: 'cat-old',
      suggestionId: 'sugg-1',
      transactionPayee: 'AMZN*Amazon',
      transactionDate: '2024-01-15',
      transactionAmount: 2500,
      transactionAccountName: 'Credit Card',
      proposedCategoryName: 'Shopping',
      currentCategoryName: 'Uncategorized',
      proposedPayeeName: 'Amazon',
      hasPayeeChange: true,
    });

    expect(change.id).toBeDefined();
    expect(change.transactionId).toBe('txn-1');
    expect(change.proposedCategoryId).toBe('cat-1');
    expect(change.currentCategoryId).toBe('cat-old');
    expect(change.suggestionId).toBe('sugg-1');
    expect(change.transactionPayee).toBe('AMZN*Amazon');
    expect(change.transactionDate).toBe('2024-01-15');
    expect(change.transactionAmount).toBe(2500);
    expect(change.transactionAccountName).toBe('Credit Card');
    expect(change.proposedCategoryName).toBe('Shopping');
    expect(change.currentCategoryName).toBe('Uncategorized');
    expect(change.proposedPayeeName).toBe('Amazon');
    expect(change.hasPayeeChange).toBe(true);
  });

  it('should handle empty changes list', () => {
    const syncPlan = createSyncPlan('plan-123', 'budget-1', []);

    expect(syncPlan.changes).toHaveLength(0);
    expect(syncPlan.dryRunSummary.totalChanges).toBe(0);
    expect(syncPlan.dryRunSummary.categoryChanges).toBe(0);
    expect(syncPlan.dryRunSummary.payeeChanges).toBe(0);
  });

  it('should generate correct impact message', () => {
    const changes = [
      createChange({
        transactionId: 'txn-1',
        proposedCategoryId: 'cat-1',
        currentCategoryId: null,
        transactionPayee: 'Test',
        transactionDate: null,
        transactionAmount: null,
        transactionAccountName: null,
        proposedCategoryName: 'Groceries',
        currentCategoryName: null,
        proposedPayeeName: 'Clean Payee',
        hasPayeeChange: true,
      }),
    ];

    const syncPlan = createSyncPlan('plan-123', 'budget-1', changes);

    expect(syncPlan.dryRunSummary.estimatedImpact).toContain('1 transaction(s)');
    expect(syncPlan.dryRunSummary.estimatedImpact).toContain('1 category');
    expect(syncPlan.dryRunSummary.estimatedImpact).toContain('1 payee');
  });
});
