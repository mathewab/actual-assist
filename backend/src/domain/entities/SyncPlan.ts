/**
 * Change - atomic operation to apply to Actual Budget
 * P4 (Explicitness): Each change is explicit
 */
export interface Change {
  id: string; // UUID v4
  transactionId: string;
  proposedCategoryId: string;
  currentCategoryId: string | null;
  suggestionId?: string;
  // Human-readable fields for display
  transactionPayee: string | null;
  transactionDate: string | null;
  transactionAmount: number | null;
  transactionAccountName: string | null;
  proposedCategoryName: string | null;
  currentCategoryName: string | null;
  proposedPayeeName: string | null;
  hasPayeeChange: boolean;
}

/**
 * DryRunSummary - preview of changes without execution
 */
export interface DryRunSummary {
  totalChanges: number;
  categoryChanges: number;
  payeeChanges: number;
  estimatedImpact: string; // Human-readable summary
}

/**
 * SyncPlan entity - describes changes to apply to Actual Budget
 * P1 (Single Responsibility): Immutable plan for syncing suggestions
 * Follows "no direct writes" principle - user reviews before execution
 */
export interface SyncPlan {
  id: string; // UUID v4
  budgetId: string; // Actual Budget ID
  changes: Change[];
  dryRunSummary: DryRunSummary;
  createdAt: string; // ISO 8601 timestamp
}

/** Input data for creating a change from a suggestion */
export interface ChangeInput {
  transactionId: string;
  proposedCategoryId: string;
  currentCategoryId: string | null;
  suggestionId?: string;
  transactionPayee: string | null;
  transactionDate: string | null;
  transactionAmount: number | null;
  transactionAccountName: string | null;
  proposedCategoryName: string | null;
  currentCategoryName: string | null;
  proposedPayeeName: string | null;
  hasPayeeChange: boolean;
}

/**
 * Factory function to create a Change
 */
export function createChange(input: ChangeInput): Change {
  return {
    id: crypto.randomUUID(),
    transactionId: input.transactionId,
    proposedCategoryId: input.proposedCategoryId,
    currentCategoryId: input.currentCategoryId,
    suggestionId: input.suggestionId,
    transactionPayee: input.transactionPayee,
    transactionDate: input.transactionDate,
    transactionAmount: input.transactionAmount,
    transactionAccountName: input.transactionAccountName,
    proposedCategoryName: input.proposedCategoryName,
    currentCategoryName: input.currentCategoryName,
    proposedPayeeName: input.proposedPayeeName,
    hasPayeeChange: input.hasPayeeChange,
  };
}

/**
 * Factory function to create a SyncPlan from approved suggestions
 * P2 (Zero Duplication): Single place to convert suggestions to plan
 */
export function createSyncPlan(
  id: string,
  budgetId: string,
  changes: Change[]
): SyncPlan {
  const categoryChanges = changes.filter(c => c.proposedCategoryId).length;
  const payeeChanges = changes.filter(c => c.hasPayeeChange).length;
  
  return {
    id,
    budgetId,
    changes,
    dryRunSummary: {
      totalChanges: changes.length,
      categoryChanges,
      payeeChanges,
      estimatedImpact: `${changes.length} transaction(s) will be updated (${categoryChanges} category, ${payeeChanges} payee changes)`,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Validates that SyncPlan has no duplicate transaction updates
 */
export function validateNoDuplicateChanges(plan: SyncPlan): boolean {
  const transactionIds = new Set<string>();
  for (const change of plan.changes) {
    if (transactionIds.has(change.transactionId)) {
      throw new Error(`Duplicate change detected for transaction ${change.transactionId}`);
    }
    transactionIds.add(change.transactionId);
  }
  return true;
}
