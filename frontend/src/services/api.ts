/**
 * API client for backend communication
 * P5 (Separation of concerns): Centralized API calls
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface Suggestion {
  id: string;
  transactionId: string;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  confidence: number;
  reasoning: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  createdAt: string;
}

export interface SyncPlan {
  id: string;
  snapshotId: string;
  operations: Array<{
    type: 'update_category';
    transactionId: string;
    newCategoryId: string | null;
    newCategoryName: string | null;
  }>;
  createdAt: string;
}

export const api = {
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
   * Get suggestions by snapshot ID
   */
  async getSuggestionsBySnapshot(snapshotId: string): Promise<{ suggestions: Suggestion[] }> {
    const response = await fetch(`${API_BASE}/suggestions?snapshotId=${snapshotId}`);

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
   * Create a sync plan
   */
  async createSyncPlan(snapshotId: string): Promise<SyncPlan> {
    const response = await fetch(`${API_BASE}/sync/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotId }),
    });

    if (!response.ok) {
      throw new Error('Failed to create sync plan');
    }

    return response.json();
  },

  /**
   * Execute a sync plan
   */
  async executeSyncPlan(snapshotId: string) {
    const response = await fetch(`${API_BASE}/sync/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotId }),
    });

    if (!response.ok) {
      throw new Error('Failed to execute sync plan');
    }

    return response.json();
  },
};
