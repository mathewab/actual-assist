import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { BudgetSelector } from './components/BudgetSelector';
import { SuggestionList } from './components/SuggestionList';
import { ApplyChanges } from './components/ApplyChanges';
import { History } from './components/History';
import { Audit } from './components/Audit';
import type { Budget } from './services/api';
import './App.css';

/**
 * Main App component
 * T084: Wire BudgetSelector into App.tsx with selectedBudget gating
 */
export function App() {
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);

  const handleBudgetSelect = useCallback((budget: Budget) => {
    setSelectedBudget(budget);
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <Header budgetName={selectedBudget?.name} />

        <div className="app-content">
          <BudgetSelector 
            selectedBudget={selectedBudget}
            onBudgetSelect={handleBudgetSelect}
          />

          {selectedBudget ? (
            <main className="app-main">
              <Routes>
                <Route path="/" element={<SuggestionList budgetId={selectedBudget.id} />} />
                <Route path="/apply" element={<ApplyChanges budgetId={selectedBudget.id} />} />
                <Route path="/history" element={<History budgetId={selectedBudget.id} />} />
                <Route path="/audit" element={<Audit />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          ) : (
            <main className="app-main app-main--empty">
              <p>Please select a budget to get started.</p>
            </main>
          )}
        </div>
      </div>
    </BrowserRouter>
  );
}
