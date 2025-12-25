import { describe, it, expect } from 'vitest';
import { createSuggestion, transitionSuggestionStatus } from '../../../src/domain/entities/Suggestion.ts';

describe('Suggestion', () => {
  it('should create a suggestion with pending status', () => {
    const suggestion = createSuggestion({
      budgetId: 'budget-1',
      transactionId: 'txn-1',
      currentCategoryId: null,
      proposedCategoryId: 'cat-1',
      proposedCategoryName: 'Groceries',
      proposedPayeeName: 'Local Market',
      categoryConfidence: 0.85,
      categoryRationale: 'This transaction is at a grocery store',
    });

    expect(suggestion.id).toBeDefined();
    expect(suggestion.budgetId).toBe('budget-1');
    expect(suggestion.transactionId).toBe('txn-1');
    expect(suggestion.categorySuggestion.proposedCategoryId).toBe('cat-1');
    expect(suggestion.categorySuggestion.proposedCategoryName).toBe('Groceries');
    expect(suggestion.categorySuggestion.confidence).toBe(0.85);
    expect(suggestion.categorySuggestion.rationale).toBe('This transaction is at a grocery store');
    expect(suggestion.status).toBe('pending');
    expect(typeof suggestion.createdAt).toBe('string');
    expect(typeof suggestion.updatedAt).toBe('string');
  });

  it('should handle null category (uncategorized suggestion)', () => {
    const suggestion = createSuggestion({
      budgetId: 'budget-1',
      transactionId: 'txn-1',
      currentCategoryId: null,
      proposedCategoryId: null,
      proposedCategoryName: null,
      categoryConfidence: 0.3,
      categoryRationale: 'Not enough information to categorize',
    });

    expect(suggestion.categorySuggestion.proposedCategoryId).toBeNull();
    expect(suggestion.categorySuggestion.proposedCategoryName).toBeNull();
  });

  it('should update suggestion status', () => {
    const suggestion = createSuggestion({
      budgetId: 'budget-1',
      transactionId: 'txn-1',
      currentCategoryId: null,
      proposedCategoryId: 'cat-1',
      proposedCategoryName: 'Groceries',
      categoryConfidence: 0.85,
      categoryRationale: 'Test',
    });

    const approved = transitionSuggestionStatus(suggestion, 'approved');

    expect(approved.status).toBe('approved');
    expect(approved.categorySuggestion.status).toBe('approved');
  });

  it('should preserve other fields when updating status', () => {
    const suggestion = createSuggestion({
      budgetId: 'budget-1',
      transactionId: 'txn-1',
      currentCategoryId: null,
      proposedCategoryId: 'cat-1',
      proposedCategoryName: 'Groceries',
      categoryConfidence: 0.85,
      categoryRationale: 'Test',
    });

    const rejected = transitionSuggestionStatus(suggestion, 'rejected');

    expect(rejected.id).toBe(suggestion.id);
    expect(rejected.budgetId).toBe(suggestion.budgetId);
    expect(rejected.transactionId).toBe(suggestion.transactionId);
    expect(rejected.categorySuggestion.proposedCategoryId).toBe(
      suggestion.categorySuggestion.proposedCategoryId
    );
    expect(rejected.confidence).toBe(suggestion.confidence);
  });
});
