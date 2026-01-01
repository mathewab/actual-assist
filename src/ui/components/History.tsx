import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { api, type Suggestion } from '../services/api';
import { ProgressBar } from './ProgressBar';

interface HistoryProps {
  budgetId: string;
}

export function History({ budgetId }: HistoryProps) {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isLoading, error } = useQuery({
    queryKey: ['suggestions', budgetId],
    queryFn: () => api.getSuggestionsByBudgetId(budgetId),
    enabled: !!budgetId,
  });

  if (isLoading) {
    return <ProgressBar message="Loading applied changes..." />;
  }

  if (error) {
    return (
      <Alert severity="error" variant="outlined">
        Error loading history: {error.message}
      </Alert>
    );
  }

  const appliedSuggestions = (data?.suggestions || []).filter(
    (s: Suggestion) => s.status === 'applied'
  );

  return (
    <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1200, p: 3 }}>
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
          pb: 2,
        }}
      >
        <Typography variant="h6" fontWeight={600} color="text.primary">
          Applied Changes History
        </Typography>
        <Chip
          label={`${appliedSuggestions.length} changes applied`}
          size="small"
          variant="outlined"
        />
      </Box>

      {appliedSuggestions.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ px: 4, py: 6, textAlign: 'center', bgcolor: 'background.default' }}
        >
          <Typography variant="body2" color="text.secondary">
            No changes have been applied yet.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Approve suggestions and apply them to see them here.
          </Typography>
        </Paper>
      ) : isSmall ? (
        <Stack spacing={1.5}>
          {appliedSuggestions.map((suggestion: Suggestion) => {
            const isNegative = (suggestion.transactionAmount || 0) < 0;
            return (
              <Paper
                key={suggestion.id}
                variant="outlined"
                sx={{ p: 1.5, bgcolor: 'background.paper' }}
              >
                <Stack spacing={1}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Date
                    </Typography>
                    <Typography variant="body2">
                      {formatDate(suggestion.transactionDate)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Payee
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {suggestion.transactionPayee || '—'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Amount
                    </Typography>
                    <Typography
                      variant="body2"
                      fontFamily="monospace"
                      color={isNegative ? 'error.main' : 'success.main'}
                    >
                      {formatAmount(suggestion.transactionAmount)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Account
                    </Typography>
                    <Typography variant="body2">
                      {suggestion.transactionAccountName || '—'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Category Applied
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <Chip
                        size="small"
                        color="success"
                        variant="outlined"
                        label={
                          suggestion.categorySuggestion?.proposedCategoryName ||
                          suggestion.proposedCategoryName ||
                          '—'
                        }
                      />
                    </Box>
                  </Box>
                  {suggestion.payeeSuggestion?.proposedPayeeName && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Payee Applied
                      </Typography>
                      <Box sx={{ mt: 0.5 }}>
                        <Chip
                          size="small"
                          color="info"
                          variant="outlined"
                          label={suggestion.payeeSuggestion.proposedPayeeName}
                        />
                      </Box>
                    </Box>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: 'background.paper' }}>
          <Table size="small" aria-label="applied changes history">
            <TableHead>
              <TableRow>
                {['Date', 'Payee', 'Amount', 'Account', 'Category Applied', 'Payee Applied'].map(
                  (label) => (
                    <TableCell
                      key={label}
                      sx={{
                        bgcolor: 'background.paper',
                        borderBottomColor: 'divider',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'text.secondary',
                      }}
                    >
                      {label}
                    </TableCell>
                  )
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {appliedSuggestions.map((suggestion: Suggestion) => {
                const isNegative = (suggestion.transactionAmount || 0) < 0;

                return (
                  <TableRow key={suggestion.id} hover>
                    <TableCell sx={{ borderBottomColor: 'divider' }}>
                      {formatDate(suggestion.transactionDate)}
                    </TableCell>
                    <TableCell sx={{ borderBottomColor: 'divider' }}>
                      <Typography variant="body2" fontWeight={600}>
                        {suggestion.transactionPayee || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        borderBottomColor: 'divider',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        color: isNegative ? 'error.main' : 'success.main',
                      }}
                    >
                      {formatAmount(suggestion.transactionAmount)}
                    </TableCell>
                    <TableCell sx={{ borderBottomColor: 'divider' }}>
                      {suggestion.transactionAccountName || '—'}
                    </TableCell>
                    <TableCell sx={{ borderBottomColor: 'divider' }}>
                      <Chip
                        size="small"
                        color="success"
                        variant="outlined"
                        label={
                          suggestion.categorySuggestion?.proposedCategoryName ||
                          suggestion.proposedCategoryName ||
                          '—'
                        }
                      />
                    </TableCell>
                    <TableCell sx={{ borderBottomColor: 'divider' }}>
                      {suggestion.payeeSuggestion?.proposedPayeeName ? (
                        <Chip
                          size="small"
                          color="info"
                          variant="outlined"
                          label={suggestion.payeeSuggestion.proposedPayeeName}
                        />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  const dollars = amount / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(dollars);
}
