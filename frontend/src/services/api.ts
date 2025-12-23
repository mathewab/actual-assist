/**
 * API client for backend communication
 * P5 (Separation of concerns): Centralized API calls
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface Budget {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  groupName?: string;
}

export interface Payee {
  id: string;
  name: string;
}

/** Status for individual suggestion components */
export type SuggestionComponentStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'skipped';

/** Legacy combined status */
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'applied';

/** Payee suggestion component */
export interface PayeeSuggestionComponent {
  proposedPayeeId: string | null;
  proposedPayeeName: string | null;
  confidence: number;
  rationale: string;
  status: SuggestionComponentStatus;
}

/** Category suggestion component */
export interface CategorySuggestionComponent {
  proposedCategoryId: string | null;
  proposedCategoryName: string | null;
  confidence: number;
  rationale: string;
  status: SuggestionComponentStatus;
}

/** Correction data */
export interface SuggestionCorrection {
  correctedPayeeId: string | null;
  correctedPayeeName: string | null;
  correctedCategoryId: string | null;
  correctedCategoryName: string | null;
}

export interface Suggestion {
  id: string;
  budgetId: string;
  transactionId: string;
  transactionAccountId: string | null;
  transactionAccountName: string | null;
  transactionPayee: string | null;
  transactionAmount: number | null;
  transactionDate: string | null;
  currentCategoryId: string | null;
  currentPayeeId: string | null;
  
  // Independent suggestion components
  payeeSuggestion: PayeeSuggestionComponent;
  categorySuggestion: CategorySuggestionComponent;
  correction: SuggestionCorrection;
  
  // Legacy fields for backward compatibility
  proposedCategoryId: string;
  proposedCategoryName: string;
  suggestedPayeeName: string | null;
  confidence: number;
  rationale: string;
  status: SuggestionStatus;
  createdAt: string;
}

export interface SyncPlan {
  id: string;
  budgetId: string;
  changes: Array<{
    id: string;
    transactionId: string;
    proposedCategoryId: string;
    currentCategoryId: string | null;
  }>;
  dryRunSummary: {
    totalChanges: number;
    estimatedImpact: string;
  };
  createdAt: string;
}

export const api = {
  /**
   * List available budgets
   * T081: GET /api/budgets
   */
  async listBudgets(): Promise<{ budgets: Budget[] }> {
    const response = await fetch(`${API_BASE}/budgets`);

    if (!response.ok) {
      throw new Error('Failed to list budgets');
    }

    return response.json();
  },

  /**
   * Create a new budget snapshot
   */
  async createSnapshot(budgetId: string, syncId?: string) {
    const response = await fetch(`${API_BASE}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId, syncId }),
    });

    if (!response.ok) {
      throw new Error('Failed to create snapshot');
    }

    return response.json();
  },

  /**
   * Generate AI suggestions
   */
  async generateSuggestions(budgetId: string, maxSuggestions?: number): Promise<{ suggestions: Suggestion[]; total: number }> {
    const response = await fetch(`${API_BASE}/suggestions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId, ...(maxSuggestions && { maxSuggestions }) }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate suggestions');
    }

    return response.json();
  },

  /**
   * Sync and generate suggestions (diff-based)
   * T082: POST /suggestions/sync-and-generate
   */
  async syncAndGenerateSuggestions(budgetId: string, fullSnapshot = false): Promise<{ suggestions: Suggestion[]; total: number; mode: string }> {
    const response = await fetch(`${API_BASE}/suggestions/sync-and-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId, fullSnapshot }),
    });

    if (!response.ok) {
      throw new Error('Failed to sync and generate suggestions');
    }

    return response.json();
  },

  /**
   * Get pending suggestions
   */
  async getPendingSuggestions(): Promise<{ suggestions: Suggestion[] }> {
    const response = await fetch(`${API_BASE}/suggestions/pending`);

    if (!response.ok) {
      throw new Error('Failed to fetch pending suggestions');
    }

    return response.json();
  },

  /**
   * Get suggestions by budget ID
   */
  async getSuggestionsByBudgetId(budgetId: string): Promise<{ suggestions: Suggestion[] }> {
    const response = await fetch(`${API_BASE}/suggestions?budgetId=${budgetId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch suggestions');
    }

    return response.json();
  },

  /**
   * Approve a suggestion
   */
  async approveSuggestion(suggestionId: string) {
    const response = await fetch(`${API_BASE}/suggestions/${suggestionId}/approve`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to approve suggestion');
    }

    return response.json();
  },

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(suggestionId: string) {
    const response = await fetch(`${API_BASE}/suggestions/${suggestionId}/reject`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to reject suggestion');
    }

    return response.json();
  },

  /**
   * Approve only the payee suggestion
   */
  async approvePayeeSuggestion(suggestionId: string) {
    const response = await fetch(`${API_BASE}/suggestions/${suggestionId}/approve-payee`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to approve payee suggestion');
    }

    return response.json();
  },

  /**
   * Approve only the category suggestion
   */
  async approveCategorySuggestion(suggestionId: string) {
    const response = await fetch(`${API_BASE}/suggestions/${suggestionId}/approve-category`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to approve category suggestion');
    }

    return response.json();
  },

  /**
   * Reject payee suggestion with optional correction
   */
  async rejectPayeeSuggestion(
    suggestionId: string, 
    correction?: { payeeId?: string; payeeName?: string }
  ) {
    const response = await fetch(`${API_BASE}/suggestions/${suggestionId}/reject-payee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(correction || {}),
    });

    if (!response.ok) {
      throw new Error('Failed to reject payee suggestion');
    }

    return response.json();
  },

  /**
   * Reject category suggestion with optional correction
   */
  async rejectCategorySuggestion(
    suggestionId: string,
    correction?: { categoryId?: string; categoryName?: string }
  ) {
    const response = await fetch(`${API_BASE}/suggestions/${suggestionId}/reject-category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(correction || {}),
    });

    if (!response.ok) {
      throw new Error('Failed to reject category suggestion');
    }

    return response.json();
  },

  /**
   * Build a sync plan
   */
  async buildSyncPlan(budgetId: string): Promise<SyncPlan> {
    const response = await fetch(`${API_BASE}/sync/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId }),
    });

    if (!response.ok) {
      throw new Error('Failed to build sync plan');
    }

    return response.json();
  },

  /**
   * Execute a sync plan
   */
  async executeSyncPlan(budgetId: string) {
    const response = await fetch(`${API_BASE}/sync/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId }),
    });

    if (!response.ok) {
      throw new Error('Failed to execute sync plan');
    }

    return response.json();
  },

  /**
   * Bulk approve multiple suggestions
   */
  async bulkApproveSuggestions(suggestionIds: string[]): Promise<{ approved: number }> {
    const response = await fetch(`${API_BASE}/suggestions/bulk-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionIds }),
    });

    if (!response.ok) {
      throw new Error('Failed to bulk approve suggestions');
    }

    return response.json();
  },

  /**
   * Bulk reject multiple suggestions
   */
  async bulkRejectSuggestions(suggestionIds: string[]): Promise<{ rejected: number }> {
    const response = await fetch(`${API_BASE}/suggestions/bulk-reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionIds }),
    });

    if (!response.ok) {
      throw new Error('Failed to bulk reject suggestions');
    }

    return response.json();
  },
};
