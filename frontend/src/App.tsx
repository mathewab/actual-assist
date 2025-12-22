import { useState, useCallback } from 'react';
import { BudgetSelector } from './components/BudgetSelector';
import { SuggestionList } from './components/SuggestionList';
import { SyncPlanViewer } from './components/SyncPlanViewer';
import type { Budget } from './services/api';
import './App.css';

/**
 * Main App component
 * T084: Wire BudgetSelector into App.tsx with selectedBudget gating
 */
export function App() {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'sync'>('suggestions');
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);

  const handleBudgetSelect = useCallback((budget: Budget) => {
    setSelectedBudget(budget);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Actual Budget Assistant</h1>
        <p>AI-powered categorization suggestions</p>
      </header>

      <BudgetSelector 
        selectedBudget={selectedBudget}
        onBudgetSelect={handleBudgetSelect}
      />

      {selectedBudget ? (
        <>
          <nav className="app-nav">
            <button
              className={activeTab === 'suggestions' ? 'active' : ''}
              onClick={() => setActiveTab('suggestions')}
            >
              Review Suggestions
            </button>
            <button
              className={activeTab === 'sync' ? 'active' : ''}
              onClick={() => setActiveTab('sync')}
            >
              Sync Plan
            </button>
          </nav>

          <main className="app-main">
            {activeTab === 'suggestions' && (
              <SuggestionList budgetId={selectedBudget.id} />
            )}
            {activeTab === 'sync' && (
              <SyncPlanViewer budgetId={selectedBudget.id} />
            )}
          </main>
        </>
      ) : (
        <main className="app-main app-main--empty">
          <p>Please select a budget to get started.</p>
        </main>
      )}
    </div>
  );
}
