import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ApprovedChange } from '../services/api';
import { ProgressBar } from './ProgressBar';
import './ApplyChanges.css';

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
      <div className="apply-changes">
        <h2>Apply Changes</h2>
        <ProgressBar message="Loading approved suggestions..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="apply-changes">
        <h2>Apply Changes</h2>
        <div className="error">Error: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="apply-changes">
      <div className="apply-header">
        <h2>Apply Changes</h2>
        <button className="btn btn-refresh" onClick={() => refetch()}>
          ↻ Refresh
        </button>
      </div>

      {changes.length === 0 ? (
        <div className="empty-state">
          <p>No approved suggestions to apply</p>
          <p className="hint">Approve suggestions in the Review tab first</p>
        </div>
      ) : (
        <>
          <div className="summary-bar">
            <span className="summary-count">
              <strong>{selectedChanges.length}</strong> of {changes.length} selected
            </span>
            {excludedIds.size > 0 && (
              <span className="summary-excluded">({excludedIds.size} excluded)</span>
            )}
          </div>

          <div className="changes-table-container">
            <table className="changes-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
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
                    />
                  </th>
                  <th>Date</th>
                  <th>Payee</th>
                  <th>Amount</th>
                  <th>Account</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change: ApprovedChange) => {
                  const isExcluded = excludedIds.has(change.suggestionId);
                  return (
                    <tr
                      key={change.suggestionId}
                      className={isExcluded ? 'excluded' : ''}
                      onClick={() => toggleExclude(change.suggestionId)}
                    >
                      <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => toggleExclude(change.suggestionId)}
                        />
                      </td>
                      <td>{formatDate(change.transactionDate)}</td>
                      <td className="payee-cell">
                        {change.transactionPayee || '—'}
                        {change.hasPayeeChange && change.proposedPayeeName && (
                          <span className="inline-change">
                            <span className="arrow">→</span>
                            <span className="to-value payee-chip">{change.proposedPayeeName}</span>
                          </span>
                        )}
                      </td>
                      <td className="amount-cell">{formatAmount(change.transactionAmount)}</td>
                      <td>{change.transactionAccountName || '—'}</td>
                      <td>
                        <span className="from-value">
                          {change.currentCategoryName || 'Uncategorized'}
                        </span>
                        <span className="inline-change">
                          <span className="arrow">→</span>
                          <span className="to-value category-chip">
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

          <div className="apply-actions">
            <button
              className="btn btn-apply"
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
            <div className="success-message">
              ✓ Apply job started. Track progress in the job center.
            </div>
          )}

          {applyMutation.error && (
            <div className="error">Failed to apply changes: {applyMutation.error.message}</div>
          )}
        </>
      )}
    </div>
  );
}
