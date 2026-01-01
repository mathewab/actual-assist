import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { api, getJobEventsStreamUrl, type Job } from '../services/api';

interface JobCenterProps {
  budgetId?: string;
}

type ToastPhase = 'running' | 'completed';

interface ToastState {
  job: Job;
  phase: ToastPhase;
}

const COMPLETED_TOAST_MS = 60_000;

const statusColor = (status: string): 'default' | 'info' | 'success' | 'error' | 'warning' => {
  switch (status) {
    case 'queued':
      return 'default';
    case 'running':
      return 'info';
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'error';
    case 'canceled':
      return 'warning';
    default:
      return 'default';
  }
};

const statusBorderColor = (status: string): string => {
  switch (status) {
    case 'succeeded':
      return 'success.main';
    case 'failed':
      return 'error.main';
    case 'canceled':
      return 'warning.main';
    default:
      return 'info.main';
  }
};

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatJobType(type: Job['type']): string {
  switch (type) {
    case 'budget_sync':
      return 'Sync Budget';
    case 'suggestions_generate':
      return 'Generate Suggestions (AI)';
    case 'sync_and_suggest':
      return 'Sync & Generate (AI)';
    case 'suggestions_retry_payee':
      return 'Retry Suggestions';
    case 'suggestions_apply':
      return 'Apply Suggestions';
    case 'templates_apply':
      return 'Apply Templates';
    case 'payees_merge':
      return 'Merge Payees';
    case 'payees_merge_suggestions_generate':
      return 'Generate Payee Merges';
    case 'snapshot_create':
      return 'Create Snapshot';
    case 'snapshot_redownload':
      return 'Redownload Snapshot';
    case 'scheduled_sync_and_suggest':
      return 'Scheduled Sync & Generate (AI)';
    default:
      return type;
  }
}

