import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type Suggestion,
  type SuggestionComponentStatus,
  type Category,
} from '../services/api';
import { ProgressBar } from './ProgressBar';
import './SuggestionList.css';

interface SuggestionListProps {
  budgetId: string;
}

/** Group of suggestions for a single payee */
interface PayeeGroup {
  payeeName: string;
  suggestedPayeeName: string | null;
  suggestions: Suggestion[];
  pendingCount: number;
  proposedCategory: string;
  proposedCategoryId: string;
  avgConfidence: number;
  payeeConfidence: number;
  categoryConfidence: number;
  payeeRationale: string;
  categoryRationale: string;
  hasPayeeSuggestion: boolean;
  payeeStatus: SuggestionComponentStatus;
  categoryStatus: SuggestionComponentStatus;
}

/** Correction modal state */
interface CorrectionModalState {
  isOpen: boolean;
  type: 'payee' | 'category';
  suggestionIds: string[];
  currentValue: string;
}

export function SuggestionList({ budgetId }: SuggestionListProps) {
  const queryClient = useQueryClient();
  const [expandedPayees, setExpandedPayees] = useState<Set<string>>(new Set());
  const [correctionModal, setCorrectionModal] = useState<CorrectionModalState | null>(null);
  const [correctionInput, setCorrectionInput] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['suggestions', budgetId],
    queryFn: () => api.getSuggestionsByBudgetId(budgetId),
    enabled: !!budgetId,
  });

  // Fetch categories for the dropdown
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  });

  const categories = categoriesData?.categories || [];

  // Group categories by group name for better UX
  const groupedCategories = categories.reduce(
    (acc, cat) => {
      const group = cat.groupName || 'Uncategorized';
      if (!acc[group]) acc[group] = [];
      acc[group].push(cat);
      return acc;
    },
    {} as Record<string, Category[]>
  );

  const syncAndGenerateMutation = useMutation({
    mutationFn: () => api.syncAndGenerateSuggestions(budgetId, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions', budgetId] });
    },
  });

  const fullResyncMutation = useMutation({
    mutationFn: () => api.syncAndGenerateSuggestions(budgetId, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions', budgetId] });
    },
  });

  const correctPayeeMutation = useMutation({
    mutationFn: ({ ids, correction }: { ids: string[]; correction: { payeeName: string } }) =>
      api.bulkCorrectPayeeSuggestions(ids, correction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      setCorrectionModal(null);
      setCorrectionInput('');
    },
  });

  const correctCategoryMutation = useMutation({
    mutationFn: ({
      ids,
      correction,
    }: {
      ids: string[];
      correction: { categoryId: string; categoryName?: string };
    }) => api.bulkCorrectCategorySuggestions(ids, correction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      setCorrectionModal(null);
      setCorrectionInput('');
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkApproveSuggestions(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkRejectSuggestions(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const bulkResetMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkResetSuggestions(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const resetSuggestionMutation = useMutation({
    mutationFn: (id: string) => api.resetSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const retrySuggestionMutation = useMutation({
    mutationFn: (id: string) => api.retrySuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const toggleExpanded = (payeeName: string) => {
    setExpandedPayees((prev) => {
      const next = new Set(prev);
      if (next.has(payeeName)) {
        next.delete(payeeName);
      } else {
        next.add(payeeName);
      }
      return next;
    });
  };

  const openCorrectionModal = (
    type: 'payee' | 'category',
    suggestionIds: string[],
    currentValue: string
  ) => {
    setCorrectionModal({ isOpen: true, type, suggestionIds, currentValue });
    setCorrectionInput('');
    setSelectedCategoryId('');
  };

  const handleCorrectionSubmit = () => {
    if (!correctionModal) return;

    if (correctionModal.type === 'payee') {
      if (!correctionInput.trim()) return;
      correctPayeeMutation.mutate({
        ids: correctionModal.suggestionIds,
        correction: { payeeName: correctionInput.trim() },
      });
    } else {
      // For category, use the selected category from dropdown
      if (!selectedCategoryId) return;
      const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
      correctCategoryMutation.mutate({
        ids: correctionModal.suggestionIds,
        correction: {
          categoryId: selectedCategoryId,
          categoryName: selectedCategory?.name,
        },
      });
    }
  };

  if (isLoading) {
    return <div className="loading">Loading suggestions...</div>;
  }

  if (error) {
    return <div className="error">Error loading suggestions: {error.message}</div>;
  }

  // Filter out applied suggestions - they appear in History page
  const suggestions = (data?.suggestions || []).filter((s) => s.status !== 'applied');

  // Group suggestions by payee
  const payeeGroups = groupByPayee(suggestions);

  return (
    <div className="suggestion-list">
      <div className="suggestion-list-header">
        <h2>
          Suggestions ({suggestions.length} transactions, {payeeGroups.length} payees)
        </h2>
        <div className="header-buttons">
          <button
            className="btn btn-sync"
            onClick={() => syncAndGenerateMutation.mutate()}
            disabled={syncAndGenerateMutation.isPending || fullResyncMutation.isPending}
          >
            {syncAndGenerateMutation.isPending ? 'Syncing...' : '🔄 Sync'}
          </button>
          <button
            className="btn btn-resync"
            onClick={() => fullResyncMutation.mutate()}
            disabled={syncAndGenerateMutation.isPending || fullResyncMutation.isPending}
          >
            {fullResyncMutation.isPending ? 'Resyncing...' : '⚠️ Resync'}
          </button>
        </div>
      </div>

      {(syncAndGenerateMutation.isPending || fullResyncMutation.isPending) && (
        <ProgressBar
          message={
            fullResyncMutation.isPending
              ? 'Full resync: downloading and regenerating all suggestions...'
              : 'Syncing transactions and generating AI suggestions...'
          }
        />
      )}

      {retrySuggestionMutation.isPending && (
        <ProgressBar message="Retrying AI suggestion for payee group..." />
      )}

      {(syncAndGenerateMutation.error || fullResyncMutation.error) && (
        <div className="error">
          Sync failed: {(syncAndGenerateMutation.error || fullResyncMutation.error)?.message}
        </div>
      )}

      {payeeGroups.length === 0 ? (
        <div className="empty-state">
          <p>No suggestions available</p>
          <p className="hint">Click &quot;Sync &amp; Generate&quot; to fetch new suggestions</p>
        </div>
      ) : (
        <div className="payee-list">
          {payeeGroups.map((group) => {
            const isExpanded = expandedPayees.has(group.payeeName);
            const pendingIds = group.suggestions
              .filter((s) => s.status === 'pending')
              .map((s) => s.id);
            const pendingCategoryIds = group.suggestions
              .filter((s) => s.categorySuggestion.status === 'pending')
              .map((s) => s.id);
            const pendingPayeeIds = group.suggestions
              .filter((s) => s.payeeSuggestion.status === 'pending')
              .map((s) => s.id);
            const processedIds = group.suggestions
              .filter((s) => s.status === 'approved' || s.status === 'rejected')
              .map((s) => s.id);
            const approvedIds = group.suggestions
              .filter((s) => s.status === 'approved')
              .map((s) => s.id);
            const hasPending = pendingIds.length > 0;
            const hasApproved = approvedIds.length > 0;
            const hasProcessed = processedIds.length > 0;
            const firstSuggestion = group.suggestions[0];

            return (
              <div
                key={group.payeeName}
                className={`payee-row ${isExpanded ? 'expanded' : ''} ${hasApproved && !hasPending ? 'all-approved' : ''}`}
              >
                {/* Main row - always visible */}
                <div className="payee-row-main" onClick={() => toggleExpanded(group.payeeName)}>
                  <span className="expand-toggle">{isExpanded ? '▼' : '▶'}</span>

                  <div className="payee-details">
                    <span className="payee-name">{group.payeeName}</span>
                    <span className="payee-count">
                      {group.suggestions.length} txn{group.suggestions.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="payee-chips">
                    {group.hasPayeeSuggestion &&
                      (group.payeeStatus === 'pending' || group.payeeStatus === 'approved') && (
                        <span
                          className={`chip payee-chip ${group.payeeStatus === 'approved' ? 'approved' : ''}`}
                        >
                          → {group.suggestedPayeeName}
                        </span>
                      )}
                    <span
                      className={`chip category-chip ${group.categoryStatus === 'approved' ? 'approved' : ''}`}
                    >
                      {group.proposedCategory}
                    </span>
                    <span
                      className={`chip confidence-chip confidence-${getConfidenceLevel(group.avgConfidence)}`}
                    >
                      {Math.round(group.avgConfidence * 100)}%
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="payee-row-actions">
                    {hasPending && (
                      <button
                        className="approve-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          bulkApproveMutation.mutate(pendingIds);
                        }}
                        disabled={bulkApproveMutation.isPending}
                        title="Approve all suggestions"
                      >
                        ✓ Approve
                      </button>
                    )}
                    {hasProcessed && (
                      <button
                        className="undo-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          bulkResetMutation.mutate(processedIds);
                        }}
                        disabled={bulkResetMutation.isPending}
                        title="Undo approved/rejected suggestions"
                      >
                        ↩ Undo
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded section - reasoning + actions + transactions */}
                {isExpanded && (
                  <div className="payee-expanded">
                    {/* Suggestion details with reasoning */}
                    <div className="suggestion-details">
                      {/* Category suggestion */}
                      {group.categoryStatus === 'pending' && (
                        <div className="suggestion-detail">
                          <div className="detail-header">
                            <span className="detail-label">Category</span>
                            <span className="detail-value">{group.proposedCategory}</span>
                            <span
                              className={`detail-confidence confidence-${getConfidenceLevel(group.categoryConfidence)}`}
                            >
                              {Math.round(group.categoryConfidence * 100)}%
                            </span>
                          </div>
                          <p className="detail-rationale">{group.categoryRationale}</p>
                          <div className="detail-actions">
                            <button
                              className="detail-btn correct"
                              onClick={() =>
                                openCorrectionModal(
                                  'category',
                                  pendingCategoryIds,
                                  group.proposedCategory
                                )
                              }
                            >
                              ✎ Correct
                            </button>
                            <button
                              className="detail-btn retry"
                              onClick={() => retrySuggestionMutation.mutate(firstSuggestion.id)}
                              disabled={retrySuggestionMutation.isPending}
                            >
                              {retrySuggestionMutation.isPending ? '⏳' : '↻'} Retry
                            </button>
                            <button
                              className="detail-btn reject"
                              onClick={() => bulkRejectMutation.mutate(pendingIds)}
                              disabled={bulkRejectMutation.isPending}
                            >
                              ✕ Reject
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Payee suggestion (if different from original) */}
                      {group.hasPayeeSuggestion && group.payeeStatus === 'pending' && (
                        <div className="suggestion-detail">
                          <div className="detail-header">
                            <span className="detail-label">Payee</span>
                            <span className="detail-value">
                              {group.payeeName} → {group.suggestedPayeeName}
                            </span>
                            <span
                              className={`detail-confidence confidence-${getConfidenceLevel(group.payeeConfidence)}`}
                            >
                              {Math.round(group.payeeConfidence * 100)}%
                            </span>
                          </div>
                          <p className="detail-rationale">{group.payeeRationale}</p>
                          <div className="detail-actions">
                            <button
                              className="detail-btn correct"
                              onClick={() =>
                                openCorrectionModal(
                                  'payee',
                                  pendingPayeeIds,
                                  group.suggestedPayeeName || ''
                                )
                              }
                            >
                              ✎ Correct
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Transactions table */}
                    <div className="transactions-section">
                      <table className="compact-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Account</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.suggestions.map((suggestion) => (
                            <tr key={suggestion.id} className={`status-${suggestion.status}`}>
                              <td>{formatDate(suggestion.transactionDate)}</td>
                              <td>{suggestion.transactionAccountName || '—'}</td>
                              <td className="amount">
                                {formatAmount(suggestion.transactionAmount)}
                              </td>
                              <td>
                                <span className={`status-tag status-${suggestion.status}`}>
                                  {suggestion.status}
                                </span>
                              </td>
                              <td className="row-actions">
                                {(suggestion.status === 'approved' ||
                                  suggestion.status === 'rejected') && (
                                  <button
                                    className="btn-sm btn-undo"
                                    onClick={() => resetSuggestionMutation.mutate(suggestion.id)}
                                    disabled={resetSuggestionMutation.isPending}
                                    title="Undo and return to pending"
                                  >
                                    ↩ Undo
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Correction Modal */}
      {correctionModal && (
        <div className="modal-overlay" onClick={() => setCorrectionModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Provide Correct {correctionModal.type === 'payee' ? 'Payee' : 'Category'}</h3>
            <p className="modal-hint">
              Current suggestion: <strong>{correctionModal.currentValue}</strong>
            </p>

            {correctionModal.type === 'payee' ? (
              <input
                type="text"
                className="correction-input"
                placeholder="Enter correct payee name..."
                value={correctionInput}
                onChange={(e) => setCorrectionInput(e.target.value)}
                autoFocus
              />
            ) : (
              <select
                className="correction-select"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                autoFocus
              >
                <option value="">-- Select a category --</option>
                {Object.entries(groupedCategories).map(([groupName, cats]) => (
                  <optgroup key={groupName} label={groupName}>
                    {cats.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setCorrectionModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-reject"
                onClick={handleCorrectionSubmit}
                disabled={
                  correctPayeeMutation.isPending ||
                  correctCategoryMutation.isPending ||
                  (correctionModal.type === 'payee' ? !correctionInput.trim() : !selectedCategoryId)
                }
              >
                Submit Correction
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="legend">
        <span className="legend-item">
          <span className="legend-color confidence-high"></span> ≥80%
        </span>
        <span className="legend-item">
          <span className="legend-color confidence-medium"></span> 50-79%
        </span>
        <span className="legend-item">
          <span className="legend-color confidence-low"></span> &lt;50%
        </span>
        <span className="legend-hint">Click row to expand</span>
      </div>
    </div>
  );
}

/** Group suggestions by payee, sorted by pending transaction count (desc) */
function groupByPayee(suggestions: Suggestion[]): PayeeGroup[] {
  const groups = new Map<string, Suggestion[]>();

  for (const s of suggestions) {
    const payee = s.transactionPayee || 'Unknown';
    const existing = groups.get(payee) || [];
    existing.push(s);
    groups.set(payee, existing);
  }

  const result: PayeeGroup[] = [];
  for (const [payeeName, items] of groups) {
    const pendingItems = items.filter((s) => s.status === 'pending');
    const avgConfidence = items.reduce((sum, s) => sum + s.confidence, 0) / items.length;
    // Use first suggestion's category/rationale as representative
    const first = items[0];

    // Extract independent payee and category data
    const payeeSuggestion = first.payeeSuggestion;
    const categorySuggestion = first.categorySuggestion;

    // Determine if there's a meaningful payee suggestion (different from original)
    const hasPayeeSuggestion = !!(
      payeeSuggestion?.proposedPayeeName && payeeSuggestion.proposedPayeeName !== payeeName
    );

    result.push({
      payeeName,
      suggestedPayeeName: payeeSuggestion?.proposedPayeeName || first.suggestedPayeeName || null,
      suggestions: items.sort(
        (a, b) =>
          new Date(b.transactionDate || 0).getTime() - new Date(a.transactionDate || 0).getTime()
      ),
      pendingCount: pendingItems.length,
      proposedCategory:
        categorySuggestion?.proposedCategoryName || first.proposedCategoryName || 'Unknown',
      proposedCategoryId: categorySuggestion?.proposedCategoryId || first.proposedCategoryId,
      avgConfidence,
      payeeConfidence: payeeSuggestion?.confidence ?? first.confidence,
      categoryConfidence: categorySuggestion?.confidence ?? first.confidence,
      payeeRationale: payeeSuggestion?.rationale || 'No payee change suggested',
      categoryRationale:
        categorySuggestion?.rationale || first.rationale || 'No rationale provided',
      hasPayeeSuggestion,
      payeeStatus: payeeSuggestion?.status || 'skipped',
      categoryStatus: categorySuggestion?.status || 'pending',
    });
  }

  // Sort by pending count descending, then by total count
  return result.sort((a, b) => {
    if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
    return b.suggestions.length - a.suggestions.length;
  });
}

function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  // Actual Budget stores amounts in cents, convert to dollars
  const dollars = amount / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(dollars);
}
