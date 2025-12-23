/**
 * Suggestion entity - AI-generated recommendations for transactions
 * Supports independent payee and category suggestions with separate tracking
 * P1 (Single Responsibility): Represents suggestions that can be approved/rejected independently
 */

/** Status for individual suggestion components */
export type SuggestionComponentStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'skipped';

/** Legacy combined status (for backward compatibility) */
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'applied';

/** Type of suggestion (extensible for future types like payee rules) */
export type SuggestionType = 'payee' | 'category' | 'payee_rule';

/**
 * Payee suggestion component
 */
export interface PayeeSuggestion {
  proposedPayeeId: string | null;
  proposedPayeeName: string | null;
  confidence: number;
  rationale: string;
  status: SuggestionComponentStatus;
}

/**
 * Category suggestion component
 */
export interface CategorySuggestion {
  proposedCategoryId: string | null;
  proposedCategoryName: string | null;
  confidence: number;
  rationale: string;
  status: SuggestionComponentStatus;
}

/**
 * Correction data (when user rejects with a correction)
 */
export interface SuggestionCorrection {
  correctedPayeeId: string | null;
  correctedPayeeName: string | null;
  correctedCategoryId: string | null;
  correctedCategoryName: string | null;
}

/**
 * Full Suggestion entity with independent payee and category suggestions
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
  
  // Current state
  currentCategoryId: string | null;
  currentPayeeId: string | null;
  
  // Independent payee suggestion
  payeeSuggestion: PayeeSuggestion;
  
  // Independent category suggestion
  categorySuggestion: CategorySuggestion;
  
  // User corrections (when rejecting with correction)
  correction: SuggestionCorrection;
  
  // Legacy fields for backward compatibility
  /** @deprecated Use payeeSuggestion.proposedPayeeName */
  suggestedPayeeName: string | null;
  /** @deprecated Use Math.max(payeeSuggestion.confidence, categorySuggestion.confidence) */
  confidence: number;
  /** @deprecated Use payeeSuggestion.rationale + categorySuggestion.rationale */
  rationale: string;
  /** @deprecated Computed from payeeSuggestion.status and categorySuggestion.status */
  status: SuggestionStatus;
  /** @deprecated Use categorySuggestion.proposedCategoryId */
  proposedCategoryId: string;
  /** @deprecated Use categorySuggestion.proposedCategoryName */
  proposedCategoryName: string;
  
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}

/**
 * Compute legacy combined status from component statuses
 */
export function computeCombinedStatus(
  payeeStatus: SuggestionComponentStatus,
  categoryStatus: SuggestionComponentStatus
): SuggestionStatus {
  // If both are applied, suggestion is applied
  if (payeeStatus === 'applied' && categoryStatus === 'applied') {
    return 'applied';
  }
  // If both are skipped/approved/applied (no pending/rejected), consider approved
  const nonPending = ['approved', 'applied', 'skipped'];
  if (nonPending.includes(payeeStatus) && nonPending.includes(categoryStatus)) {
    return 'approved';
  }
  // If either is rejected, suggestion is rejected
  if (payeeStatus === 'rejected' || categoryStatus === 'rejected') {
    return 'rejected';
  }
  // Otherwise pending
  return 'pending';
}

/**
 * Compute legacy combined confidence
 */
export function computeCombinedConfidence(
  payeeConfidence: number,
  categoryConfidence: number,
  payeeStatus: SuggestionComponentStatus,
  categoryStatus: SuggestionComponentStatus
): number {
  // If one is skipped, use the other's confidence
  if (payeeStatus === 'skipped') return categoryConfidence;
  if (categoryStatus === 'skipped') return payeeConfidence;
  // Otherwise average
  return (payeeConfidence + categoryConfidence) / 2;
}

/**
 * Compute legacy combined rationale
 */
