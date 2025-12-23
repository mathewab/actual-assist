import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Suggestion, type SuggestionComponentStatus } from '../services/api';
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
  suggestionId: string;
  currentValue: string;
}

export function SuggestionList({ budgetId }: SuggestionListProps) {
  const queryClient = useQueryClient();
  const [expandedPayees, setExpandedPayees] = useState<Set<string>>(new Set());
  const [correctionModal, setCorrectionModal] = useState<CorrectionModalState | null>(null);
  const [correctionInput, setCorrectionInput] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['suggestions', budgetId],
    queryFn: () => api.getSuggestionsByBudgetId(budgetId),
    enabled: !!budgetId,
  });

  const syncAndGenerateMutation = useMutation({
    mutationFn: () => api.syncAndGenerateSuggestions(budgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions', budgetId] });
    },
  });

  const approvePayeeMutation = useMutation({
    mutationFn: (id: string) => api.approvePayeeSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const approveCategoryMutation = useMutation({
    mutationFn: (id: string) => api.approveCategorySuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const rejectPayeeMutation = useMutation({
    mutationFn: ({ id, correction }: { id: string; correction?: { payeeName?: string } }) => 
      api.rejectPayeeSuggestion(id, correction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      setCorrectionModal(null);
      setCorrectionInput('');
    },
  });

  const rejectCategoryMutation = useMutation({
    mutationFn: ({ id, correction }: { id: string; correction?: { categoryId?: string; categoryName?: string } }) =>
      api.rejectCategorySuggestion(id, correction),
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

  const toggleExpanded = (payeeName: string) => {
    setExpandedPayees(prev => {
      const next = new Set(prev);
      if (next.has(payeeName)) {
        next.delete(payeeName);
      } else {
        next.add(payeeName);
      }
      return next;
    });
  };

  const openCorrectionModal = (type: 'payee' | 'category', suggestionId: string, currentValue: string) => {
    setCorrectionModal({ isOpen: true, type, suggestionId, currentValue });
    setCorrectionInput('');
  };

  const handleCorrectionSubmit = () => {
    if (!correctionModal) return;
    
    if (correctionModal.type === 'payee') {
      rejectPayeeMutation.mutate({
        id: correctionModal.suggestionId,
        correction: correctionInput ? { payeeName: correctionInput } : undefined,
      });
    } else {
      rejectCategoryMutation.mutate({
        id: correctionModal.suggestionId,
        correction: correctionInput ? { categoryName: correctionInput } : undefined,
      });
    }
  };

  if (isLoading) {
    return <div className="loading">Loading suggestions...</div>;
  }

  if (error) {
    return <div className="error">Error loading suggestions: {error.message}</div>;
  }

  const suggestions = data?.suggestions || [];
  
  // Group suggestions by payee
  const payeeGroups = groupByPayee(suggestions);

  return (
    <div className="suggestion-list">
      <div className="suggestion-list-header">
        <h2>Suggestions ({suggestions.length} transactions, {payeeGroups.length} payees)</h2>
        <button
          className="btn btn-sync"
          onClick={() => syncAndGenerateMutation.mutate()}
          disabled={syncAndGenerateMutation.isPending}
        >
          {syncAndGenerateMutation.isPending ? 'Syncing...' : '🔄 Sync & Generate'}
        </button>
      </div>
      
      {syncAndGenerateMutation.error && (
        <div className="error">
          Sync failed: {syncAndGenerateMutation.error.message}
        </div>
      )}

      {payeeGroups.length === 0 ? (
        <div className="empty-state">
          <p>No suggestions available</p>
          <p className="hint">Click "Sync & Generate" to fetch new suggestions</p>
        </div>
      ) : (
        <div className="payee-cards">
          {payeeGroups.map((group) => {
            const isExpanded = expandedPayees.has(group.payeeName);
            const pendingIds = group.suggestions
              .filter(s => s.status === 'pending')
              .map(s => s.id);
            const hasPending = pendingIds.length > 0;
            const firstSuggestion = group.suggestions[0];

            return (
              <div 
                key={group.payeeName} 
                className={`payee-card confidence-card-${getConfidenceLevel(group.avgConfidence)}`}
              >
                <div className="payee-card-header" onClick={() => toggleExpanded(group.payeeName)}>
                  <div className="payee-info">
                    <div className="payee-name-container">
                      <span className="payee-name">{group.payeeName}</span>
                      {group.suggestedPayeeName && group.suggestedPayeeName !== group.payeeName && (
                        <span className="suggested-payee-badge" title="AI-suggested canonical name">
                          → {group.suggestedPayeeName}
                        </span>
                      )}
                    </div>
                    <span className="transaction-count">
                      {group.suggestions.length} transaction{group.suggestions.length !== 1 ? 's' : ''}
                      {group.pendingCount > 0 && ` (${group.pendingCount} pending)`}
                    </span>
                  </div>
                  <div className="payee-meta">
                    <span className="category-badge">{group.proposedCategory}</span>
                    <span className={`confidence-badge confidence-${getConfidenceLevel(group.avgConfidence)}`}>
                      {Math.round(group.avgConfidence * 100)}%
                    </span>
                    <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </div>

                {/* Separate Payee and Category sections */}
                <div className="suggestion-components">
                  {/* Payee Suggestion */}
                  {group.hasPayeeSuggestion && group.payeeStatus === 'pending' && (
                    <div className="suggestion-component payee-component">
                      <div className="component-header">
                        <span className="component-label">📝 Payee</span>
                        <span className={`confidence-mini confidence-${getConfidenceLevel(group.payeeConfidence)}`}>
                          {Math.round(group.payeeConfidence * 100)}%
                        </span>
                      </div>
                      <div className="component-value">
                        {group.payeeName} → <strong>{group.suggestedPayeeName}</strong>
                      </div>
                      <div className="component-rationale" title={group.payeeRationale}>
                        {group.payeeRationale}
                      </div>
                      <div className="component-actions">
                        <button
                          className="btn btn-sm btn-approve"
                          onClick={(e) => {
                            e.stopPropagation();
                            approvePayeeMutation.mutate(firstSuggestion.id);
                          }}
                          disabled={approvePayeeMutation.isPending}
                        >
                          ✓ Accept
                        </button>
                        <button
                          className="btn btn-sm btn-reject"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCorrectionModal('payee', firstSuggestion.id, group.suggestedPayeeName || '');
                          }}
                        >
                          ✗ Correct
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Category Suggestion */}
                  {group.categoryStatus === 'pending' && (
                    <div className="suggestion-component category-component">
                      <div className="component-header">
                        <span className="component-label">📁 Category</span>
                        <span className={`confidence-mini confidence-${getConfidenceLevel(group.categoryConfidence)}`}>
                          {Math.round(group.categoryConfidence * 100)}%
                        </span>
                      </div>
                      <div className="component-value">
                        <strong>{group.proposedCategory}</strong>
                      </div>
                      <div className="component-rationale" title={group.categoryRationale}>
                        {group.categoryRationale}
                      </div>
                      <div className="component-actions">
                        <button
                          className="btn btn-sm btn-approve"
                          onClick={(e) => {
                            e.stopPropagation();
                            approveCategoryMutation.mutate(firstSuggestion.id);
                          }}
                          disabled={approveCategoryMutation.isPending}
                        >
                          ✓ Accept
                        </button>
                        <button
                          className="btn btn-sm btn-reject"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCorrectionModal('category', firstSuggestion.id, group.proposedCategory);
                          }}
                        >
                          ✗ Correct
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {hasPending && (
                  <div className="payee-actions">
                    <button
                      className="btn btn-approve-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        bulkApproveMutation.mutate(pendingIds);
                      }}
                      disabled={bulkApproveMutation.isPending}
                    >
                      ✓ Approve All ({pendingIds.length})
                    </button>
                    <button
                      className="btn btn-reject-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        bulkRejectMutation.mutate(pendingIds);
                      }}
                      disabled={bulkRejectMutation.isPending}
                    >
                      ✗ Reject All
                    </button>
                  </div>
                )}

                {isExpanded && (
                  <div className="payee-transactions">
                    <table className="transaction-table">
                      <thead>
                        <tr>
                          <th className="col-date">Date</th>
                          <th className="col-account">Account</th>
                          <th className="col-amount">Amount</th>
                          <th className="col-status">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.suggestions.map((suggestion) => (
                          <tr 
                            key={suggestion.id}
                            className={`status-row-${suggestion.status}`}
                          >
                            <td className="col-date">{formatDate(suggestion.transactionDate)}</td>
                            <td className="col-account">{suggestion.transactionAccountName || '—'}</td>
                            <td className="col-amount">{formatAmount(suggestion.transactionAmount)}</td>
                            <td className="col-status">
                              <span className={`status-badge status-${suggestion.status}`}>
                                {suggestion.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
            <input
              type="text"
              className="correction-input"
              placeholder={`Enter correct ${correctionModal.type}...`}
              value={correctionInput}
              onChange={(e) => setCorrectionInput(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setCorrectionModal(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-reject"
                onClick={handleCorrectionSubmit}
                disabled={rejectPayeeMutation.isPending || rejectCategoryMutation.isPending}
              >
                {correctionInput ? 'Submit Correction' : 'Reject Without Correction'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="legend">
        <span className="legend-item">
          <span className="legend-color confidence-high"></span> High confidence (≥80%)
        </span>
        <span className="legend-item">
          <span className="legend-color confidence-medium"></span> Medium (50-79%)
        </span>
        <span className="legend-item">
          <span className="legend-color confidence-low"></span> Low (&lt;50%)
        </span>
        <span className="legend-hint">Click a payee card to expand transactions</span>
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
    const pendingItems = items.filter(s => s.status === 'pending');
    const avgConfidence = items.reduce((sum, s) => sum + s.confidence, 0) / items.length;
    // Use first suggestion's category/rationale as representative
    const first = items[0];
    
    // Extract independent payee and category data
    const payeeSuggestion = first.payeeSuggestion;
    const categorySuggestion = first.categorySuggestion;
    
    // Determine if there's a meaningful payee suggestion (different from original)
    const hasPayeeSuggestion = !!(
      payeeSuggestion?.proposedPayeeName && 
      payeeSuggestion.proposedPayeeName !== payeeName
    );
    
    result.push({
      payeeName,
      suggestedPayeeName: payeeSuggestion?.proposedPayeeName || first.suggestedPayeeName || null,
      suggestions: items.sort((a, b) => 
        new Date(b.transactionDate || 0).getTime() - new Date(a.transactionDate || 0).getTime()
      ),
      pendingCount: pendingItems.length,
      proposedCategory: categorySuggestion?.proposedCategoryName || first.proposedCategoryName || 'Unknown',
      proposedCategoryId: categorySuggestion?.proposedCategoryId || first.proposedCategoryId,
      avgConfidence,
      payeeConfidence: payeeSuggestion?.confidence ?? first.confidence,
      categoryConfidence: categorySuggestion?.confidence ?? first.confidence,
      payeeRationale: payeeSuggestion?.rationale || 'No payee change suggested',
      categoryRationale: categorySuggestion?.rationale || first.rationale || 'No rationale provided',
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
      year: 'numeric'
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
