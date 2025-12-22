import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, type SyncPlan } from '../services/api';
import './SyncPlanViewer.css';

export function SyncPlanViewer() {
  const [budgetId, setBudgetId] = useState('');
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null);

  const createPlanMutation = useMutation({
    mutationFn: (budgetId: string) => api.buildSyncPlan(budgetId),
    onSuccess: (data: SyncPlan) => {
      setSyncPlan(data);
    },
  });

  const executePlanMutation = useMutation({
    mutationFn: (budgetId: string) => api.executeSyncPlan(budgetId),
    onSuccess: () => {
      alert('Sync plan executed successfully!');
      setSyncPlan(null);
      setBudgetId('');
    },
  });

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (budgetId.trim()) {
      createPlanMutation.mutate(budgetId);
    }
  };

  const handleExecutePlan = () => {
    if (budgetId && confirm('Execute sync plan? This will update your Actual Budget.')) {
      executePlanMutation.mutate(budgetId);
    }
  };

  return (
    <div className="sync-plan-viewer">
      <h2>Sync Plan</h2>

      <form onSubmit={handleCreatePlan} className="create-plan-form">
        <div className="form-group">
          <label htmlFor="budgetId">Budget ID:</label>
          <input
            id="budgetId"
            type="text"
            value={budgetId}
            onChange={(e) => setBudgetId(e.target.value)}
            placeholder="Enter budget ID"
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={createPlanMutation.isPending}
        >
          {createPlanMutation.isPending ? 'Creating...' : 'Create Sync Plan'}
        </button>
      </form>

      {createPlanMutation.error && (
        <div className="error">
          Error: {createPlanMutation.error.message}
        </div>
      )}

      {syncPlan && (
        <div className="sync-plan">
          <h3>Plan Overview</h3>
          <div className="plan-meta">
            <p><strong>Plan ID:</strong> {syncPlan.id}</p>
            <p><strong>Budget ID:</strong> {syncPlan.budgetId}</p>
            <p><strong>Changes:</strong> {syncPlan.changes.length}</p>
            <p><strong>Created:</strong> {new Date(syncPlan.createdAt).toLocaleString()}</p>
          </div>

          <h3>Changes</h3>
          <div className="changes">
            {syncPlan.changes.map((change: any, index: number) => (
              <div key={index} className="change">
                <span className="change-type">Update Category</span>
                <span className="change-transaction">Transaction: {change.transactionId}</span>
                <span className="change-category">
                  → Category: {change.proposedCategoryId}
                </span>
              </div>
            ))}
          </div>

          <button
            className="btn btn-execute"
            onClick={handleExecutePlan}
            disabled={executePlanMutation.isPending}
          >
            {executePlanMutation.isPending ? 'Executing...' : 'Execute Sync Plan'}
          </button>

          {executePlanMutation.error && (
            <div className="error">
              Execution failed: {executePlanMutation.error.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
