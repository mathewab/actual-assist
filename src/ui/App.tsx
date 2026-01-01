import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { SuggestionList } from './components/SuggestionList';
import { ApplyChanges } from './components/ApplyChanges';
import { History } from './components/History';
import { Audit } from './components/Audit';
import { JobList } from './components/JobList';
import { TemplateStudio } from './components/TemplateStudio';
import { PayeeMergeTool } from './components/PayeeMergeTool';
import { Settings } from './components/Settings';
import { ErrorBoundary } from './components/ErrorBoundary';
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

  const renderBudgetRoute = (render: (budgetId: string) => ReactElement) => {
    if (budgetLoading) {
      return <BudgetLoading />;
    }
    if (budgetError) {
      return <BudgetError message={budgetError} />;
    }
    if (!selectedBudget) {
      return <BudgetRequired />;
    }
    return render(selectedBudget.id);
  };

  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-[var(--theme-bg)]">
        <Header budgetName={selectedBudget?.name} budgetId={selectedBudget?.id} />

        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-5 py-5">
          <main className="min-h-[400px] rounded-lg bg-[var(--theme-surface)] shadow-sm">
            <ErrorBoundary title="Something went wrong">
              <Routes>
                <Route
                  path="/"
                  element={renderBudgetRoute(() => (
                    <Home />
                  ))}
                />
                <Route
                  path="/suggestions"
                  element={renderBudgetRoute((budgetId) => (
                    <SuggestionList budgetId={budgetId} />
                  ))}
                />
                <Route
                  path="/apply"
                  element={renderBudgetRoute((budgetId) => (
                    <ApplyChanges budgetId={budgetId} />
                  ))}
                />
                <Route
                  path="/history"
                  element={renderBudgetRoute((budgetId) => (
                    <History budgetId={budgetId} />
                  ))}
                />
                <Route
                  path="/audit"
                  element={renderBudgetRoute(() => (
                    <Audit />
                  ))}
                />
                <Route
                  path="/templates"
                  element={renderBudgetRoute((budgetId) => (
                    <TemplateStudio budgetId={budgetId} />
                  ))}
                />
                <Route
                  path="/payees/merge"
                  element={renderBudgetRoute((budgetId) => (
                    <PayeeMergeTool budgetId={budgetId} />
                  ))}
                />
                <Route
                  path="/jobs"
                  element={renderBudgetRoute((budgetId) => (
                    <JobList budgetId={budgetId} />
                  ))}
                />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

function BudgetRequired() {
  return (
    <div className="flex min-h-[400px] items-center justify-center px-6 py-10 text-sm text-slate-500">
      <p>Please select a budget to get started.</p>
    </div>
  );
}

function BudgetLoading() {
  return (
    <div className="flex min-h-[400px] items-center justify-center px-6 py-10 text-sm text-slate-500">
      <p>Loading budget...</p>
    </div>
  );
}

function BudgetError({ message }: { message: string }) {
  return (
    <div className="flex min-h-[400px] items-center justify-center px-6 py-10 text-sm text-rose-700">
      <p>{message}</p>
    </div>
  );
}
