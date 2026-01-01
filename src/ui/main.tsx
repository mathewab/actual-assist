import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GlobalStyles from '@mui/material/GlobalStyles';
import { StyledEngineProvider } from '@mui/material/styles';
import { App } from './App';
import { AppThemeProvider } from './theme/AppThemeProvider';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StyledEngineProvider enableCssLayer>
      <GlobalStyles styles="@layer theme, base, mui, components, utilities;" />
      <AppThemeProvider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </AppThemeProvider>
    </StyledEngineProvider>
  </React.StrictMode>
);
