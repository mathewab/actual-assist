import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ApprovedChange } from '../services/api';
import { ProgressBar } from './ProgressBar';

interface ApplyChangesProps {
  budgetId: string;
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

export function ApplyChanges({ budgetId }: ApplyChangesProps) {
  const queryClient = useQueryClient();
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // Auto-fetch approved changes
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['approved-changes', budgetId],
    queryFn: () => api.getApprovedChanges(budgetId),
    enabled: !!budgetId,
  });

  const applyMutation = useMutation({
    mutationFn: (suggestionIds: string[]) => api.applySuggestions(budgetId, suggestionIds),
    onSuccess: () => {
      // Refresh lists and jobs after job creation
      queryClient.invalidateQueries({ queryKey: ['approved-changes', budgetId] });
      queryClient.invalidateQueries({ queryKey: ['suggestions', budgetId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
      setExcludedIds(new Set());
    },
  });

  const changes = useMemo<ApprovedChange[]>(() => data?.changes ?? [], [data]);

  // Compute selected changes (all checked ones)
  const selectedChanges = useMemo(() => {
    return changes.filter((c) => !excludedIds.has(c.suggestionId));
  }, [changes, excludedIds]);

  const toggleExclude = (suggestionId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(suggestionId)) {
        next.delete(suggestionId);
      } else {
        next.add(suggestionId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (excludedIds.size === 0) {
      // All selected, deselect all
      setExcludedIds(new Set(changes.map((c) => c.suggestionId)));
    } else {
      // Some excluded, select all
      setExcludedIds(new Set());
    }
  };

  const handleApply = () => {
    const idsToApply = selectedChanges.map((c) => c.suggestionId);
    if (idsToApply.length === 0) return;

    if (confirm(`Apply ${idsToApply.length} change(s) to Actual Budget?`)) {
      applyMutation.mutate(idsToApply);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1200px] p-5">
        <h2 className="text-lg font-semibold text-slate-800">Apply Changes</h2>
        <ProgressBar message="Loading approved suggestions..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1200px] p-5">
        <h2 className="text-lg font-semibold text-slate-800">Apply Changes</h2>
        <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Error: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Apply Changes</h2>
        <button
          className="rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
          onClick={() => refetch()}
        >
          ↻ Refresh
        </button>
      </div>

      {changes.length === 0 ? (
        <div className="rounded-md bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          <p>No approved suggestions to apply</p>
          <p className="mt-2 text-xs text-slate-400">Approve suggestions in the Review tab first</p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-3 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">
            <span>
              <strong>{selectedChanges.length}</strong> of {changes.length} selected
            </span>
            {excludedIds.size > 0 && (
              <span className="text-xs font-medium text-amber-700">
                ({excludedIds.size} excluded)
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-10 whitespace-nowrap border-b border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={excludedIds.size === 0}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate =
                            excludedIds.size > 0 && excludedIds.size < changes.length;
                        }
                      }}
                      onChange={toggleAll}
                      title={excludedIds.size === 0 ? 'Deselect all' : 'Select all'}
                      className="h-4 w-4 cursor-pointer accent-blue-600"
                    />
                  </th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-700">
                    Date
                  </th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-700">
                    Payee
                  </th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-700">
                    Amount
                  </th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-700">
                    Account
                  </th>
                  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-700">
                    Category
                  </th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change: ApprovedChange) => {
                  const isExcluded = excludedIds.has(change.suggestionId);
                  return (
                    <tr
                      key={change.suggestionId}
                      className={[
                        'cursor-pointer transition',
                        isExcluded
                          ? 'bg-slate-50 opacity-60 hover:bg-slate-100'
                          : 'hover:bg-slate-50',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => toggleExclude(change.suggestionId)}
                    >
                      <td
                        className="w-10 border-b border-slate-100 px-3 py-2 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => toggleExclude(change.suggestionId)}
                          className="h-4 w-4 cursor-pointer accent-blue-600"
                        />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        {formatDate(change.transactionDate)}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 font-medium text-slate-800">
                        {change.transactionPayee || '—'}
                        {change.hasPayeeChange && change.proposedPayeeName && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs">
                            <span className="font-semibold text-blue-600">→</span>
                            <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                              {change.proposedPayeeName}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs">
                        {formatAmount(change.transactionAmount)}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        {change.transactionAccountName || '—'}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        <span className="text-xs text-slate-500">
                          {change.currentCategoryName || 'Uncategorized'}
                        </span>
                        <span className="ml-2 inline-flex items-center gap-1 text-xs">
                          <span className="font-semibold text-blue-600">→</span>
                          <span className="rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                            {change.proposedCategoryName || change.proposedCategoryId}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <button
              className="w-full rounded-md bg-emerald-500 px-6 py-3 text-base font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-400"
              onClick={handleApply}
              disabled={applyMutation.isPending || selectedChanges.length === 0}
            >
              {applyMutation.isPending
                ? 'Applying...'
                : selectedChanges.length === 0
                  ? 'No Changes Selected'
                  : `Apply ${selectedChanges.length} Change${selectedChanges.length !== 1 ? 's' : ''}`}
            </button>
          </div>

          {applyMutation.isPending && <ProgressBar message="Starting apply job..." />}

          {applyMutation.isSuccess && (
            <div className="mt-4 rounded-md bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700">
              ✓ Apply job started. Track progress in the job center.
            </div>
          )}

          {applyMutation.error && (
            <div className="mt-4 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Failed to apply changes: {applyMutation.error.message}
            </div>
          )}
        </>
      )}
    </div>
  );
}
