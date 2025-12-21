import { useState } from 'react';
import { SuggestionList } from './components/SuggestionList';
import { SyncPlanViewer } from './components/SyncPlanViewer';
import './App.css';

export function App() {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'sync'>('suggestions');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Actual Budget Assistant</h1>
        <p>AI-powered categorization suggestions</p>
      </header>

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
        {activeTab === 'suggestions' && <SuggestionList />}
        {activeTab === 'sync' && <SyncPlanViewer />}
      </main>
    </div>
  );
}
