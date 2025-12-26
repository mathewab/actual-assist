import { NavLink } from 'react-router-dom';
import { JobCenter } from './JobCenter';
import './Header.css';

interface HeaderProps {
  budgetName?: string;
  budgetId?: string;
}

export function Header({ budgetName, budgetId }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <h1>Actual Assist</h1>
        {budgetName && <span className="budget-badge">{budgetName}</span>}
      </div>
      <div className="header-actions">
        <nav className="header-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Suggestions
          </NavLink>
          <NavLink
            to="/apply"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Apply Changes
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            History
          </NavLink>
          <NavLink
            to="/audit"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Audit Log
          </NavLink>
        </nav>
        <JobCenter budgetId={budgetId} />
      </div>
    </header>
  );
}
