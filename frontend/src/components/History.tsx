import { useQuery } from '@tanstack/react-query';
import { api, type Suggestion } from '../services/api';
import { ProgressBar } from './ProgressBar';
import './History.css';

interface HistoryProps {
  budgetId: string;
}

export function History({ budgetId }: HistoryProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['suggestions', budgetId],
    queryFn: () => api.getSuggestionsByBudgetId(budgetId),
    enabled: !!budgetId,
  });

  if (isLoading) {
    return <ProgressBar message="Loading applied changes..." />;
  }

  if (error) {
    return <div className="error">Error loading history: {error.message}</div>;
  }

  const appliedSuggestions = (data?.suggestions || []).filter(
    (s: Suggestion) => s.status === 'applied'
  );

  return (
    <div className="history-page">
      <div className="history-header">
        <h2>Applied Changes History</h2>
        <span className="history-count">{appliedSuggestions.length} changes applied</span>
      </div>

      {appliedSuggestions.length === 0 ? (
        <div className="empty-state">
          <p>No changes have been applied yet.</p>
          <p className="hint">Approve suggestions and apply them to see them here.</p>
        </div>
      ) : (
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Payee</th>
                <th>Amount</th>
                <th>Account</th>
                <th>Category Applied</th>
                <th>Payee Applied</th>
              </tr>
            </thead>
            <tbody>
              {appliedSuggestions.map((suggestion: Suggestion) => (
                <tr key={suggestion.id}>
                  <td>{formatDate(suggestion.transactionDate)}</td>
                  <td className="payee-cell">
                    <span className="original-payee">{suggestion.transactionPayee || '—'}</span>
                  </td>
                  <td className={`amount ${(suggestion.transactionAmount || 0) < 0 ? 'expense' : 'income'}`}>
                    {formatAmount(suggestion.transactionAmount)}
                  </td>
                  <td>{suggestion.transactionAccountName || '—'}</td>
                  <td>
                    <span className="category-chip applied">
                      {suggestion.categorySuggestion?.proposedCategoryName || suggestion.proposedCategoryName || '—'}
                    </span>
                  </td>
                  <td>
                    {suggestion.payeeSuggestion?.proposedPayeeName ? (
                      <span className="payee-chip applied">
                        {suggestion.payeeSuggestion.proposedPayeeName}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
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
  const dollars = amount / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(dollars);
}