function sortJobsByCreatedAt(items: Job[]): Job[] {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function JobCenter({ budgetId }: JobCenterProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastRef = useRef<ToastState | null>(null);
  const lastActiveJobIdRef = useRef<string | null>(null);
  const toastHideTimeoutRef = useRef<number | null>(null);
  const completedToastUntilRef = useRef<number | null>(null);
  const hasBudget = Boolean(budgetId);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const setToastState = useCallback((next: ToastState | null) => {
    toastRef.current = next;
    setToast(next);
  }, []);

  const clearToastTimeout = useCallback(() => {
    if (toastHideTimeoutRef.current) {
      window.clearTimeout(toastHideTimeoutRef.current);
      toastHideTimeoutRef.current = null;
    }
  }, []);

  const showToastForJob = useCallback(
    (job: Job) => {
      clearToastTimeout();

      if (job.status === 'running' || job.status === 'queued') {
        completedToastUntilRef.current = null;
        lastActiveJobIdRef.current = job.id;
        setToastState({ job, phase: 'running' });
        return;
      }

      completedToastUntilRef.current = Date.now() + COMPLETED_TOAST_MS;
      lastActiveJobIdRef.current = null;
      setToastState({ job, phase: 'completed' });
      toastHideTimeoutRef.current = window.setTimeout(() => {
        completedToastUntilRef.current = null;
        setToastState(null);
      }, COMPLETED_TOAST_MS);
    },
    [clearToastTimeout, setToastState]
  );

  const updateToastForJobs = useCallback(
    (items: Job[]) => {
      const active = items.filter((job) => job.status === 'running' || job.status === 'queued');
      if (active.length > 0) {
        const latestActive = active[0];
        clearToastTimeout();
        completedToastUntilRef.current = null;
        lastActiveJobIdRef.current = latestActive.id;
        setToastState({ job: latestActive, phase: 'running' });
        return;
      }

      const lastActiveId = lastActiveJobIdRef.current;
      if (!lastActiveId) {
        if (
          toastRef.current?.phase === 'completed' &&
          completedToastUntilRef.current &&
          Date.now() < completedToastUntilRef.current
        ) {
          return;
        }
        clearToastTimeout();
        completedToastUntilRef.current = null;
        setToastState(null);
        return;
      }

      const finishedJob = items.find((job) => job.id === lastActiveId && job.completedAt);
      if (!finishedJob) {
        clearToastTimeout();
        completedToastUntilRef.current = null;
        setToastState(null);
        return;
      }

      if (toastRef.current?.job.id !== finishedJob.id || toastRef.current?.phase !== 'completed') {
        clearToastTimeout();
        completedToastUntilRef.current = Date.now() + COMPLETED_TOAST_MS;
        toastHideTimeoutRef.current = window.setTimeout(() => {
          completedToastUntilRef.current = null;
          setToastState(null);
        }, COMPLETED_TOAST_MS);
      }
      setToastState({ job: finishedJob, phase: 'completed' });
      lastActiveJobIdRef.current = null;
    },
    [clearToastTimeout, setToastState]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs', budgetId],
    queryFn: () => api.listJobs({ budgetId: budgetId ?? '', limit: 25 }),
    enabled: hasBudget,
    refetchInterval: 4000,
    onSuccess: (response) => {
      updateToastForJobs(sortJobsByCreatedAt(response.jobs ?? []));
    },
  });

  const jobs = useMemo(() => {
    return sortJobsByCreatedAt(data?.jobs ?? []);
  }, [data]);

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === 'running' || job.status === 'queued'),
    [jobs]
  );

  useEffect(() => {
    if (!hasBudget && toastHideTimeoutRef.current) {
      window.clearTimeout(toastHideTimeoutRef.current);
      toastHideTimeoutRef.current = null;
      lastActiveJobIdRef.current = null;
      completedToastUntilRef.current = null;
      toastRef.current = null;
    }
  }, [hasBudget]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<Job>).detail;
      if (detail) {
        showToastForJob(detail);
      }
    };

    window.addEventListener('job-toast', handler);
    return () => window.removeEventListener('job-toast', handler);
  }, [showToastForJob]);

  useEffect(() => {
    if (!hasBudget || !budgetId) return;

    const source = new EventSource(getJobEventsStreamUrl(budgetId));
    const handler = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { job?: Job };
        const job = payload.job;
        if (!job) return;
        if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
          window.dispatchEvent(new CustomEvent<Job>('job-toast', { detail: job }));
        }
      } catch {
        // ignore malformed event payloads
      }
    };

    source.addEventListener('job', handler);

    return () => {
      source.removeEventListener('job', handler);
      source.close();
    };
  }, [budgetId, hasBudget]);

  useEffect(() => {
    return () => {
      if (toastHideTimeoutRef.current) {
        window.clearTimeout(toastHideTimeoutRef.current);
      }
    };
  }, []);

  const runningCount = activeJobs.length;
  const historyJobs = jobs.slice(0, 10);
  const showToast = hasBudget && !isLoading && toast;
  const isHistoryVisible = drawerOpen;

  const toastLabel = toast
    ? `${formatJobType(toast.job.type)} job ${
        toast.phase === 'running'
          ? toast.job.status === 'queued'
            ? 'queued'
            : 'running'
          : toast.job.status
      }`
    : '';

  const toastDetail = toast
    ? toast.phase === 'running'
      ? 'Working in the background'
      : `Completed at ${formatTimestamp(toast.job.completedAt)}`
    : '';

  return (
    <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <IconButton
        size="small"
        color="inherit"
        disabled={!hasBudget}
        title={hasBudget ? 'Job history' : 'Select a budget to view jobs'}
        aria-label="Job history"
        aria-expanded={isHistoryVisible}
        onClick={(event) => {
          if (!hasBudget) return;
          event.stopPropagation();
          setDrawerOpen((prev) => !prev);
        }}
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'rgba(255,255,255,0.35)',
          bgcolor: 'rgba(255,255,255,0.08)',
          color: 'common.white',
          '&:hover': {
            bgcolor: 'rgba(255,255,255,0.18)',
            borderColor: 'rgba(255,255,255,0.6)',
          },
        }}
      >
        <Badge
          color="error"
          badgeContent={runningCount}
          invisible={runningCount === 0}
          overlap="circular"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5v5l3.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Badge>
      </IconButton>

      <Snackbar
        open={Boolean(showToast)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        onClose={(_event, reason) => {
          if (reason === 'clickaway') return;
          if (toastHideTimeoutRef.current) {
            window.clearTimeout(toastHideTimeoutRef.current);
            toastHideTimeoutRef.current = null;
          }
          completedToastUntilRef.current = null;
          toastRef.current = null;
          setToast(null);
        }}
        autoHideDuration={toast?.phase === 'completed' ? COMPLETED_TOAST_MS : null}
      >
        <Alert
          severity={toast ? statusColor(toast.job.status) : 'info'}
          variant="filled"
          icon={
            toast?.phase === 'running' ? <CircularProgress size={14} color="inherit" /> : undefined
          }
          action={
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                if (toastHideTimeoutRef.current) {
                  window.clearTimeout(toastHideTimeoutRef.current);
                  toastHideTimeoutRef.current = null;
                }
                completedToastUntilRef.current = null;
                toastRef.current = null;
                setToast(null);
              }}
            >
              Dismiss
            </Button>
          }
        >
          <Typography variant="subtitle2" fontWeight={600}>
            {toastLabel}
          </Typography>
          <Typography variant="caption">{toastDetail}</Typography>
        </Alert>
      </Snackbar>

      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={isHistoryVisible}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 380 },
            maxHeight: { xs: '85vh', sm: '100%' },
            borderRadius: { xs: '16px 16px 0 0', sm: 0 },
            p: 2,
          },
        }}
      >
        <Stack spacing={2} sx={{ height: '100%' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                Job history
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Latest activity
              </Typography>
            </Box>
            <Button size="small" variant="outlined" onClick={() => setDrawerOpen(false)}>
              Close
            </Button>
          </Stack>

          {isLoading && (
            <Typography variant="caption" color="text.secondary">
              Loading jobs...
            </Typography>
          )}
          {error && (
            <Alert severity="error" variant="outlined">
              Error loading jobs: {(error as Error).message}
            </Alert>
          )}
          {!isLoading && !error && historyJobs.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              No jobs yet
            </Typography>
          )}

          {!isLoading && !error && historyJobs.length > 0 && (
            <Stack spacing={1} sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
              {historyJobs.map((job) => (
                <Paper
                  key={job.id}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderLeft: '4px solid',
                    borderLeftColor: statusBorderColor(job.status),
                    bgcolor: 'background.default',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {formatJobType(job.type)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Started {formatTimestamp(job.startedAt)} · Completed{' '}
                        {formatTimestamp(job.completedAt)}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={statusColor(job.status)}
                      label={job.status}
                    />
                  </Stack>
                  {job.failureReason && (
                    <Typography
                      variant="caption"
                      color="error.main"
                      sx={{ mt: 1, display: 'block' }}
                    >
                      {job.failureReason}
                    </Typography>
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Drawer>
    </Box>
  );
}