export function computeCombinedRationale(
  payeeRationale: string | null,
  categoryRationale: string | null,
  payeeStatus: SuggestionComponentStatus,
  categoryStatus: SuggestionComponentStatus
): string {
  const parts: string[] = [];
  if (payeeRationale && payeeStatus !== 'skipped') {
    parts.push(`[Payee] ${payeeRationale}`);
  }
  if (categoryRationale && categoryStatus !== 'skipped') {
    parts.push(`[Category] ${categoryRationale}`);
  }
  return parts.join(' | ') || 'No rationale provided';
}

/**
 * Factory function to create a new Suggestion with independent components
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
  currentPayeeId?: string | null;
  
  // Payee suggestion (optional - can be skipped if no payee change needed)
  proposedPayeeId?: string | null;
  proposedPayeeName?: string | null;
  payeeConfidence?: number;
  payeeRationale?: string;
  payeeStatus?: SuggestionComponentStatus;
  
  // Category suggestion
  proposedCategoryId: string | null;
  proposedCategoryName: string | null;
  categoryConfidence?: number;
  categoryRationale?: string;
  categoryStatus?: SuggestionComponentStatus;
  
  // Legacy compatibility
  suggestedPayeeName?: string | null;
  confidence?: number;
  rationale?: string;
}): Suggestion {
  const now = new Date().toISOString();
  
  // Determine payee suggestion values
  const payeeConfidence = params.payeeConfidence ?? 0;
  const payeeRationale = params.payeeRationale || '';
  const payeeStatus = params.payeeStatus || (params.proposedPayeeName ? 'pending' : 'skipped');
  
  // Determine category suggestion values
  const categoryConfidence = params.categoryConfidence ?? params.confidence ?? 0;
  const categoryRationale = params.categoryRationale || params.rationale || '';
  const categoryStatus = params.categoryStatus || 'pending';
  
  // Build the suggestion
  const suggestion: Suggestion = {
    id: crypto.randomUUID(),
    budgetId: params.budgetId,
    transactionId: params.transactionId,
    transactionAccountId: params.transactionAccountId || null,
    transactionAccountName: params.transactionAccountName || null,
    transactionPayee: params.transactionPayee || null,
    transactionAmount: params.transactionAmount || null,
    transactionDate: params.transactionDate || null,
    currentCategoryId: params.currentCategoryId,
    currentPayeeId: params.currentPayeeId || null,
    
    payeeSuggestion: {
      proposedPayeeId: params.proposedPayeeId || null,
      proposedPayeeName: params.proposedPayeeName || params.suggestedPayeeName || null,
      confidence: payeeConfidence,
      rationale: payeeRationale,
      status: payeeStatus,
    },
    
    categorySuggestion: {
      proposedCategoryId: params.proposedCategoryId,
      proposedCategoryName: params.proposedCategoryName,
      confidence: categoryConfidence,
      rationale: categoryRationale,
      status: categoryStatus,
    },
    
    correction: {
      correctedPayeeId: null,
      correctedPayeeName: null,
      correctedCategoryId: null,
      correctedCategoryName: null,
    },
    
    // Legacy fields
    suggestedPayeeName: params.proposedPayeeName || params.suggestedPayeeName || null,
    confidence: computeCombinedConfidence(payeeConfidence, categoryConfidence, payeeStatus, categoryStatus),
    rationale: computeCombinedRationale(payeeRationale, categoryRationale, payeeStatus, categoryStatus),
    status: computeCombinedStatus(payeeStatus, categoryStatus),
    proposedCategoryId: params.proposedCategoryId || 'unknown',
    proposedCategoryName: params.proposedCategoryName || 'Unknown',
    
    createdAt: now,
    updatedAt: now,
  };
  
  return suggestion;
}

/**
 * Validates suggestion confidence is in valid range
 */
export function validateSuggestionConfidence(confidence: number): boolean {
  return confidence >= 0.0 && confidence <= 1.0;
}

