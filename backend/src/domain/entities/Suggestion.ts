/**
 * Suggestion entity - AI-generated categorization recommendation
 * P1 (Single Responsibility): Represents a single categorization suggestion
 */
export interface Suggestion {
  id: string; // UUID v4
  budgetId: string; // Actual Budget ID
  transactionId: string;
  transactionAccountId: string | null;
  transactionAccountName: string | null;
  transactionPayee: string | null;
  transactionAmount: number | null;
  transactionDate: string | null;
  currentCategoryId: string | null;
  proposedCategoryId: string;
  proposedCategoryName: string;
  suggestedPayeeName: string | null; // LLM-suggested canonical payee name from fuzzy match
  confidence: number; // 0.0 to 1.0
  rationale: string; // AI explanation
  status: SuggestionStatus;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'applied';

/**
 * Factory function to create a new Suggestion
 * P4 (Explicitness): All fields explicitly provided
 */
export function createSuggestion(params: {
  budgetId: string;
  transactionId: string;
  transactionAccountId?: string | null;
  transactionAccountName?: string | null;
  transactionPayee?: string | null;
  transactionAmount?: number | null;
  transactionDate?: string | null;
  currentCategoryId: string | null;
  proposedCategoryId: string;
  proposedCategoryName: string;
  suggestedPayeeName?: string | null;
  confidence: number;
  rationale: string;
}): Suggestion {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    budgetId: params.budgetId,
    transactionId: params.transactionId,
    transactionAccountId: params.transactionAccountId || null,
    transactionAccountName: params.transactionAccountName || null,
    transactionPayee: params.transactionPayee || null,
    transactionAmount: params.transactionAmount || null,
    transactionDate: params.transactionDate || null,
    currentCategoryId: params.currentCategoryId,
    proposedCategoryId: params.proposedCategoryId,
    proposedCategoryName: params.proposedCategoryName,
    suggestedPayeeName: params.suggestedPayeeName || null,
    confidence: params.confidence,
    rationale: params.rationale,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Validates suggestion confidence is in valid range
 */
export function validateSuggestionConfidence(confidence: number): boolean {
  return confidence >= 0.0 && confidence <= 1.0;
}

/**
 * Transitions suggestion status with validation
 * P2 (Zero Duplication): Single source of truth for status transitions
 */
export function transitionSuggestionStatus(
  suggestion: Suggestion,
  newStatus: SuggestionStatus
): Suggestion {
  // Only allow pending → approved/rejected transitions
  if (suggestion.status === 'pending' && (newStatus === 'approved' || newStatus === 'rejected')) {
    return {
      ...suggestion,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
  }
  
  // Allow applied state after execution
  if (newStatus === 'applied') {
    return {
      ...suggestion,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
  }

  throw new Error(`Invalid status transition from ${suggestion.status} to ${newStatus}`);
}
