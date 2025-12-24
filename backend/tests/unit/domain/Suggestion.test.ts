import { describe, it, expect } from 'vitest';
import { createSuggestion, updateSuggestionStatus } from '../../src/domain/entities/Suggestion.js';

describe('Suggestion', () => {
  it('should create a suggestion with pending status', () => {
    const suggestion = createSuggestion({
      budgetSnapshotId: 'snapshot-1',
      transactionId: 'txn-1',
      suggestedCategoryId: 'cat-1',
      suggestedCategoryName: 'Groceries',
      confidence: 0.85,
      reasoning: 'This transaction is at a grocery store',
    });

    expect(suggestion.id).toBeDefined();
    expect(suggestion.budgetSnapshotId).toBe('snapshot-1');
    expect(suggestion.transactionId).toBe('txn-1');
    expect(suggestion.suggestedCategoryId).toBe('cat-1');
    expect(suggestion.suggestedCategoryName).toBe('Groceries');
    expect(suggestion.confidence).toBe(0.85);
    expect(suggestion.reasoning).toBe('This transaction is at a grocery store');
    expect(suggestion.status).toBe('pending');
    expect(suggestion.createdAt).toBeInstanceOf(Date);
    expect(suggestion.updatedAt).toBeInstanceOf(Date);
  });

  it('should handle null category (uncategorized suggestion)', () => {
    const suggestion = createSuggestion({
      budgetSnapshotId: 'snapshot-1',
      transactionId: 'txn-1',
      suggestedCategoryId: null,
      suggestedCategoryName: null,
      confidence: 0.3,
      reasoning: 'Not enough information to categorize',
    });

    expect(suggestion.suggestedCategoryId).toBeNull();
    expect(suggestion.suggestedCategoryName).toBeNull();
  });

  it('should update suggestion status', () => {
    const suggestion = createSuggestion({
      budgetSnapshotId: 'snapshot-1',
      transactionId: 'txn-1',
      suggestedCategoryId: 'cat-1',
      suggestedCategoryName: 'Groceries',
      confidence: 0.85,
      reasoning: 'Test',
    });

    const approved = updateSuggestionStatus(suggestion, 'approved');

    expect(approved.status).toBe('approved');
    expect(approved.updatedAt.getTime()).toBeGreaterThan(suggestion.createdAt.getTime());
  });

  it('should preserve other fields when updating status', () => {
    const suggestion = createSuggestion({
      budgetSnapshotId: 'snapshot-1',
      transactionId: 'txn-1',
      suggestedCategoryId: 'cat-1',
      suggestedCategoryName: 'Groceries',
      confidence: 0.85,
      reasoning: 'Test',
    });

    const rejected = updateSuggestionStatus(suggestion, 'rejected');

    expect(rejected.id).toBe(suggestion.id);
    expect(rejected.budgetSnapshotId).toBe(suggestion.budgetSnapshotId);
    expect(rejected.transactionId).toBe(suggestion.transactionId);
    expect(rejected.suggestedCategoryId).toBe(suggestion.suggestedCategoryId);
    expect(rejected.confidence).toBe(suggestion.confidence);
  });
});
