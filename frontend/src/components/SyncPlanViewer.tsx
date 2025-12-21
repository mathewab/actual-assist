import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, type SyncPlan } from '../services/api';
import './SyncPlanViewer.css';

export function SyncPlanViewer() {
  const [snapshotId, setSnapshotId] = useState('');
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null);

  const createPlanMutation = useMutation({
    mutationFn: (snapshotId: string) => api.createSyncPlan(snapshotId),
    onSuccess: (data) => {
      setSyncPlan(data);
    },
  });

  const executePlanMutation = useMutation({
    mutationFn: (snapshotId: string) => api.executeSyncPlan(snapshotId),
    onSuccess: () => {
      alert('Sync plan executed successfully!');
      setSyncPlan(null);
      setSnapshotId('');
    },
  });

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (snapshotId.trim()) {
      createPlanMutation.mutate(snapshotId);
    }
  };

  const handleExecutePlan = () => {
    if (snapshotId && confirm('Execute sync plan? This will update your Actual Budget.')) {
      executePlanMutation.mutate(snapshotId);
    }
  };

  return (
    <div className="sync-plan-viewer">
      <h2>Sync Plan</h2>

      <form onSubmit={handleCreatePlan} className="create-plan-form">
        <div className="form-group">
          <label htmlFor="snapshotId">Snapshot ID:</label>
          <input
            id="snapshotId"
            type="text"
            value={snapshotId}
            onChange={(e) => setSnapshotId(e.target.value)}
            placeholder="Enter snapshot ID"
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
            <p><strong>Snapshot ID:</strong> {syncPlan.snapshotId}</p>
            <p><strong>Operations:</strong> {syncPlan.operations.length}</p>
            <p><strong>Created:</strong> {new Date(syncPlan.createdAt).toLocaleString()}</p>
          </div>

          <h3>Operations</h3>
          <div className="operations">
            {syncPlan.operations.map((op, index) => (
              <div key={index} className="operation">
                <span className="op-type">{op.type}</span>
                <span className="op-transaction">Transaction: {op.transactionId}</span>
                <span className="op-category">
                  → {op.newCategoryName || 'Uncategorized'}
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
