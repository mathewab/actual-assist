import { NavLink, useLocation } from 'react-router-dom';
import { JobCenter } from './JobCenter';
import './Header.css';

interface HeaderProps {
  budgetName?: string;
  budgetId?: string;
}

export function Header({ budgetName, budgetId }: HeaderProps) {
  const location = useLocation();
  const isSuggestionsSection =
    location.pathname === '/' || location.pathname.startsWith('/history');
  const isSystemSection = location.pathname.startsWith('/audit');

  return (
    <header className="app-header">
      <div className="header-brand">
        <h1>Actual Assist</h1>
        {budgetName && <span className="budget-badge">{budgetName}</span>}
      </div>
      <div className="header-actions">
        <nav className="header-nav">
          <div className={`nav-menu ${isSuggestionsSection ? 'active' : ''}`}>
            <button type="button" className="nav-trigger" aria-haspopup="menu">
              Suggestions <span className="nav-caret">▾</span>
            </button>
            <div className="nav-dropdown" role="menu">
              <NavLink
                to="/"
                end
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                Review
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                History
              </NavLink>
            </div>
          </div>
          <div className={`nav-menu ${isSystemSection ? 'active' : ''}`}>
            <button type="button" className="nav-trigger" aria-haspopup="menu">
              System <span className="nav-caret">▾</span>
            </button>
            <div className="nav-dropdown" role="menu">
              <NavLink
                to="/audit"
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                Audit Log
              </NavLink>
            </div>
          </div>
        </nav>
        <JobCenter budgetId={budgetId} />
      </div>
    </header>
  );
}
