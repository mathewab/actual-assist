import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Checkbox from '@mui/material/Checkbox';
import Drawer from '@mui/material/Drawer';
import FormControlLabel from '@mui/material/FormControlLabel';
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
import Switch from '@mui/material/Switch';
import { api, type PayeeMergeCluster } from '../services/api';
import { loadPayeeMergeSettings } from '../services/payeeMergeSettings';

interface PayeeMergeToolProps {
  budgetId: string;
}

export function PayeeMergeTool({ budgetId }: PayeeMergeToolProps) {
  const queryClient = useQueryClient();
  const [settings] = useState(loadPayeeMergeSettings());
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [pendingClusterId, setPendingClusterId] = useState<string | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [excludedByCluster, setExcludedByCluster] = useState<Record<string, string[]>>({});
  const [targetByCluster, setTargetByCluster] = useState<Record<string, string>>({});
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

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
    mutationFn: () =>
      api.createPayeeMergeSuggestionsJob(
        budgetId,
        settings.minScore,
        settings.useAI,
        forceRegenerate,
        settings.aiMinClusterSize
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
      setForceRegenerate(false);
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
      if (job && (job.completedAt || job.status === 'succeeded' || job.status === 'failed')) {
        setPendingJobId(null);
        queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
      }
    },
  });

  const mergeMutation = useMutation({
    mutationFn: (payload: { targetPayeeId: string; mergePayeeIds: string[] }) =>
      api.mergePayees(payload.targetPayeeId, payload.mergePayeeIds, budgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
      setPendingClusterId(null);
      setPendingTargetId(null);
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
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Min score {settings.minScore} • AI {settings.useAI ? 'on' : 'off'} • AI min cluster{' '}
              {settings.aiMinClusterSize}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={forceRegenerate}
                  onChange={(event) => setForceRegenerate(event.target.checked)}
                  size="small"
                />
              }
              label="Force regenerate"
            />
            <Button
              variant="outlined"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ['payee-merge-suggestions'] })
              }
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
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
            const selectedTargetId =
              pendingClusterId === cluster.clusterId
                ? pendingTargetId
                : targetByCluster[cluster.clusterId];
            const effectiveTargetId =
              selectedTargetId && includedPayees.some((payee) => payee.id === selectedTargetId)
                ? selectedTargetId
                : includedPayees[0]?.id;
            const mergeIds = includedPayees
              .map((payee) => payee.id)
              .filter((id) => id !== effectiveTargetId);

            return (
              <Paper key={cluster.clusterId} variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
                <Stack spacing={2}>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle1" fontWeight={600}>
                        Duplicate group ({cluster.payees.length})
                      </Typography>
                      <Chip label={`${includedPayees.length} selected`} size="small" />
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setActiveClusterId(cluster.clusterId)}
                      >
                        Customize
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        color="inherit"
                        onClick={() => hideClusterMutation.mutate(cluster.groupHash)}
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
                              borderColor: (theme) =>
                                isExcluded ? theme.palette.divider : theme.palette.success.main,
                              '& .MuiChip-label': {
                                color: (theme) =>
                                  isExcluded
                                    ? theme.palette.text.secondary
                                    : theme.palette.text.primary,
                                fontWeight: isExcluded ? 400 : 600,
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

                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
                    <TextField
                      select
                      label="Merge into"
                      size="small"
                      value={effectiveTargetId ?? ''}
                      onChange={(event) => {
                        setPendingClusterId(cluster.clusterId);
                        setPendingTargetId(event.target.value);
                        setTargetByCluster((prev) => ({
                          ...prev,
                          [cluster.clusterId]: event.target.value,
                        }));
                      }}
                      sx={{ minWidth: 240 }}
                      SelectProps={{ native: true }}
                    >
                      {includedPayees.map((payee) => (
                        <option key={payee.id} value={payee.id}>
                          {payee.name}
                        </option>
                      ))}
                    </TextField>
                    <Button
                      variant="contained"
                      onClick={() =>
                        effectiveTargetId &&
                        mergeMutation.mutate({
                          targetPayeeId: effectiveTargetId,
                          mergePayeeIds: mergeIds,
                        })
                      }
                      disabled={
                        !effectiveTargetId ||
                        mergeIds.length === 0 ||
                        mergeMutation.isPending ||
                        clusterHasStalePayee
                      }
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
