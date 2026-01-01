/**
 * API client for backend communication
 * P5 (Separation of concerns): Centralized API calls
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export interface Budget {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  groupName?: string;
}

export interface CategoryTemplateSummary {
  id: string;
  name: string;
  groupName: string;
  templates: Record<string, unknown>[];
  renderedNote: string;
  note: string | null;
  source: string | null;
  parseError: string | null;
}

export interface ScheduleSummary {
  id: string;
  name: string;
}

export interface Payee {
  id: string;
  name: string;
}

export interface UncategorizedTransaction {
  id: string;
  accountId: string;
  accountName: string | null;
  date: string;
  payeeId: string | null;
  payeeName: string | null;
  notes: string | null;
  categoryId: string | null;
  categoryName: string | null;
  amount: number;
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

/** Approved change ready to apply */
export interface ApprovedChange {
  suggestionId: string;
  transactionId: string;
  proposedCategoryId: string;
  currentCategoryId: string | null;
  transactionPayee: string | null;
  transactionDate: string | null;
  transactionAmount: number | null;
  transactionAccountName: string | null;
  proposedCategoryName: string | null;
  currentCategoryName: string | null;
  proposedPayeeName: string | null;
  hasPayeeChange: boolean;
}

/** Audit event from backend */
export interface AuditEvent {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export type JobType =
  | 'budget_sync'
  | 'suggestions_generate'
  | 'sync_and_suggest'
  | 'suggestions_retry_payee'
  | 'suggestions_apply'
  | 'templates_apply'
  | 'snapshot_create'
  | 'snapshot_redownload'
  | 'scheduled_sync_and_suggest';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface Job {
  id: string;
  budgetId: string;
  type: JobType;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  parentJobId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface JobStep {
  id: string;
  jobId: string;
  stepType: 'sync' | 'suggestions';
  status: JobStatus;
  position: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
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
   * Get all categories from the current budget
   */
  async getCategories(): Promise<{ categories: Category[] }> {
    const response = await fetch(`${API_BASE}/budgets/categories`);

    if (!response.ok) {
      throw new Error('Failed to get categories');
    }

    return response.json();
  },

  /**
   * List category goal templates parsed from notes
   */
  async listCategoryTemplates(): Promise<{ templates: CategoryTemplateSummary[] }> {
    const response = await fetch(`${API_BASE}/budgets/templates`);

    if (!response.ok) {
      throw new Error('Failed to get templates');
    }

    return response.json();
  },

  /**
   * List schedule names for template suggestions
   */
  async listSchedules(): Promise<{ schedules: ScheduleSummary[] }> {
    const response = await fetch(`${API_BASE}/budgets/schedules`);

    if (!response.ok) {
      throw new Error('Failed to get schedules');
    }

    return response.json();
  },

  /**
   * Render template objects into note strings
   */
  async renderNoteTemplates(templates: Record<string, unknown>[]): Promise<{ rendered: string }> {
    const response = await fetch(`${API_BASE}/budgets/templates/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates }),
    });

    if (!response.ok) {
      throw new Error('Failed to render templates');
    }

    return response.json();
  },

  /**
   * Apply rendered note to category and optionally sync
   */
  async applyCategoryNote(
    categoryId: string,
    note: string | null,
    sync: boolean,
    budgetId?: string
  ): Promise<{
    check: { message: string; pre?: string | null };
    synced: boolean;
    rolledBack: boolean;
    job: Job | null;
  }> {
    const response = await fetch(`${API_BASE}/budgets/templates/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId, note, sync, budgetId }),
    });

    if (!response.ok) {
      throw new Error('Failed to apply template notes');
    }

