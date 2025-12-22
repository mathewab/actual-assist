import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Suggestion } from '../services/api';
import './SuggestionList.css';

export function SuggestionList() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['suggestions', 'pending'],
    queryFn: () => api.getPendingSuggestions(),
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

  if (suggestions.length === 0) {
    return (
      <div className="empty-state">
        <p>No pending suggestions</p>
        <p className="hint">Create a snapshot to generate suggestions</p>
      </div>
    );
  }

  return (
    <div className="suggestion-list">
      <h2>Pending Suggestions ({suggestions.length})</h2>
      
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
            </div>

            <div className="suggestion-body">
              <p className="rationale">{suggestion.rationale}</p>
              <p className="transaction-details">
                {suggestion.transactionPayee} - {suggestion.transactionDate} ({suggestion.transactionAmount})
              </p>
            </div>

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
          </div>
        ))}
      </div>
    </div>
  );
}

function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}
