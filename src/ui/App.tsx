import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { SuggestionList } from './components/SuggestionList';
import { ApplyChanges } from './components/ApplyChanges';
import { History } from './components/History';
import { Audit } from './components/Audit';
import { TemplateStudio } from './components/TemplateStudio';
import { api, type Budget } from './services/api';

/**
 * Main App component
 */
export function App() {
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadBudget = async () => {
      try {
        setBudgetLoading(true);
        setBudgetError(null);
        const response = await api.listBudgets();
        if (!isActive) return;

        const [firstBudget] = response.budgets ?? [];
        if (firstBudget) {
          setSelectedBudget(firstBudget);
        } else {
          setSelectedBudget(null);
          setBudgetError('No budgets available.');
        }
      } catch (error) {
        if (!isActive) return;
        setSelectedBudget(null);
        setBudgetError(error instanceof Error ? error.message : 'Failed to load budget.');
      } finally {
        if (isActive) {
          setBudgetLoading(false);
        }
      }
    };

    loadBudget();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-slate-100">
        <Header budgetName={selectedBudget?.name} budgetId={selectedBudget?.id} />

        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-5 py-5">
          {budgetLoading ? (
            <main className="flex min-h-[400px] items-center justify-center rounded-lg bg-white px-6 py-10 text-sm text-slate-500 shadow-sm">
              <p>Loading budget...</p>
            </main>
          ) : budgetError ? (
            <main className="flex min-h-[400px] items-center justify-center rounded-lg bg-white px-6 py-10 text-sm text-rose-700 shadow-sm">
              <p>{budgetError}</p>
            </main>
          ) : selectedBudget ? (
            <main className="min-h-[400px] rounded-lg bg-white shadow-sm">
              <Routes>
                <Route path="/" element={<SuggestionList budgetId={selectedBudget.id} />} />
                <Route path="/apply" element={<ApplyChanges budgetId={selectedBudget.id} />} />
                <Route path="/history" element={<History budgetId={selectedBudget.id} />} />
                <Route path="/audit" element={<Audit />} />
                <Route
                  path="/templates"
                  element={<TemplateStudio budgetId={selectedBudget.id} />}
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          ) : (
            <main className="flex min-h-[400px] items-center justify-center rounded-lg bg-white px-6 py-10 text-sm text-slate-500 shadow-sm">
              <p>No budget configured.</p>
            </main>
          )}
        </div>
      </div>
    </BrowserRouter>
  );
}
