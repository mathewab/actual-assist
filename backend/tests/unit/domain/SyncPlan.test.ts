import { describe, it, expect } from 'vitest';
import { createSyncPlan } from '../../src/domain/entities/SyncPlan.js';
import { createSuggestion } from '../../src/domain/entities/Suggestion.js';

describe('SyncPlan', () => {
  it('should create sync plan from approved suggestions', () => {
    const suggestions = [
      createSuggestion({
        budgetSnapshotId: 'snapshot-1',
        transactionId: 'txn-1',
        suggestedCategoryId: 'cat-1',
        suggestedCategoryName: 'Groceries',
        confidence: 0.85,
        reasoning: 'Test 1',
      }),
      createSuggestion({
        budgetSnapshotId: 'snapshot-1',
        transactionId: 'txn-2',
        suggestedCategoryId: 'cat-2',
        suggestedCategoryName: 'Gas',
        confidence: 0.9,
        reasoning: 'Test 2',
      }),
    ];

    const syncPlan = createSyncPlan('snapshot-1', suggestions);

    expect(syncPlan.id).toBeDefined();
    expect(syncPlan.budgetSnapshotId).toBe('snapshot-1');
    expect(syncPlan.approvedSuggestions).toEqual(suggestions);
    expect(syncPlan.operations).toHaveLength(2);
    expect(syncPlan.createdAt).toBeInstanceOf(Date);
  });

  it('should create operations with correct structure', () => {
    const suggestion = createSuggestion({
      budgetSnapshotId: 'snapshot-1',
      transactionId: 'txn-1',
      suggestedCategoryId: 'cat-1',
      suggestedCategoryName: 'Groceries',
      confidence: 0.85,
      reasoning: 'Test',
    });

    const syncPlan = createSyncPlan('snapshot-1', [suggestion]);

    expect(syncPlan.operations[0]).toEqual({
      type: 'update_category',
      transactionId: 'txn-1',
      currentCategoryId: null,
      newCategoryId: 'cat-1',
      newCategoryName: 'Groceries',
      suggestionId: suggestion.id,
    });
  });

  it('should handle empty suggestion list', () => {
    const syncPlan = createSyncPlan('snapshot-1', []);

    expect(syncPlan.operations).toHaveLength(0);
    expect(syncPlan.approvedSuggestions).toEqual([]);
  });
});
