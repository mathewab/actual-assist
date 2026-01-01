import type { ReactNode } from 'react';
import { Component } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, title } = this.props;

    if (!error) {
      return children;
    }

    return (
      <Box sx={{ p: 3 }}>
        <Alert
          severity="error"
          variant="outlined"
          action={
            <Button color="inherit" size="small" onClick={this.handleReset}>
              Retry
            </Button>
          }
        >
          <Typography variant="subtitle2" fontWeight={600}>
            {title ?? 'Something went wrong'}
          </Typography>
          <Typography variant="body2">{error.message}</Typography>
        </Alert>
      </Box>
    );
  }
}
