/**
 * API client for backend communication
 * P5 (Separation of concerns): Centralized API calls
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface Budget {
  id: string;
  name: string;
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
  proposedCategoryId: string;
  proposedCategoryName: string;
  confidence: number;
  rationale: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
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
};
