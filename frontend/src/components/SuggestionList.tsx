import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Suggestion } from '../services/api';
import './SuggestionList.css';

interface SuggestionListProps {
  budgetId: string;
}

export function SuggestionList({ budgetId }: SuggestionListProps) {
  const queryClient = useQueryClient();

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

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  if (isLoading) {
    return <div className="loading">Loading suggestions...</div>;
  }

  if (error) {
    return <div className="error">Error loading suggestions: {error.message}</div>;
  }

  const suggestions = data?.suggestions || [];

  return (
    <div className="suggestion-list">
      <div className="suggestion-list-header">
        <h2>Suggestions ({suggestions.length})</h2>
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

      {suggestions.length === 0 ? (
        <div className="empty-state">
          <p>No suggestions available</p>
          <p className="hint">Click "Sync & Generate" to fetch new suggestions</p>
        </div>
      ) : (
        <div className="transaction-table-container">
          <table className="transaction-table">
            <thead>
              <tr>
                <th className="col-date">Date</th>
                <th className="col-payee">Payee</th>
                <th className="col-account">Account</th>
                <th className="col-amount">Amount</th>
                <th className="col-category">Category</th>
                <th className="col-confidence">Confidence</th>
                <th className="col-status">Status</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((suggestion: Suggestion) => (
                <tr 
                  key={suggestion.id} 
                  className={`transaction-row confidence-row-${getConfidenceLevel(suggestion.confidence)} status-row-${suggestion.status}`}
                  title={suggestion.rationale}
                >
                  <td className="col-date">
                    {formatDate(suggestion.transactionDate)}
                  </td>
                  <td className="col-payee">
                    <span className="payee-name">{suggestion.transactionPayee || '—'}</span>
                  </td>
                  <td className="col-account">
                    <span className="account-name">{suggestion.transactionAccountName || '—'}</span>
                  </td>
                  <td className="col-amount">
                    {formatAmount(suggestion.transactionAmount)}
                  </td>
                  <td className="col-category">
                    <span className="category-badge">
                      {suggestion.proposedCategoryName || 'Uncategorized'}
                    </span>
                  </td>
                  <td className="col-confidence">
                    <span className={`confidence-badge confidence-${getConfidenceLevel(suggestion.confidence)}`}>
                      {Math.round(suggestion.confidence * 100)}%
                    </span>
                  </td>
                  <td className="col-status">
                    <span className={`status-badge status-${suggestion.status}`}>
                      {suggestion.status}
                    </span>
                  </td>
                  <td className="col-actions">
                    {suggestion.status === 'pending' ? (
                      <div className="action-buttons">
                        <button
                          className="btn-icon btn-approve"
                          onClick={() => approveMutation.mutate(suggestion.id)}
                          disabled={approveMutation.isPending}
                          title="Approve suggestion"
                        >
                          ✓
                        </button>
                        <button
                          className="btn-icon btn-reject"
                          onClick={() => rejectMutation.mutate(suggestion.id)}
                          disabled={rejectMutation.isPending}
                          title="Reject suggestion"
                        >
                          ✗
                        </button>
                      </div>
                    ) : (
                      <span className="action-done">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <span className="legend-hint">Hover over a row to see AI rationale</span>
      </div>
    </div>
  );
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
