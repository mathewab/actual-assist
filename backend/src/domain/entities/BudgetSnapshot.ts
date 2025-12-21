/**
 * Transaction entity - represents an Actual Budget transaction
 * P1 (Single Responsibility): Pure data structure, no business logic
 */
export interface Transaction {
  id: string;
  accountId: string;
  date: string; // ISO 8601 date
  payeeId: string | null;
  payeeName: string | null;
  notes: string | null;
  categoryId: string | null;
  categoryName: string | null;
  amount: number; // In cents (Actual Budget format)
  cleared: boolean;
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
 * BudgetSnapshot entity - immutable snapshot of budget state at a point in time
 * Follows P1 (modularity) - self-contained representation of budget data
 */
export interface BudgetSnapshot {
  id: string; // UUID v4
  budgetId: string; // Actual Budget ID
  syncId: string | null; // Actual Budget sync ID
  transactions: Transaction[];
  categories: Category[];
  createdAt: Date;
}

/**
 * Factory function to create a new BudgetSnapshot
 * P4 (Explicitness): All fields explicitly provided
 */
export function createBudgetSnapshot(params: {
  budgetId: string;
  syncId: string | null;
  transactions: Transaction[];
  categories: Category[];
}): BudgetSnapshot {
  return {
    id: crypto.randomUUID(),
    budgetId: params.budgetId,
    syncId: params.syncId,
    transactions: params.transactions,
    categories: params.categories,
    createdAt: new Date(),
  };
}
