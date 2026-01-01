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
import { api, type AuditEvent } from '../services/api';
import { ProgressBar } from './ProgressBar';

const eventTypeColor = (eventType: string): 'success' | 'error' | 'info' | 'default' => {
  if (
    eventType.includes('approved') ||
    eventType.includes('executed') ||
    eventType.includes('applied')
  ) {
    return 'success';
  }
  if (eventType.includes('rejected') || eventType.includes('failed')) {
    return 'error';
  }
  if (eventType.includes('created') || eventType.includes('generated')) {
    return 'info';
  }
  return 'default';
};

export function Audit() {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.getAuditEvents(),
  });

  if (isLoading) {
    return <ProgressBar message="Loading audit log..." />;
  }

  if (error) {
    return (
      <Alert severity="error" variant="outlined">
        Error loading audit log: {error.message}
      </Alert>
    );
  }

  const events = data?.events || [];

  return (
    <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1400, p: 3 }}>
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
          Audit Log
        </Typography>
        <Chip label={`${events.length} events`} size="small" variant="outlined" />
      </Box>

      {events.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ px: 4, py: 6, textAlign: 'center', bgcolor: 'background.default' }}
        >
          <Typography variant="body2" color="text.secondary">
            No audit events recorded yet.
          </Typography>
        </Paper>
      ) : isSmall ? (
        <Stack spacing={1.5}>
          {events.map((event: AuditEvent) => (
            <Paper key={event.id} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.paper' }}>
              <Stack spacing={1}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Timestamp
                  </Typography>
                  <Typography variant="body2" fontFamily="monospace">
                    {formatTimestamp(event.timestamp)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Event Type
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      size="small"
                      label={formatEventType(event.eventType)}
                      color={eventTypeColor(event.eventType)}
                      variant="outlined"
                      sx={{ fontWeight: 600 }}
                    />
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Entity
                  </Typography>
                  <Typography variant="body2">{event.entityType}</Typography>
                  <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                    {truncateId(event.entityId)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Details
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {event.metadata ? formatMetadata(event.metadata) : '—'}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: 'background.paper' }}>
          <Table size="small" aria-label="audit log">
            <TableHead>
              <TableRow>
                {['Timestamp', 'Event Type', 'Entity Type', 'Entity ID', 'Details'].map((label) => (
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
              {events.map((event: AuditEvent) => (
                <TableRow key={event.id} hover>
                  <TableCell
                    sx={{
                      whiteSpace: 'nowrap',
                      borderBottomColor: 'divider',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                    }}
                  >
                    {formatTimestamp(event.timestamp)}
                  </TableCell>
                  <TableCell sx={{ borderBottomColor: 'divider' }}>
                    <Chip
                      size="small"
                      label={formatEventType(event.eventType)}
                      color={eventTypeColor(event.eventType)}
                      variant="outlined"
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell sx={{ borderBottomColor: 'divider' }}>{event.entityType}</TableCell>
                  <TableCell
                    sx={{
                      borderBottomColor: 'divider',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                    }}
                  >
                    {truncateId(event.entityId)}
                  </TableCell>
                  <TableCell sx={{ borderBottomColor: 'divider', maxWidth: 300 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      noWrap
                      title={event.metadata ? formatMetadata(event.metadata) : '—'}
                      sx={{ display: 'block' }}
                    >
                      {event.metadata ? formatMetadata(event.metadata) : '—'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

function formatEventType(eventType: string): string {
  return eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function formatMetadata(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return '—';

  // Show first few key entries
  const display = entries.slice(0, 3).map(([key, value]) => {
    const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const truncatedValue =
      displayValue.length > 30 ? displayValue.slice(0, 30) + '...' : displayValue;
    return `${key}: ${truncatedValue}`;
  });

  if (entries.length > 3) {
    display.push(`+${entries.length - 3} more`);
  }

  return display.join(', ');
}
