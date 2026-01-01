import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { api, type ApprovedChange } from '../services/api';
import { ProgressBar } from './ProgressBar';

interface ApplyChangesProps {
  budgetId: string;
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

export function ApplyChanges({ budgetId }: ApplyChangesProps) {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
  const queryClient = useQueryClient();
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['approved-changes', budgetId],
    queryFn: () => api.getApprovedChanges(budgetId),
    enabled: !!budgetId,
  });

  const applyMutation = useMutation({
    mutationFn: (suggestionIds: string[]) => api.applySuggestions(budgetId, suggestionIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approved-changes', budgetId] });
      queryClient.invalidateQueries({ queryKey: ['suggestions', budgetId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
      setExcludedIds(new Set());
    },
  });

  const changes = useMemo<ApprovedChange[]>(() => data?.changes ?? [], [data]);
  const selectedChanges = useMemo(
    () => changes.filter((c) => !excludedIds.has(c.suggestionId)),
    [changes, excludedIds]
  );

  const toggleExclude = (suggestionId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(suggestionId)) {
        next.delete(suggestionId);
      } else {
        next.add(suggestionId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (excludedIds.size === 0) {
      setExcludedIds(new Set(changes.map((c) => c.suggestionId)));
    } else {
      setExcludedIds(new Set());
    }
  };

  const handleApply = () => {
    if (selectedChanges.length === 0) return;
    setConfirmOpen(true);
  };

  const handleConfirmApply = () => {
    const idsToApply = selectedChanges.map((c) => c.suggestionId);
    setConfirmOpen(false);
    if (idsToApply.length === 0) return;
    applyMutation.mutate(idsToApply);
  };

  if (isLoading) {
    return (
      <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1200, p: 3 }}>
        <Typography variant="h6" fontWeight={600} color="text.primary">
          Apply Changes
        </Typography>
        <ProgressBar message="Loading approved suggestions..." />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1200, p: 3 }}>
        <Typography variant="h6" fontWeight={600} color="text.primary" sx={{ mb: 2 }}>
          Apply Changes
        </Typography>
        <Alert severity="error" variant="outlined">
          Error: {error.message}
        </Alert>
      </Box>
    );
  }

  const indeterminate = excludedIds.size > 0 && excludedIds.size < changes.length;
  const allSelected = excludedIds.size === 0 && changes.length > 0;

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
          Apply Changes
        </Typography>
        <Button variant="outlined" size="small" onClick={() => refetch()}>
          Refresh
        </Button>
      </Box>

      {changes.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ px: 4, py: 6, textAlign: 'center', bgcolor: 'background.default' }}
        >
          <Typography variant="body2" color="text.secondary">
            No approved suggestions to apply
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Approve suggestions in the Review tab first
          </Typography>
        </Paper>
      ) : (
        <>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              bgcolor: 'background.default',
              display: 'flex',
              gap: 2,
              alignItems: 'center',
            }}
          >
            <Checkbox
              checked={allSelected}
              indeterminate={indeterminate}
              onChange={toggleAll}
              size="small"
            />
            <Typography variant="body2" color="text.secondary">
              <strong>{selectedChanges.length}</strong> of {changes.length} selected
            </Typography>
            {excludedIds.size > 0 && (
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                label={`${excludedIds.size} excluded`}
              />
            )}
          </Paper>

          {isSmall ? (
            <Stack spacing={1.5}>
              {changes.map((change: ApprovedChange) => {
                const isExcluded = excludedIds.has(change.suggestionId);
                return (
                  <Paper
                    key={change.suggestionId}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      bgcolor: 'background.paper',
                      opacity: isExcluded ? 0.6 : 1,
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleExclude(change.suggestionId)}
                  >
                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Checkbox
                          checked={!isExcluded}
                          onChange={() => toggleExclude(change.suggestionId)}
                          size="small"
                        />
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {change.transactionPayee || '—'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(change.transactionDate)} ·{' '}
                            {formatAmount(change.transactionAmount)} ·{' '}
                            {change.transactionAccountName || '—'}
                          </Typography>
                        </Box>
                      </Box>

                      <Stack spacing={1}>
                        {change.hasPayeeChange && change.proposedPayeeName && (
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: '72px 1fr',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <Typography variant="caption" color="text.secondary">
                              Payee
                            </Typography>
                            <Chip
                              size="small"
                              variant="outlined"
                              color="warning"
                              label={change.proposedPayeeName}
                              sx={{
                                width: '100%',
                                borderRadius: 1,
                                justifySelf: 'start',
                                '& .MuiChip-label': {
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%',
                                },
                              }}
                            />
                          </Box>
                        )}
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: '72px 1fr',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Category
                          </Typography>
                          <Chip
                            size="small"
                            variant="outlined"
                            color="info"
                            label={change.proposedCategoryName || change.proposedCategoryId}
                            sx={{
                              width: '100%',
                              borderRadius: 1,
                              justifySelf: 'start',
                              '& .MuiChip-label': {
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '100%',
                              },
                            }}
                          />
                        </Box>
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          ) : (
            <Paper variant="outlined" sx={{ bgcolor: 'background.paper' }}>
              <Table size="small" aria-label="apply changes">
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        width: 40,
                        bgcolor: 'background.paper',
                        borderBottomColor: 'divider',
                      }}
                    >
                      <Checkbox
                        checked={allSelected}
                        indeterminate={indeterminate}
                        onChange={toggleAll}
                        size="small"
                      />
                    </TableCell>
                    {['Date', 'Payee', 'Amount', 'Account', 'Category'].map((label) => (
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
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {changes.map((change: ApprovedChange) => {
                    const isExcluded = excludedIds.has(change.suggestionId);
                    return (
                      <TableRow
                        key={change.suggestionId}
                        hover
                        sx={{
                          cursor: 'pointer',
                          opacity: isExcluded ? 0.6 : 1,
                          bgcolor: isExcluded ? 'background.default' : 'inherit',
                        }}
                        onClick={() => toggleExclude(change.suggestionId)}
                      >
                        <TableCell
                          sx={{ borderBottomColor: 'divider' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={!isExcluded}
                            onChange={() => toggleExclude(change.suggestionId)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell sx={{ borderBottomColor: 'divider' }}>
                          {formatDate(change.transactionDate)}
                        </TableCell>
                        <TableCell sx={{ borderBottomColor: 'divider' }}>
                          <Typography variant="body2" fontWeight={600}>
                            {change.transactionPayee || '—'}
                          </Typography>
                          {change.hasPayeeChange && change.proposedPayeeName && (
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                              <Typography variant="caption" color="primary">
                                →
                              </Typography>
                              <Chip
                                size="small"
                                variant="outlined"
                                color="warning"
                                label={change.proposedPayeeName}
                              />
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell
                          sx={{
                            borderBottomColor: 'divider',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                          }}
                        >
                          {formatAmount(change.transactionAmount)}
                        </TableCell>
                        <TableCell sx={{ borderBottomColor: 'divider' }}>
                          {change.transactionAccountName || '—'}
                        </TableCell>
                        <TableCell sx={{ borderBottomColor: 'divider' }}>
                          <Typography variant="caption" color="text.secondary">
                            {change.currentCategoryName || 'Uncategorized'}
                          </Typography>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                            <Typography variant="caption" color="primary">
                              →
                            </Typography>
                            <Chip
                              size="small"
                              variant="outlined"
                              color="info"
                              label={change.proposedCategoryName || change.proposedCategoryId}
                            />
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Box sx={{ mt: 3 }}>
            <Button
              variant="contained"
              color="success"
              fullWidth
              size="large"
              onClick={handleApply}
              disabled={applyMutation.isPending || selectedChanges.length === 0}
            >
              {applyMutation.isPending
                ? 'Applying...'
                : selectedChanges.length === 0
                  ? 'No Changes Selected'
                  : `Apply ${selectedChanges.length} Change${
                      selectedChanges.length !== 1 ? 's' : ''
                    }`}
            </Button>
          </Box>

          {applyMutation.isPending && <ProgressBar message="Starting apply job..." />}

          {applyMutation.isSuccess && (
            <Alert severity="success" variant="outlined" sx={{ mt: 2 }}>
              Apply job started. Track progress in the job center.
            </Alert>
          )}

          {applyMutation.error && (
            <Alert severity="error" variant="outlined" sx={{ mt: 2 }}>
              Failed to apply changes: {applyMutation.error.message}
            </Alert>
          )}
        </>
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Apply changes?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Apply {selectedChanges.length} change{selectedChanges.length !== 1 ? 's' : ''} to Actual
            Budget?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} variant="outlined">
            Cancel
          </Button>
          <Button variant="contained" color="success" onClick={handleConfirmApply}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
