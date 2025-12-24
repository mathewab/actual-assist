/**
 * Transaction entity - represents an Actual Budget transaction
 * P1 (Single Responsibility): Pure data structure, no business logic
 */
export interface Transaction {
  id: string;
  accountId: string;
  accountName: string | null;
  date: string; // ISO 8601 date
  payeeId: string | null;
  payeeName: string | null;
  notes: string | null;
  categoryId: string | null;
  categoryName: string | null;
  amount: number; // In cents (Actual Budget format)
  cleared: boolean;
  isTransfer: boolean;
}

/**
 * Category entity - represents an Actual Budget category
 */
export interface Category {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  isIncome: boolean;
  hidden: boolean;
}

/**
 * BudgetSnapshot: Immutable reference to the currently active downloaded Actual budget file
 * Single snapshot per session, replaced only on explicit user re-download following drift/sync warnings
 */
export interface BudgetSnapshot {
  budgetId: string; // Actual budget ID from server - primary identifier
  filepath: string; // Local path to cached budget file
  downloadedAt: string; // ISO 8601 timestamp - audit only
  transactionCount: number; // Total transactions in snapshot
  categoryCount: number; // Total categories available
}

/**
 * Validates BudgetSnapshot data according to data-model.md rules
 */
export function validateBudgetSnapshot(
  snapshot: Partial<BudgetSnapshot>
): snapshot is BudgetSnapshot {
  // budgetId must be non-empty string
  if (
    !snapshot.budgetId ||
    typeof snapshot.budgetId !== 'string' ||
    snapshot.budgetId.trim() === ''
  ) {
    throw new Error('BudgetSnapshot: budgetId must be a non-empty string');
  }

  // filepath required
  if (!snapshot.filepath || typeof snapshot.filepath !== 'string') {
    throw new Error('BudgetSnapshot: filepath must be a non-empty string');
  }

  // downloadedAt must not be future date
  if (!snapshot.downloadedAt || typeof snapshot.downloadedAt !== 'string') {
    throw new Error('BudgetSnapshot: downloadedAt must be valid ISO 8601 timestamp');
  }

  const downloadedTime = new Date(snapshot.downloadedAt).getTime();
  const now = Date.now();
  if (downloadedTime > now) {
    throw new Error('BudgetSnapshot: downloadedAt must not be in the future');
  }

  // transactionCount must be non-negative
  if (typeof snapshot.transactionCount !== 'number' || snapshot.transactionCount < 0) {
    throw new Error('BudgetSnapshot: transactionCount must be non-negative number');
  }

  // categoryCount must be non-negative
  if (typeof snapshot.categoryCount !== 'number' || snapshot.categoryCount < 0) {
    throw new Error('BudgetSnapshot: categoryCount must be non-negative number');
  }

  return true;
}

/**
 * Create a new BudgetSnapshot with validation
 */
export function createBudgetSnapshot(params: {
  budgetId: string;
  filepath: string;
  transactionCount?: number;
  categoryCount?: number;
  downloadedAt?: string;
}): BudgetSnapshot {
  const snapshot = {
    budgetId: params.budgetId,
    filepath: params.filepath,
    downloadedAt: params.downloadedAt || new Date().toISOString(),
    transactionCount: params.transactionCount || 0,
    categoryCount: params.categoryCount || 0,
  };

  validateBudgetSnapshot(snapshot);
  return snapshot;
}
