import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
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
import { api } from '../services/api';
import { JobDetail } from './JobDetail';
import { formatJobTypeLabel } from '../utils/jobLabels';

interface JobListProps {
  budgetId: string;
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

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function JobList({ budgetId }: JobListProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs', budgetId],
    queryFn: () => api.listJobs({ budgetId, limit: 20 }),
    enabled: !!budgetId,
    refetchInterval: 5000,
  });
  const syncMutation = useMutation({
    mutationFn: () => api.createSyncJob(budgetId),
    onSuccess: () => {
      setSyncError(null);
      void queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
    },
    onError: (mutationError) => {
      setSyncError(
        mutationError instanceof Error ? mutationError.message : 'Failed to start sync job.'
      );
    },
  });

  if (!budgetId) return null;
  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'background.default' }}>
        <Typography variant="body2" color="text.secondary">
          Loading jobs...
        </Typography>
      </Paper>
    );
  }
  if (error) {
    return (
      <Alert severity="error" variant="outlined" sx={{ mt: 2 }}>
        Error loading jobs: {(error as Error).message}
      </Alert>
    );
  }

  const jobs = data?.jobs ?? [];

  return (
    <Paper variant="outlined" sx={{ my: 2, p: 2, bgcolor: 'background.paper' }}>
      <Box
        sx={{
          mb: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              if (syncMutation.isPending) return;
              setSyncError(null);
              syncMutation.mutate();
            }}
            disabled={syncMutation.isPending}
            startIcon={
              syncMutation.isPending ? <CircularProgress color="inherit" size={14} /> : undefined
            }
          >
            {isMobile ? 'Sync' : 'Sync Budget'}
          </Button>
          <Typography variant="subtitle1" fontWeight={600}>
            Jobs
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {jobs.length} recent
        </Typography>
      </Box>
      {syncError && (
        <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
          {syncError}
        </Alert>
      )}
      {jobs.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No jobs yet
        </Typography>
      ) : (
        <Table size="small" aria-label="jobs">
          <TableHead>
            <TableRow>
              {['Type', 'Status', 'Started', 'Completed', 'Failure', ''].map((label) => (
                <TableCell
                  key={label}
                  sx={{
                    borderBottomColor: 'divider',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'text.secondary',
                  }}
                >
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id} hover>
                <TableCell sx={{ borderBottomColor: 'divider' }}>
                  {formatJobTypeLabel(job)}
                </TableCell>
                <TableCell sx={{ borderBottomColor: 'divider' }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={statusColor(job.status)}
                    label={job.status}
                  />
                </TableCell>
                <TableCell sx={{ borderBottomColor: 'divider' }}>
                  {formatTimestamp(job.startedAt)}
                </TableCell>
                <TableCell sx={{ borderBottomColor: 'divider' }}>
                  {formatTimestamp(job.completedAt)}
                </TableCell>
                <TableCell sx={{ borderBottomColor: 'divider', color: 'error.main' }}>
                  {job.failureReason || '—'}
                </TableCell>
                <TableCell sx={{ borderBottomColor: 'divider' }}>
                  {job.type === 'sync_and_suggest' ? (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setSelectedJobId(selectedJobId === job.id ? null : job.id)}
                    >
                      {selectedJobId === job.id ? 'Hide' : 'Details'}
                    </Button>
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {selectedJobId && <JobDetail jobId={selectedJobId} />}
    </Paper>
  );
}
