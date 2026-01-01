import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { api, type Job } from '../services/api';
import { JobDetail } from './JobDetail';

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

function formatJobType(type: Job['type']): string {
  switch (type) {
    case 'budget_sync':
      return 'Sync Budget';
    case 'suggestions_generate':
      return 'Generate Suggestions';
    case 'sync_and_suggest':
      return 'Sync & Generate';
    case 'suggestions_retry_payee':
      return 'Retry Suggestions';
    case 'suggestions_apply':
      return 'Apply Suggestions';
    case 'snapshot_create':
      return 'Create Snapshot';
    case 'snapshot_redownload':
      return 'Redownload Snapshot';
    case 'scheduled_sync_and_suggest':
      return 'Scheduled Sync & Generate';
    default:
      return type;
  }
}

export function JobList({ budgetId }: JobListProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs', budgetId],
    queryFn: () => api.listJobs({ budgetId, limit: 20 }),
    enabled: !!budgetId,
    refetchInterval: 5000,
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
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Jobs
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {jobs.length} recent
        </Typography>
      </Box>
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
                  {formatJobType(job.type)}
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
