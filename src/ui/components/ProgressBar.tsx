import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

interface ProgressBarProps {
  /** Message to display above the progress bar */
  message?: string;
  /** Whether the progress is indeterminate (animated) */
  indeterminate?: boolean;
  /** Progress value between 0 and 100 (for determinate progress) */
  value?: number;
}

/**
 * A progress bar component for showing loading states
 * during sync and LLM operations
 */
export function ProgressBar({
  message = 'Processing...',
  indeterminate = true,
  value = 0,
}: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        my: 2,
        px: 2.5,
        py: 2,
        borderColor: theme.palette.divider,
        bgcolor: theme.palette.background.default,
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <CircularProgress size={14} thickness={5} />
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          {message}
        </Typography>
      </Box>
      <LinearProgress
        variant={indeterminate ? 'indeterminate' : 'determinate'}
        value={clampedValue}
        sx={{ height: 6, borderRadius: 999, bgcolor: 'action.hover' }}
      />
    </Paper>
  );
}
