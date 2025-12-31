import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { JobCenter } from './JobCenter';

interface HeaderProps {
  budgetName?: string;
  budgetId?: string;
}

const navLinkClass = (isActive: boolean) =>
  [
    'block rounded-md px-3 py-2 text-sm font-medium transition',
    'text-white hover:bg-white/15',
    'md:text-slate-700 md:hover:bg-blue-50 md:hover:text-blue-700',
    isActive ? 'bg-white/25 text-white md:bg-blue-100 md:text-blue-800' : '',
  ]
    .filter(Boolean)
    .join(' ');

const navTriggerClass = (isActive: boolean) =>
  [
    'flex w-full items-center justify-between rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold transition',
    'text-white/85 hover:bg-white/20 hover:text-white',
    'md:w-auto md:border-transparent md:bg-transparent md:text-white',
    isActive ? 'bg-white/25 text-white' : '',
  ]
    .filter(Boolean)
    .join(' ');

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
    <header
      className="sticky top-0 z-50 flex flex-col gap-3 bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-3 text-white shadow-md md:flex-row md:items-center md:justify-between"
      ref={headerRef}
    >
      <div className="flex w-full items-center gap-3 md:w-auto">
        <h1 className="text-xl font-semibold tracking-tight">Actual Assist</h1>
        {budgetName && (
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium">
            {budgetName}
          </span>
        )}
        <button
          type="button"
          className={[
            'ml-auto inline-flex items-center justify-center rounded-lg border border-white/35 bg-white/10 px-3 py-2 text-sm font-semibold transition hover:bg-white/20',
            isMobileMenuOpen ? 'border-white/70 bg-white/30' : '',
            'md:hidden',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-expanded={isMobileMenuOpen}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setIsMobileMenuOpen((open) => !open)}
        >
          <span className="relative flex h-3 w-5 flex-col justify-between" aria-hidden="true">
            <span
              className={[
                'block h-0.5 w-full rounded-full bg-white transition',
                isMobileMenuOpen ? 'translate-y-[5px] rotate-45' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <span
              className={[
                'block h-0.5 w-full rounded-full bg-white transition',
                isMobileMenuOpen ? 'opacity-0' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <span
              className={[
                'block h-0.5 w-full rounded-full bg-white transition',
                isMobileMenuOpen ? '-translate-y-[5px] -rotate-45' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          </span>
        </button>
      </div>

      <div
        className={[
          'w-full flex-col items-stretch gap-3',
          isMobileMenuOpen ? 'flex' : 'hidden',
          'md:flex md:w-auto md:flex-row md:items-center',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <nav className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          <div className="group relative w-full md:w-auto">
            <button type="button" className={navTriggerClass(isSuggestionsSection)}>
              Suggestions <span className="ml-2 hidden text-xs md:inline">▾</span>
            </button>
            <div className="mt-2 flex flex-col gap-1 rounded-lg bg-white/15 p-2 md:absolute md:left-0 md:top-full md:mt-2 md:min-w-[180px] md:-translate-y-1 md:opacity-0 md:pointer-events-none md:bg-white md:text-slate-800 md:shadow-xl md:transition md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100 md:group-focus-within:pointer-events-auto">
              <NavLink
                to="/"
                end
                className={({ isActive }) => navLinkClass(isActive)}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Review
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) => navLinkClass(isActive)}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                History
              </NavLink>
            </div>
          </div>
          <div className="group relative w-full md:w-auto">
            <button type="button" className={navTriggerClass(isSystemSection)}>
              System <span className="ml-2 hidden text-xs md:inline">▾</span>
            </button>
            <div className="mt-2 flex flex-col gap-1 rounded-lg bg-white/15 p-2 md:absolute md:left-0 md:top-full md:mt-2 md:min-w-[180px] md:-translate-y-1 md:opacity-0 md:pointer-events-none md:bg-white md:text-slate-800 md:shadow-xl md:transition md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100 md:group-focus-within:pointer-events-auto">
              <NavLink
                to="/audit"
                className={({ isActive }) => navLinkClass(isActive)}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Audit Log
              </NavLink>
            </div>
          </div>
          <div className="group relative w-full md:w-auto">
            <button type="button" className={navTriggerClass(isTemplatesSection)}>
              Budget <span className="ml-2 hidden text-xs md:inline">▾</span>
            </button>
            <div className="mt-2 flex flex-col gap-1 rounded-lg bg-white/15 p-2 md:absolute md:left-0 md:top-full md:mt-2 md:min-w-[180px] md:-translate-y-1 md:opacity-0 md:pointer-events-none md:bg-white md:text-slate-800 md:shadow-xl md:transition md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100 md:group-focus-within:pointer-events-auto">
              <NavLink
                to="/templates"
                className={({ isActive }) => navLinkClass(isActive)}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Templates
              </NavLink>
            </div>
          </div>
        </nav>
        <div className="self-end md:self-auto">
          <JobCenter budgetId={budgetId} />
        </div>
      </div>
    </header>
  );
}