/**
 * Update payee suggestion status
 */
export function updatePayeeSuggestionStatus(
  suggestion: Suggestion,
  newStatus: SuggestionComponentStatus,
  correction?: { payeeId?: string | null; payeeName?: string | null }
): Suggestion {
  const updatedPayee = {
    ...suggestion.payeeSuggestion,
    status: newStatus,
  };
  
  const updatedCorrection = {
    ...suggestion.correction,
    ...(correction && {
      correctedPayeeId: correction.payeeId ?? null,
      correctedPayeeName: correction.payeeName ?? null,
    }),
  };
  
  const newSuggestion = {
    ...suggestion,
    payeeSuggestion: updatedPayee,
    correction: updatedCorrection,
    updatedAt: new Date().toISOString(),
  };
  
  // Update legacy fields
  newSuggestion.status = computeCombinedStatus(
    newSuggestion.payeeSuggestion.status,
    newSuggestion.categorySuggestion.status
  );
  
  return newSuggestion;
}

/**
 * Update category suggestion status
 */
export function updateCategorySuggestionStatus(
  suggestion: Suggestion,
  newStatus: SuggestionComponentStatus,
  correction?: { categoryId?: string | null; categoryName?: string | null }
): Suggestion {
  const updatedCategory = {
    ...suggestion.categorySuggestion,
    status: newStatus,
  };
  
  const updatedCorrection = {
    ...suggestion.correction,
    ...(correction && {
      correctedCategoryId: correction.categoryId ?? null,
      correctedCategoryName: correction.categoryName ?? null,
    }),
  };
  
  const newSuggestion = {
    ...suggestion,
    categorySuggestion: updatedCategory,
    correction: updatedCorrection,
    updatedAt: new Date().toISOString(),
  };
  
  // Update legacy fields
  newSuggestion.status = computeCombinedStatus(
    newSuggestion.payeeSuggestion.status,
    newSuggestion.categorySuggestion.status
  );
  
  return newSuggestion;
}

/**
 * Transitions suggestion status with validation (legacy support)
 * P2 (Zero Duplication): Single source of truth for status transitions
 */
export function transitionSuggestionStatus(
  suggestion: Suggestion,
  newStatus: SuggestionStatus
): Suggestion {
  // Map legacy status to component statuses
  let payeeStatus: SuggestionComponentStatus = suggestion.payeeSuggestion.status;
  let categoryStatus: SuggestionComponentStatus = suggestion.categorySuggestion.status;
  
  if (newStatus === 'approved') {
    if (payeeStatus === 'pending') payeeStatus = 'approved';
    if (categoryStatus === 'pending') categoryStatus = 'approved';
  } else if (newStatus === 'rejected') {
    if (payeeStatus === 'pending') payeeStatus = 'rejected';
    if (categoryStatus === 'pending') categoryStatus = 'rejected';
  } else if (newStatus === 'applied') {
    payeeStatus = 'applied';
    categoryStatus = 'applied';
  }
  
  return {
    ...suggestion,
    payeeSuggestion: { ...suggestion.payeeSuggestion, status: payeeStatus },
    categorySuggestion: { ...suggestion.categorySuggestion, status: categoryStatus },
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Check if suggestion has any pending components
 */
export function hasPendingComponents(suggestion: Suggestion): boolean {
  return (
    suggestion.payeeSuggestion.status === 'pending' ||
    suggestion.categorySuggestion.status === 'pending'
  );
}

/**
 * Get list of pending suggestion types for a suggestion
 */
export function getPendingSuggestionTypes(suggestion: Suggestion): SuggestionType[] {
  const types: SuggestionType[] = [];
  if (suggestion.payeeSuggestion.status === 'pending' && suggestion.payeeSuggestion.proposedPayeeName) {
    types.push('payee');
  }
  if (suggestion.categorySuggestion.status === 'pending') {
    types.push('category');
  }
  return types;
}

