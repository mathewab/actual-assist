import { useEffect, useRef, useState } from 'react';
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
  const isTemplatesSection = location.pathname.startsWith('/templates');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!headerRef.current) {
        return;
      }

      if (headerRef.current.contains(event.target as Node)) {
        return;
      }

      setIsMobileMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isMobileMenuOpen]);

  return (
    <header className="app-header" ref={headerRef}>
      <div className="header-brand">
        <h1>Actual Assist</h1>
        {budgetName && <span className="budget-badge">{budgetName}</span>}
        <button
          type="button"
          className={`header-menu-toggle ${isMobileMenuOpen ? 'open' : ''}`}
          aria-expanded={isMobileMenuOpen}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setIsMobileMenuOpen((open) => !open)}
        >
          <span className="hamburger" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>
      <div className={`header-actions ${isMobileMenuOpen ? 'open' : ''}`}>
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
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Review
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                onClick={() => setIsMobileMenuOpen(false)}
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
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Audit Log
              </NavLink>
            </div>
          </div>
          <div className={`nav-menu ${isTemplatesSection ? 'active' : ''}`}>
            <button type="button" className="nav-trigger" aria-haspopup="menu">
              Budget <span className="nav-caret">▾</span>
            </button>
            <div className="nav-dropdown" role="menu">
              <NavLink
                to="/templates"
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Templates
              </NavLink>
            </div>
          </div>
        </nav>
        <JobCenter budgetId={budgetId} />
      </div>
    </header>
  );
}
