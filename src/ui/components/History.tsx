import { useQuery } from '@tanstack/react-query';
import { api, type Suggestion } from '../services/api';
import { ProgressBar } from './ProgressBar';

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
    return (
      <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Error loading history: {error.message}
      </div>
    );
  }

  const appliedSuggestions = (data?.suggestions || []).filter(
    (s: Suggestion) => s.status === 'applied'
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] p-4">
      <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
        <h2 className="text-lg font-semibold text-slate-800">Applied Changes History</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
          {appliedSuggestions.length} changes applied
        </span>
      </div>

      {appliedSuggestions.length === 0 ? (
        <div className="rounded-md bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          <p>No changes have been applied yet.</p>
          <p className="mt-2 text-xs text-slate-400">
            Approve suggestions and apply them to see them here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                  Date
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                  Payee
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                  Amount
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                  Account
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                  Category Applied
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                  Payee Applied
                </th>
              </tr>
            </thead>
            <tbody>
              {appliedSuggestions.map((suggestion: Suggestion) => (
                <tr key={suggestion.id} className="hover:bg-slate-50">
                  <td className="border-b border-slate-100 px-3 py-2">
                    {formatDate(suggestion.transactionDate)}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    <span className="font-medium text-slate-800">
                      {suggestion.transactionPayee || '—'}
                    </span>
                  </td>
                  <td
                    className={`border-b border-slate-100 px-3 py-2 font-mono text-xs ${
                      (suggestion.transactionAmount || 0) < 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {formatAmount(suggestion.transactionAmount)}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    {suggestion.transactionAccountName || '—'}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {suggestion.categorySuggestion?.proposedCategoryName ||
                        suggestion.proposedCategoryName ||
                        '—'}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    {suggestion.payeeSuggestion?.proposedPayeeName ? (
                      <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
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
      year: 'numeric',
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
