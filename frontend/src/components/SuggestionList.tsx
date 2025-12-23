import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Suggestion } from '../services/api';
import './SuggestionList.css';

interface SuggestionListProps {
  budgetId: string;
}

/** Group of suggestions for a single payee */
interface PayeeGroup {
  payeeName: string;
  suggestions: Suggestion[];
  pendingCount: number;
  proposedCategory: string;
  proposedCategoryId: string;
  avgConfidence: number;
  rationale: string;
}

export function SuggestionList({ budgetId }: SuggestionListProps) {
  const queryClient = useQueryClient();
  const [expandedPayees, setExpandedPayees] = useState<Set<string>>(new Set());

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

            return (
              <div 
                key={group.payeeName} 
                className={`payee-card confidence-card-${getConfidenceLevel(group.avgConfidence)}`}
              >
                <div className="payee-card-header" onClick={() => toggleExpanded(group.payeeName)}>
                  <div className="payee-info">
                    <span className="payee-name">{group.payeeName}</span>
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

                <div className="payee-rationale" title={group.rationale}>
                  {group.rationale}
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
    result.push({
      payeeName,
      suggestions: items.sort((a, b) => 
        new Date(b.transactionDate || 0).getTime() - new Date(a.transactionDate || 0).getTime()
      ),
      pendingCount: pendingItems.length,
      proposedCategory: first.proposedCategoryName || 'Unknown',
      proposedCategoryId: first.proposedCategoryId,
      avgConfidence,
      rationale: first.rationale,
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
