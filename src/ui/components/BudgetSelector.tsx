import { useEffect, useState, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Budget } from '../services/api';
import './BudgetSelector.css';

interface BudgetSelectorProps {
  selectedBudget: Budget | null;
  onBudgetSelect: (budget: Budget) => void;
}

/**
 * BudgetSelector component
 * T083: Dropdown to select budget for all operations
 */
export function BudgetSelector({ selectedBudget, onBudgetSelect }: BudgetSelectorProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const syncJobMutation = useMutation({
    mutationFn: () => {
      if (!selectedBudget?.id) {
        return Promise.reject(new Error('Select a budget to sync'));
      }
      return api.createSyncJob(selectedBudget.id);
    },
    onSuccess: () => {
      if (selectedBudget?.id) {
        queryClient.invalidateQueries({ queryKey: ['jobs', selectedBudget.id] });
      }
    },
  });

  useEffect(() => {
    async function loadBudgets() {
      try {
        setLoading(true);
        setError(null);
        const response = await api.listBudgets();
        setBudgets(response.budgets);

        // Auto-select first budget if none selected
        if (!selectedBudget && response.budgets.length > 0) {
          onBudgetSelect(response.budgets[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load budgets');
      } finally {
        setLoading(false);
      }
    }

    loadBudgets();
  }, [selectedBudget, onBudgetSelect]);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const budgetId = event.target.value;
    const budget = budgets.find((b) => b.id === budgetId);
    if (budget) {
      onBudgetSelect(budget);
    }
  };

  if (loading) {
    return (
      <div className="budget-selector budget-selector--loading">
        <span className="budget-selector__spinner"></span>
        Loading budgets...
      </div>
    );
  }

  if (error) {
    return (
      <div className="budget-selector budget-selector--error">
        <span className="budget-selector__error-icon">⚠️</span>
        {error}
      </div>
    );
  }

  if (budgets.length === 0) {
    return <div className="budget-selector budget-selector--empty">No budgets available</div>;
  }

  return (
    <div className="budget-selector">
      <label htmlFor="budget-select" className="budget-selector__label">
        Budget:
      </label>
      <select
        id="budget-select"
        className="budget-selector__select"
        value={selectedBudget?.id || ''}
        onChange={handleChange}
      >
        <option value="" disabled>
          Select a budget...
        </option>
        {budgets.map((budget) => (
          <option key={budget.id} value={budget.id}>
            {budget.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="budget-sync-button"
        onClick={() => syncJobMutation.mutate()}
        disabled={!selectedBudget?.id || syncJobMutation.isPending}
      >
        {syncJobMutation.isPending ? 'Syncing...' : '🔄 Sync'}
      </button>
    </div>
  );
}