    return response.json();
  },

  /**
   * Create a new budget snapshot
   */
  async createSnapshotJob(budgetId: string) {
    const response = await fetch(`${API_BASE}/jobs/snapshot-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId }),
    });

    if (!response.ok) {
      throw new Error('Failed to create snapshot job');
    }

    return response.json();
  },

  /**
   * Generate AI suggestions
   */
  async generateSuggestions(
    budgetId: string,
    _maxSuggestions?: number
  ): Promise<{ job: Job; steps: JobStep[] }> {
    const response = await fetch(`${API_BASE}/jobs/suggestions-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId }),
    });

    if (!response.ok) {
      throw new Error('Failed to create suggestions job');
    }

    return response.json();
  },

  /**
   * Sync and generate suggestions (diff-based)
   * T082: POST /suggestions/sync-and-generate
   */
  async syncAndGenerateSuggestions(
    budgetId: string,
    fullSnapshot = false
  ): Promise<{ job: Job; steps: JobStep[] }> {
    const response = await fetch(`${API_BASE}/jobs/sync-and-suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId, fullResync: fullSnapshot }),
    });

    if (!response.ok) {
      throw new Error('Failed to create sync and suggest job');
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
   * Get uncategorized transactions for a budget
   */
  async getUncategorizedTransactions(
    budgetId: string
  ): Promise<{ transactions: UncategorizedTransaction[] }> {
    const response = await fetch(`${API_BASE}/suggestions/uncategorized?budgetId=${budgetId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch uncategorized transactions');
    }

    return response.json();
  },

  /**
   * List jobs for a budget
   */
  async listJobs(params: {
    budgetId: string;
    type?: JobType;
    status?: JobStatus;
    limit?: number;
  }): Promise<{ jobs: Job[] }> {
    const query = new URLSearchParams({ budgetId: params.budgetId });
    if (params.type) query.set('type', params.type);
    if (params.status) query.set('status', params.status);
    if (params.limit) query.set('limit', String(params.limit));

    const response = await fetch(`${API_BASE}/jobs?${query.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to list jobs');
    }

    return response.json();
  },

  /**
   * Create a sync job
   */
  async createSyncJob(budgetId: string): Promise<{ job: Job; steps: JobStep[] }> {
    const response = await fetch(`${API_BASE}/jobs/budget-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId }),
    });

    if (!response.ok) {
      throw new Error('Failed to create sync job');
    }

    return response.json();
  },

  /**
   * Create a suggestions generation job
   */
  async createSuggestionsJob(budgetId: string): Promise<{ job: Job; steps: JobStep[] }> {
    const response = await fetch(`${API_BASE}/jobs/suggestions-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId }),
    });

    if (!response.ok) {
      throw new Error('Failed to create suggestions job');
    }

    return response.json();
  },

  /**
   * Create a combined sync and generate job
   */
  async createSyncAndGenerateJob(
    budgetId: string,
    fullResync = false
  ): Promise<{ job: Job; steps: JobStep[] }> {
    const response = await fetch(`${API_BASE}/jobs/sync-and-suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId, fullResync }),
    });

    if (!response.ok) {
      throw new Error('Failed to create sync and generate job');
    }

    return response.json();
  },

  /**
   * Get job details with steps
   */
  async getJob(jobId: string): Promise<{ job: Job; steps: JobStep[] }> {
    const response = await fetch(`${API_BASE}/jobs/${jobId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch job detail');
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
   * Bulk correct category suggestions and approve them
   */
  async bulkCorrectCategorySuggestions(
    suggestionIds: string[],
    correction: { categoryId: string; categoryName?: string }
  ): Promise<{ corrected: number }> {
    const response = await fetch(`${API_BASE}/suggestions/bulk-correct-category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionIds, ...correction }),
    });

    if (!response.ok) {
      throw new Error('Failed to correct category suggestions');
    }

    return response.json();
  },

  /**
   * Bulk correct payee suggestions and approve them
   */
  async bulkCorrectPayeeSuggestions(
    suggestionIds: string[],
    correction: { payeeId?: string; payeeName: string }
  ): Promise<{ corrected: number }> {
    const response = await fetch(`${API_BASE}/suggestions/bulk-correct-payee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionIds, ...correction }),
    });

    if (!response.ok) {
      throw new Error('Failed to correct payee suggestions');
    }

    return response.json();
  },

  /**
   * Reset a suggestion back to pending (undo approve/reject)
   */
  async resetSuggestion(suggestionId: string) {
    const response = await fetch(`${API_BASE}/suggestions/${suggestionId}/reset`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to reset suggestion');
    }

    return response.json();
  },

  /**
   * Bulk reset suggestions back to pending
   */
  async bulkResetSuggestions(suggestionIds: string[]): Promise<{ reset: number }> {
    const response = await fetch(`${API_BASE}/suggestions/bulk-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionIds }),
    });

    if (!response.ok) {
      throw new Error('Failed to bulk reset suggestions');
    }

    return response.json();
  },

  /**
   * Get approved suggestions ready to apply
   */
  async getApprovedChanges(budgetId: string): Promise<{ changes: ApprovedChange[] }> {
    const response = await fetch(`${API_BASE}/sync/pending?budgetId=${budgetId}`);

    if (!response.ok) {
      throw new Error('Failed to get approved changes');
    }

    return response.json();
  },

  /**
   * Apply specific suggestions
   */
  async applySuggestions(
    budgetId: string,
    suggestionIds: string[]
  ): Promise<{ job: Job; steps: JobStep[] }> {
    const response = await fetch(`${API_BASE}/jobs/suggestions-apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId, suggestionIds }),
    });

    if (!response.ok) {
      throw new Error('Failed to create apply suggestions job');
    }

    return response.json();
  },

  /**
   * Retry LLM suggestion for better result
   * Retries all suggestions in the same payee group
   */
  async retrySuggestion(
    budgetId: string,
    suggestionId: string
  ): Promise<{ job: Job; steps: JobStep[] }> {
    const response = await fetch(`${API_BASE}/jobs/suggestions-retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId, suggestionId }),
    });

    if (!response.ok) {
      throw new Error('Failed to create retry suggestion job');
    }

    return response.json();
  },

  /**
   * Redownload snapshot
   */
  async redownloadSnapshotJob(budgetId: string) {
    const response = await fetch(`${API_BASE}/jobs/snapshot-redownload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetId }),
    });

    if (!response.ok) {
      throw new Error('Failed to create snapshot redownload job');
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

  /**
   * Get audit events
   */
  async getAuditEvents(limit = 200): Promise<{ events: AuditEvent[] }> {
    const response = await fetch(`${API_BASE}/audit?limit=${limit}`);

    if (!response.ok) {
      throw new Error('Failed to fetch audit events');
    }

    return response.json();
  },
};
