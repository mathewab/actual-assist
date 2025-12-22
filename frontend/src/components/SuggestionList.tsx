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
        <div className="suggestions">
          {suggestions.map((suggestion: Suggestion) => (
            <div key={suggestion.id} className="suggestion-card">
              <div className="suggestion-header">
                <span className="category-name">
                  {suggestion.proposedCategoryName || 'Uncategorized'}
                </span>
                <span className={`confidence confidence-${getConfidenceLevel(suggestion.confidence)}`}>
                  {Math.round(suggestion.confidence * 100)}% confident
                </span>
                <span className={`status status-${suggestion.status}`}>
                  {suggestion.status}
                </span>
              </div>

              <div className="suggestion-body">
                <p className="rationale">{suggestion.rationale}</p>
                <p className="transaction-details">
                  {suggestion.transactionPayee} - {suggestion.transactionDate} ({suggestion.transactionAmount})
                </p>
              </div>

              {suggestion.status === 'pending' && (
                <div className="suggestion-actions">
                  <button
                    className="btn btn-approve"
                    onClick={() => approveMutation.mutate(suggestion.id)}
                    disabled={approveMutation.isPending}
                  >
                    ✓ Approve
                  </button>
                  <button
                    className="btn btn-reject"
                    onClick={() => rejectMutation.mutate(suggestion.id)}
                    disabled={rejectMutation.isPending}
                  >
                    ✗ Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}
