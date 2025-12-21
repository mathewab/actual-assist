import type { Suggestion } from './Suggestion.js';

/**
 * SyncPlan entity - describes changes to apply to Actual Budget
 * P1 (Single Responsibility): Immutable plan for syncing suggestions
 * Follows "no direct writes" principle - user reviews before execution
 */
export interface SyncPlan {
  id: string; // UUID v4
  budgetSnapshotId: string;
  approvedSuggestions: Suggestion[];
  operations: SyncOperation[];
  createdAt: Date;
}

/**
 * Atomic operation to apply to Actual Budget
 * P4 (Explicitness): Each operation type is explicit
 */
export interface SyncOperation {
  type: 'update_category';
  transactionId: string;
  currentCategoryId: string | null;
  newCategoryId: string | null;
  newCategoryName: string | null;
  suggestionId: string;
}

/**
 * Factory function to create a SyncPlan from approved suggestions
 * P2 (Zero Duplication): Single place to convert suggestions to operations
 */
export function createSyncPlan(
  budgetSnapshotId: string,
  approvedSuggestions: Suggestion[]
): SyncPlan {
  const operations: SyncOperation[] = approvedSuggestions.map((suggestion) => ({
    type: 'update_category',
    transactionId: suggestion.transactionId,
    currentCategoryId: null, // Will be filled from snapshot during execution
    newCategoryId: suggestion.suggestedCategoryId,
    newCategoryName: suggestion.suggestedCategoryName,
    suggestionId: suggestion.id,
  }));

  return {
    id: crypto.randomUUID(),
    budgetSnapshotId,
    approvedSuggestions,
    operations,
    createdAt: new Date(),
  };
}
