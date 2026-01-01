import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { defaultThemeId, themes, type ThemeDefinition, type ThemeId } from './themes';

interface AppThemeContextValue {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  options: ThemeDefinition[];
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);
const storageKey = 'actual-assist-theme';

const getInitialThemeId = (): ThemeId => {
  if (typeof window === 'undefined') {
    return defaultThemeId;
  }

  const stored = window.localStorage.getItem(storageKey);
  if (stored && themes.some((theme) => theme.id === stored)) {
    return stored as ThemeId;
  }

  return defaultThemeId;
};

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(getInitialThemeId);
  const activeTheme = useMemo(
    () => themes.find((theme) => theme.id === themeId) ?? themes[0],
    [themeId]
  );
  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: activeTheme.palette,
        typography: {
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          h5: { fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.3 },
          h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.35 },
          subtitle1: { fontSize: '0.95rem', fontWeight: 600 },
          subtitle2: { fontSize: '0.85rem', fontWeight: 600 },
          body1: { fontSize: '0.95rem', lineHeight: 1.6 },
          body2: { fontSize: '0.85rem', lineHeight: 1.55 },
          caption: { fontSize: '0.75rem', lineHeight: 1.5 },
          button: { fontSize: '0.85rem', fontWeight: 600, textTransform: 'none' },
        },
        components: {
          MuiInputBase: {
            styleOverrides: {
              input: { fontSize: '0.85rem' },
              root: { fontSize: '0.85rem' },
            },
          },
          MuiInputLabel: {
            styleOverrides: {
              root: { fontSize: '0.75rem' },
            },
          },
          MuiSelect: {
            styleOverrides: {
              select: { fontSize: '0.85rem' },
            },
          },
          MuiChip: {
            styleOverrides: {
              label: { fontSize: '0.7rem', fontWeight: 600 },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: { textTransform: 'none', fontWeight: 600 },
            },
          },
          MuiFormControlLabel: {
            styleOverrides: {
              label: { fontSize: '0.85rem', fontWeight: 'inherit' },
            },
          },
        },
      }),
    [activeTheme]
  );

  useEffect(() => {
    window.localStorage.setItem(storageKey, themeId);
  }, [themeId]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-bg', activeTheme.cssVars.bg);
    root.style.setProperty('--theme-text', activeTheme.cssVars.text);
    root.style.setProperty('--theme-surface', activeTheme.cssVars.surface);
    root.style.setProperty('--theme-muted', activeTheme.cssVars.muted);
    root.style.colorScheme = activeTheme.mode;
  }, [activeTheme]);

  const value = useMemo<AppThemeContextValue>(
    () => ({ themeId, setThemeId, options: themes }),
    [themeId]
  );

  return (
    <AppThemeContext.Provider value={value}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return context;
}
