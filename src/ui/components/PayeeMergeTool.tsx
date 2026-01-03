import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Checkbox from '@mui/material/Checkbox';
import Drawer from '@mui/material/Drawer';
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
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { api, type PayeeMergeCluster } from '../services/api';
import { loadPayeeMergeSettings } from '../services/payeeMergeSettings';

interface PayeeMergeToolProps {
  budgetId: string;
}

type TargetSelection = { mode: 'existing'; payeeId: string } | { mode: 'new'; name: string };

type PayeeOption =
  | { id: string; name: string; type: 'existing' }
  | { id: 'add_new'; name: string; type: 'add_new' };

export function PayeeMergeTool({ budgetId }: PayeeMergeToolProps) {
  const queryClient = useQueryClient();
  const [settings] = useState(loadPayeeMergeSettings());
  const [forceDialogOpen, setForceDialogOpen] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [pendingClusterId, setPendingClusterId] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<TargetSelection | null>(null);
  const [excludedByCluster, setExcludedByCluster] = useState<Record<string, string[]>>({});
  const [targetByCluster, setTargetByCluster] = useState<Record<string, TargetSelection>>({});
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
  const filterPayeeOptions = createFilterOptions<PayeeOption>();
  const addNewOption: PayeeOption = { id: 'add_new', name: 'Add new payee', type: 'add_new' };

  const { data, isLoading, error } = useQuery({
    queryKey: ['payee-merge-suggestions', budgetId, settings.minScore],
    queryFn: () => api.getPayeeMergeSuggestions(budgetId, settings.minScore),
    enabled: !!budgetId,
    onSuccess: (response) => {
      if (!pendingJobId) return;
      if (!response.cache.stale && response.clusters.length > 0) {
        setPendingJobId(null);
      }
    },
  });

  const generateMutation = useMutation({
    mutationFn: (force: boolean) =>
      api.createPayeeMergeSuggestionsJob(
        budgetId,
        settings.minScore,
        settings.useAI,
        force,
        settings.aiMinClusterSize
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
      if (result?.job?.id) {
        if (result.job.completedAt) {
          setPendingJobId(null);
          queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] });
        } else {
          setPendingJobId(result.job.id);
        }
      }
    },
  });

  useQuery({
    queryKey: ['job', pendingJobId],
    queryFn: () => api.getJob(pendingJobId ?? ''),
    enabled: Boolean(pendingJobId),
    refetchInterval: pendingJobId ? 2000 : false,
    onSuccess: (response) => {
      if (!pendingJobId) return;
      const { job } = response;
      if (job.completedAt || job.status === 'succeeded' || job.status === 'failed') {
        setPendingJobId(null);
        queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
      }
    },
    onError: () => {
      if (!pendingJobId) return;
      setPendingJobId(null);
      queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
    },
  });

  useQuery({
    queryKey: ['jobs', budgetId, pendingJobId],
    queryFn: () => api.listJobs({ budgetId, limit: 50 }),
    enabled: Boolean(budgetId && pendingJobId),
    refetchInterval: pendingJobId ? 3000 : false,
    onSuccess: (response) => {
      if (!pendingJobId) return;
      const job = response.jobs.find((item) => item.id === pendingJobId);
      if (!job) {
        setPendingJobId(null);
        queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
        return;
      }
      if (job && (job.completedAt || job.status === 'succeeded' || job.status === 'failed')) {
        setPendingJobId(null);
        queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
      }
    },
  });

  const mergeMutation = useMutation({
    mutationFn: (payload: {
      targetPayeeId?: string;
      targetPayeeName?: string;
      mergePayeeIds: string[];
    }) =>
      api.mergePayees({
        ...payload,
        budgetId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
      setPendingClusterId(null);
      setPendingTarget(null);
    },
  });

  const hideClusterMutation = useMutation({
    mutationFn: (groupHash: string) => api.hidePayeeMergeCluster(budgetId, groupHash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] });
    },
  });

  const unhideClusterMutation = useMutation({
    mutationFn: (groupHash: string) => api.unhidePayeeMergeCluster(budgetId, groupHash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] });
    },
  });

  const clusters = useMemo<PayeeMergeCluster[]>(() => data?.clusters ?? [], [data]);
  const visibleClusters = clusters.filter((cluster) => !cluster.hidden);
  const hiddenClusters = clusters.filter((cluster) => cluster.hidden);
  const cache = data?.cache;
  const isCacheStale = Boolean(cache?.stale);
  const stalePayeeIds = useMemo(() => new Set(cache?.stalePayeeIds ?? []), [cache]);
  const showPendingBanner = Boolean(pendingJobId && (isCacheStale || clusters.length === 0));

  const toggleExcluded = (clusterId: string, payeeId: string) => {
    setExcludedByCluster((prev) => {
      const current = new Set(prev[clusterId] ?? []);
      if (current.has(payeeId)) {
        current.delete(payeeId);
      } else {
        current.add(payeeId);
      }
      return { ...prev, [clusterId]: Array.from(current) };
    });
  };

  const setTargetSelection = (clusterId: string, selection: TargetSelection) => {
    setPendingClusterId(clusterId);
    setPendingTarget(selection);
    setTargetByCluster((prev) => ({
      ...prev,
      [clusterId]: selection,
    }));
  };

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Payee tools
          </Typography>
          <Typography variant="h5" fontWeight={700} color="text.primary" sx={{ mt: 0.5 }}>
            Duplicate payee suggestions
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Review duplicate payee clusters and merge them to keep your budget clean.
          </Typography>
        </Box>

        <Paper
          variant="outlined"
          sx={{
            p: 2.5,
            borderRadius: 3,
            bgcolor: 'background.default',
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2,
            alignItems: { xs: 'stretch', md: 'center' },
            justifyContent: 'space-between',
          }}
        >
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" fontWeight={600}>
              Duplicate detection settings
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Configure min score and AI refinement in Settings.
            </Typography>
          </Stack>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            alignItems={{ xs: 'stretch', md: 'center' }}
            sx={{ width: { xs: '100%', md: 'auto' } }}
          >
            <Typography variant="body2" color="text.secondary">
              Min score {settings.minScore} • AI {settings.useAI ? 'on' : 'off'} • AI min cluster{' '}
              {settings.aiMinClusterSize}
            </Typography>
            <Button
              variant="outlined"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] })
              }
              fullWidth={isSmall}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                if (!isCacheStale && clusters.length > 0) {
                  setForceDialogOpen(true);
                  return;
                }
                generateMutation.mutate(false);
              }}
              disabled={generateMutation.isPending}
              fullWidth={isSmall}
            >
              {generateMutation.isPending ? 'Generating...' : 'Generate suggestions'}
            </Button>
          </Stack>
        </Paper>

        {showPendingBanner && (
          <Alert severity="info">
            Generating suggestions in the background. This view will refresh when the job completes.
          </Alert>
        )}

        {isCacheStale && !pendingJobId && (
          <Alert severity="warning">
            Your payees have changed since the last generate. Run &quot;Generate suggestions&quot;
            to refresh.
          </Alert>
        )}

        {error && (
          <Alert severity="error">
            {error instanceof Error ? error.message : 'Failed to load payee merge suggestions.'}
          </Alert>
        )}

        {hiddenClusters.length > 0 && (
          <Alert severity="info">
            Some groups are hidden. You can review them in the Hidden groups section below.
          </Alert>
        )}

        <Stack spacing={2}>
          {isLoading && (
            <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Scanning payees for duplicates...
              </Typography>
            </Paper>
          )}

          {!isLoading && clusters.length === 0 && (
            <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No cached clusters yet. Run &quot;Generate suggestions&quot; to scan payees.
              </Typography>
            </Paper>
          )}

          {visibleClusters.map((cluster) => {
            const excluded = new Set(excludedByCluster[cluster.clusterId] ?? []);
            const includedPayees = cluster.payees.filter((payee) => !excluded.has(payee.id));
            const clusterHasStalePayee = cluster.payees.some((payee) =>
              stalePayeeIds.has(payee.id)
            );
            const payeeOptions: PayeeOption[] = includedPayees.map((payee) => ({
              id: payee.id,
              name: payee.name,
              type: 'existing',
            }));
            const rawSelection =
              pendingClusterId === cluster.clusterId
                ? pendingTarget
                : targetByCluster[cluster.clusterId];
            const fallbackSelection = includedPayees[0]
              ? { mode: 'existing', payeeId: includedPayees[0].id }
              : null;
            const effectiveSelection =
              rawSelection?.mode === 'existing' &&
              payeeOptions.every((option) => option.id !== rawSelection.payeeId)
                ? fallbackSelection
                : (rawSelection ?? fallbackSelection);
            const selectedOption =
              effectiveSelection?.mode === 'existing'
                ? (payeeOptions.find((option) => option.id === effectiveSelection.payeeId) ?? null)
                : effectiveSelection?.mode === 'new'
                  ? addNewOption
                  : null;
            const selectedInputValue =
              effectiveSelection?.mode === 'existing'
                ? (payeeOptions.find((option) => option.id === effectiveSelection.payeeId)?.name ??
                  '')
                : effectiveSelection?.mode === 'new'
                  ? effectiveSelection.name
                  : '';
            const mergeIds =
              effectiveSelection?.mode === 'existing'
                ? includedPayees
                    .map((payee) => payee.id)
                    .filter((id) => id !== effectiveSelection.payeeId)
                : includedPayees.map((payee) => payee.id);

            return (
              <Paper key={cluster.clusterId} variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'flex-start', md: 'center' }}
                    justifyContent="space-between"
                  >
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="subtitle1" fontWeight={600}>
                        Duplicate group ({cluster.payees.length})
                      </Typography>
                      <Chip label={`${includedPayees.length} selected`} size="small" />
                    </Stack>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'stretch', md: 'center' }}
                      sx={{ width: { xs: '100%', md: 'auto' } }}
                    >
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setActiveClusterId(cluster.clusterId)}
                        fullWidth={isSmall}
                      >
                        Customize
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        color="inherit"
                        onClick={() => hideClusterMutation.mutate(cluster.groupHash)}
                        fullWidth={isSmall}
                      >
                        Hide
                      </Button>
                    </Stack>
                  </Stack>

                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {cluster.payees.map((payee) =>
                      (() => {
                        const isExcluded = excluded.has(payee.id);
                        return (
                          <Chip
                            key={payee.id}
                            label={payee.name}
                            size="small"
                            variant="outlined"
                            sx={{
                              mb: 1,
                              borderRadius: 1,
                              bgcolor: 'transparent',
                              maxWidth: '100%',
                              minWidth: 0,
                              borderColor: (theme) =>
                                isExcluded ? theme.palette.divider : theme.palette.success.main,
                              '& .MuiChip-label': {
                                color: (theme) =>
                                  isExcluded
                                    ? theme.palette.text.secondary
                                    : theme.palette.text.primary,
                                fontWeight: isExcluded ? 400 : 600,
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              },
                            }}
                          />
                        );
                      })()
                    )}
                  </Stack>

                  {clusterHasStalePayee && (
                    <Alert severity="warning" sx={{ py: 0.5 }}>
                      This group includes payees that changed since the last generate. Regenerate
                      suggestions before merging.
                    </Alert>
                  )}

                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={2}
                    alignItems={{ xs: 'stretch', md: 'center' }}
                  >
                    <Autocomplete
                      options={[...payeeOptions, addNewOption]}
                      value={selectedOption}
                      inputValue={selectedInputValue}
                      onInputChange={(_, newInputValue, reason) => {
                        if (reason === 'input') {
                          setTargetSelection(cluster.clusterId, {
                            mode: 'new',
                            name: newInputValue,
                          });
                        }
                      }}
                      onChange={(_, newValue) => {
                        if (!newValue) return;
                        if (typeof newValue === 'string') {
                          setTargetSelection(cluster.clusterId, {
                            mode: 'new',
                            name: newValue,
                          });
                          return;
                        }
                        if (newValue.type === 'add_new') {
                          setTargetSelection(cluster.clusterId, {
                            mode: 'new',
                            name: effectiveSelection?.mode === 'new' ? effectiveSelection.name : '',
                          });
                          return;
                        }
                        setTargetSelection(cluster.clusterId, {
                          mode: 'existing',
                          payeeId: newValue.id,
                        });
                      }}
                      getOptionLabel={(option) =>
                        typeof option === 'string' ? option : option.name
                      }
                      isOptionEqualToValue={(option, value) =>
                        option.id === value.id && option.type === value.type
                      }
                      filterOptions={(options, params) => {
                        const existingOptions = options.filter(
                          (option) => option.type !== 'add_new'
                        );
                        const filtered = filterPayeeOptions(existingOptions, params);
                        return [...filtered, addNewOption];
                      }}
                      fullWidth={isSmall}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Merge into"
                          size="small"
                          helperText={
                            effectiveSelection?.mode === 'new'
                              ? 'Enter the new payee name.'
                              : undefined
                          }
                        />
                      )}
                      sx={{ minWidth: { md: 240 } }}
                    />
                    <Button
                      variant="contained"
                      onClick={() =>
                        effectiveSelection &&
                        mergeMutation.mutate({
                          targetPayeeId:
                            effectiveSelection.mode === 'existing'
                              ? effectiveSelection.payeeId
                              : undefined,
                          targetPayeeName:
                            effectiveSelection.mode === 'new'
                              ? effectiveSelection.name.trim()
                              : undefined,
                          mergePayeeIds: mergeIds,
                        })
                      }
                      disabled={
                        !effectiveSelection ||
                        (effectiveSelection.mode === 'new' &&
                          effectiveSelection.name.trim().length === 0) ||
                        mergeIds.length === 0 ||
                        mergeMutation.isPending ||
                        clusterHasStalePayee
                      }
                      fullWidth={isSmall}
                    >
                      Merge payees
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>

        {hiddenClusters.length > 0 && (
          <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={600}>
                Hidden groups ({hiddenClusters.length})
              </Typography>
              {hiddenClusters.map((cluster) => (
                <Paper key={cluster.clusterId} variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="body2" fontWeight={600}>
                        Duplicate group ({cluster.payees.length})
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => unhideClusterMutation.mutate(cluster.groupHash)}
                      >
                        Undo hide
                      </Button>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      This group is hidden. It may reappear if the duplicate group&apos;s payees
                      change in future generations.
                    </Typography>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>
      <Dialog open={forceDialogOpen} onClose={() => setForceDialogOpen(false)}>
        <DialogTitle>Suggestions are already up to date</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Your payees have not changed since the last generate. Do you want to force regeneration
            anyway?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForceDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              setForceDialogOpen(false);
              generateMutation.mutate(true);
            }}
          >
            Force generate
          </Button>
        </DialogActions>
      </Dialog>
      <Drawer
        anchor="right"
        open={Boolean(activeClusterId)}
        onClose={() => setActiveClusterId(null)}
        PaperProps={{
          sx: {
            width: isSmall ? '100%' : 420,
            p: 2,
          },
        }}
      >
        {activeClusterId && (
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle1" fontWeight={600}>
                Customize group
              </Typography>
              <Button size="small" onClick={() => setActiveClusterId(null)}>
                Close
              </Button>
            </Stack>

            {clusters
              .filter((cluster) => cluster.clusterId === activeClusterId)
              .map((cluster) => {
                const excluded = new Set(excludedByCluster[cluster.clusterId] ?? []);
                return (
                  <Table key={cluster.clusterId} size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">Include</TableCell>
                        <TableCell>Payee</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cluster.payees.map((payee) => {
                        const isExcluded = excluded.has(payee.id);
                        return (
                          <TableRow key={payee.id} hover>
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={!isExcluded}
                                onChange={() => toggleExcluded(cluster.clusterId, payee.id)}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>{payee.name}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                );
              })}
          </Stack>
        )}
      </Drawer>
    </Box>
  );
}
