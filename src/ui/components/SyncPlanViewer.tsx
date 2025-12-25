import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SyncPlan, type SyncPlanChange } from '../services/api';
import { ProgressBar } from './ProgressBar';
import './SyncPlanViewer.css';

interface SyncPlanViewerProps {
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

export function SyncPlanViewer({ budgetId }: SyncPlanViewerProps) {
  const queryClient = useQueryClient();
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const createPlanMutation = useMutation({
    mutationFn: () => api.buildSyncPlan(budgetId),
    onSuccess: (data: SyncPlan) => {
      setSyncPlan(data);
      setExcludedIds(new Set()); // Reset exclusions when creating new plan
    },
  });

  const resetSuggestionsMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkResetSuggestions(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const executePlanMutation = useMutation({
    mutationFn: () => api.executeSyncPlan(budgetId),
    onSuccess: () => {
      alert('Sync plan executed successfully!');
      setSyncPlan(null);
      setExcludedIds(new Set());
    },
  });

  const handleCreatePlan = () => {
    createPlanMutation.mutate();
  };

  const handleExecutePlan = () => {
    // Reset excluded suggestions back to pending before executing
    const excludedSuggestionIds =
      syncPlan?.changes
        .filter((c) => excludedIds.has(c.id) && c.suggestionId)
        .map((c) => c.suggestionId as string) || [];

    if (excludedSuggestionIds.length > 0) {
      resetSuggestionsMutation.mutate(excludedSuggestionIds);
    }

    if (confirm('Execute sync plan? This will update your Actual Budget.')) {
      executePlanMutation.mutate();
    }
  };

  const toggleExclude = (changeId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(changeId)) {
        next.delete(changeId);
      } else {
        next.add(changeId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (!syncPlan) return;
    if (excludedIds.size === syncPlan.changes.length) {
      // All excluded, include all
      setExcludedIds(new Set());
    } else {
      // Some included, exclude all
      setExcludedIds(new Set(syncPlan.changes.map((c) => c.id)));
    }
  };

  // Compute included changes
  const includedChanges = useMemo(() => {
    if (!syncPlan) return [];
    return syncPlan.changes.filter((c) => !excludedIds.has(c.id));
  }, [syncPlan, excludedIds]);

  return (
    <div className="sync-plan-viewer">
      <h2>Sync Plan</h2>

      <div className="create-plan-section">
        <button
          className="btn btn-primary"
          onClick={handleCreatePlan}
          disabled={createPlanMutation.isPending}
        >
          {createPlanMutation.isPending ? 'Creating...' : 'Create Sync Plan'}
        </button>
      </div>

      {createPlanMutation.isPending && (
        <ProgressBar message="Building sync plan from approved suggestions..." />
      )}

      {createPlanMutation.error && (
        <div className="error">Error: {createPlanMutation.error.message}</div>
      )}

      {syncPlan && (
        <div className="sync-plan">
          <div className="plan-summary">
            <h3>Plan Summary</h3>
            <div className="summary-stats">
              <div className="stat">
                <span className="stat-value">{includedChanges.length}</span>
                <span className="stat-label">Changes to Apply</span>
              </div>
              {excludedIds.size > 0 && (
                <div className="stat excluded-stat">
                  <span className="stat-value">{excludedIds.size}</span>
                  <span className="stat-label">Excluded</span>
                </div>
              )}
              <div className="stat">
                <span className="stat-value">
                  {includedChanges.filter((c) => c.proposedCategoryId).length}
                </span>
                <span className="stat-label">Category Updates</span>
              </div>
              <div className="stat">
                <span className="stat-value">
                  {includedChanges.filter((c) => c.hasPayeeChange).length}
                </span>
                <span className="stat-label">Payee Updates</span>
              </div>
            </div>
            {excludedIds.size > 0 && (
              <p className="impact-text warning">
                {excludedIds.size} change(s) will be excluded and reset to pending
              </p>
            )}
          </div>

          <h3>Changes to Apply</h3>
          <div className="changes-table-container">
            <table className="changes-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={excludedIds.size === 0}
                      onChange={toggleAll}
                      title={excludedIds.size === 0 ? 'Exclude all' : 'Include all'}
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
                {syncPlan.changes.map((change: SyncPlanChange) => {
                  const isExcluded = excludedIds.has(change.id);
                  return (
                    <tr key={change.id} className={isExcluded ? 'excluded' : ''}>
                      <td className="checkbox-col">
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => toggleExclude(change.id)}
                          title={isExcluded ? 'Include this change' : 'Exclude this change'}
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

          <button
            className="btn btn-execute"
            onClick={handleExecutePlan}
            disabled={executePlanMutation.isPending || includedChanges.length === 0}
          >
            {executePlanMutation.isPending
              ? 'Executing...'
              : includedChanges.length === 0
                ? 'No Changes Selected'
                : `Execute ${includedChanges.length} Change${includedChanges.length !== 1 ? 's' : ''}`}
          </button>

          {executePlanMutation.isPending && (
            <ProgressBar message="Applying changes to Actual Budget..." />
          )}

          {executePlanMutation.error && (
            <div className="error">Execution failed: {executePlanMutation.error.message}</div>
          )}
        </div>
      )}
    </div>
  );
}
