/**
 * Suggestion entity - AI-generated categorization recommendation
 * P1 (Single Responsibility): Represents a single categorization suggestion
 */
export interface Suggestion {
  id: string; // UUID v4
  budgetSnapshotId: string;
  transactionId: string;
  suggestedCategoryId: string | null; // null = uncategorized suggestion
  suggestedCategoryName: string | null;
  confidence: number; // 0.0 to 1.0
  reasoning: string; // AI explanation
  status: SuggestionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'applied';

/**
 * Factory function to create a new Suggestion
 * P4 (Explicitness): All fields explicitly provided
 */
export function createSuggestion(params: {
  budgetSnapshotId: string;
  transactionId: string;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  confidence: number;
  reasoning: string;
}): Suggestion {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    budgetSnapshotId: params.budgetSnapshotId,
    transactionId: params.transactionId,
    suggestedCategoryId: params.suggestedCategoryId,
    suggestedCategoryName: params.suggestedCategoryName,
    confidence: params.confidence,
    reasoning: params.reasoning,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates suggestion status
 * P2 (Zero Duplication): Single source of truth for status transitions
 */
export function updateSuggestionStatus(
  suggestion: Suggestion,
  status: SuggestionStatus
): Suggestion {
  return {
    ...suggestion,
    status,
    updatedAt: new Date(),
  };
}
