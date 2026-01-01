import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { api, type JobStep } from '../services/api';

interface JobDetailProps {
  jobId: string;
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

function formatStepType(type: JobStep['stepType']): string {
  return type === 'sync' ? 'Sync' : 'Suggestions';
}

export function JobDetail({ jobId }: JobDetailProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: () => api.getJob(jobId),
    enabled: !!jobId,
    refetchInterval: 5000,
  });

  if (!jobId) return null;
  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'background.default' }}>
        <Typography variant="body2" color="text.secondary">
          Loading job details...
        </Typography>
      </Paper>
    );
  }
  if (error) {
    return (
      <Alert severity="error" variant="outlined" sx={{ mt: 2 }}>
        Error loading job detail: {(error as Error).message}
      </Alert>
    );
  }

  const steps = data?.steps ?? [];

  return (
    <Paper variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'background.paper' }}>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
        Steps
      </Typography>
      {steps.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No steps
        </Typography>
      ) : (
        <Table size="small" aria-label="job steps">
          <TableHead>
            <TableRow>
              {['Step', 'Status', 'Started', 'Completed', 'Failure'].map((label) => (
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
            {steps.map((step) => (
              <TableRow key={step.id} hover>
                <TableCell sx={{ borderBottomColor: 'divider' }}>
                  {formatStepType(step.stepType)}
                </TableCell>
                <TableCell sx={{ borderBottomColor: 'divider' }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={statusColor(step.status)}
                    label={step.status}
                  />
                </TableCell>
                <TableCell sx={{ borderBottomColor: 'divider' }}>
                  {formatTimestamp(step.startedAt)}
                </TableCell>
                <TableCell sx={{ borderBottomColor: 'divider' }}>
                  {formatTimestamp(step.completedAt)}
                </TableCell>
                <TableCell sx={{ borderBottomColor: 'divider', color: 'error.main' }}>
                  {step.failureReason || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}
