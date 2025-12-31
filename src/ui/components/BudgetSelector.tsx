import { useEffect, useState, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Budget } from '../services/api';

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
      <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-50 px-4 py-4 text-sm text-slate-500">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
        Loading budgets...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-4 py-4 text-sm text-amber-700">
        <span aria-hidden="true">⚠️</span>
        {error}
      </div>
    );
  }

  if (budgets.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-slate-50 px-4 py-4 text-sm text-slate-500">
        No budgets available
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-4 sm:flex-row sm:items-center">
      <label htmlFor="budget-select" className="min-w-fit font-semibold text-slate-600">
        Budget:
      </label>
      <select
        id="budget-select"
        className="w-full max-w-full flex-1 rounded-md border border-slate-300 bg-white px-4 py-2 text-base shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:max-w-[400px]"
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
        className="whitespace-nowrap rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => syncJobMutation.mutate()}
        disabled={!selectedBudget?.id || syncJobMutation.isPending}
      >
        {syncJobMutation.isPending ? 'Syncing...' : '🔄 Sync'}
      </button>
    </div>
  );
}
