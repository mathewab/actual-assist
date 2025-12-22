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
}

/**
 * DryRunSummary - preview of changes without execution
 */
export interface DryRunSummary {
  totalChanges: number;
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

/**
 * Factory function to create a Change
 */
export function createChange(
  transactionId: string,
  proposedCategoryId: string,
  currentCategoryId: string | null,
  suggestionId?: string
): Change {
  return {
    id: crypto.randomUUID(),
    transactionId,
    proposedCategoryId,
    currentCategoryId,
    ...(suggestionId && { suggestionId }),
  };
}

/**
 * Factory function to create a SyncPlan from approved suggestions
 * P2 (Zero Duplication): Single place to convert suggestions to plan
 */
export function createSyncPlan(
  id: string,
  budgetId: string,
  changes: Change[],
  totalApprovedCount: number
): SyncPlan {
  return {
    id,
    budgetId,
    changes,
    dryRunSummary: {
      totalChanges: changes.length,
      estimatedImpact: `${changes.length} transaction(s) will be updated from ${totalApprovedCount} approved suggestion(s)`,
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
