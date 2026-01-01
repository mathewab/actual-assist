import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { api, type Job } from '../services/api';

interface JobCenterProps {
  budgetId?: string;
}

type ToastPhase = 'running' | 'completed';

interface ToastState {
  job: Job;
  phase: ToastPhase;
}

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
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const lastActiveJobIdRef = useRef<string | null>(null);
  const toastHideTimeoutRef = useRef<number | null>(null);
  const hasBudget = Boolean(budgetId);

  const updateToastForJobs = useCallback((items: Job[]) => {
    const clearToastTimeout = () => {
      if (toastHideTimeoutRef.current) {
        window.clearTimeout(toastHideTimeoutRef.current);
        toastHideTimeoutRef.current = null;
      }
    };

    const active = items.filter((job) => job.status === 'running' || job.status === 'queued');
    if (active.length > 0) {
      const latestActive = active[0];
      clearToastTimeout();
      lastActiveJobIdRef.current = latestActive.id;
      setToast({ job: latestActive, phase: 'running' });
      return;
    }

    const lastActiveId = lastActiveJobIdRef.current;
    if (!lastActiveId) {
      clearToastTimeout();
      setToast(null);
      return;
    }

    const finishedJob = items.find((job) => job.id === lastActiveId && job.completedAt);
    if (!finishedJob) {
      clearToastTimeout();
      setToast(null);
      return;
    }

    clearToastTimeout();
    setToast({ job: finishedJob, phase: 'completed' });
    lastActiveJobIdRef.current = null;
    toastHideTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2400);
  }, []);

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
    }
  }, [hasBudget]);

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
  const isHistoryVisible = Boolean(anchorEl);

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
          setAnchorEl((prev) => (prev ? null : event.currentTarget));
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
        onClose={() => setToast(null)}
        autoHideDuration={toast?.phase === 'completed' ? 2400 : null}
      >
        <Alert
          severity={toast ? statusColor(toast.job.status) : 'info'}
          variant="filled"
          icon={
            toast?.phase === 'running' ? <CircularProgress size={14} color="inherit" /> : undefined
          }
        >
          <Typography variant="subtitle2" fontWeight={600}>
            {toastLabel}
          </Typography>
          <Typography variant="caption">{toastDetail}</Typography>
        </Alert>
      </Snackbar>

      <Popover
        open={isHistoryVisible}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            mt: 1.5,
            width: 360,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            p: 2,
          },
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                Job history
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Latest activity
              </Typography>
            </Box>
            <Button size="small" variant="outlined" onClick={() => setAnchorEl(null)}>
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
            <Stack spacing={1} sx={{ maxHeight: 360, overflowY: 'auto' }}>
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
      </Popover>
    </Box>
  );
}
