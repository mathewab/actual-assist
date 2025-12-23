import { useQuery } from '@tanstack/react-query';
import { api, type AuditEvent } from '../services/api';
import { ProgressBar } from './ProgressBar';
import './Audit.css';

export function Audit() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.getAuditEvents(),
  });

  if (isLoading) {
    return <ProgressBar message="Loading audit log..." />;
  }

  if (error) {
    return <div className="error">Error loading audit log: {error.message}</div>;
  }

  const events = data?.events || [];

  return (
    <div className="audit-page">
      <div className="audit-header">
        <h2>Audit Log</h2>
        <span className="audit-count">{events.length} events</span>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">
          <p>No audit events recorded yet.</p>
        </div>
      ) : (
        <div className="audit-table-wrapper">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Entity Type</th>
                <th>Entity ID</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event: AuditEvent) => (
                <tr key={event.id}>
                  <td className="timestamp">{formatTimestamp(event.timestamp)}</td>
                  <td>
                    <span className={`event-type ${getEventTypeClass(event.eventType)}`}>
                      {formatEventType(event.eventType)}
                    </span>
                  </td>
                  <td>{event.entityType}</td>
                  <td className="entity-id">{truncateId(event.entityId)}</td>
                  <td className="metadata">
                    {event.metadata ? formatMetadata(event.metadata) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getEventTypeClass(eventType: string): string {
  if (eventType.includes('approved') || eventType.includes('executed') || eventType.includes('applied')) {
    return 'success';
  }
  if (eventType.includes('rejected') || eventType.includes('failed')) {
    return 'error';
  }
  if (eventType.includes('created') || eventType.includes('generated')) {
    return 'info';
  }
  return 'default';
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
    const truncatedValue = displayValue.length > 30 ? displayValue.slice(0, 30) + '...' : displayValue;
    return `${key}: ${truncatedValue}`;
  });
  
  if (entries.length > 3) {
    display.push(`+${entries.length - 3} more`);
  }
  
  return display.join(', ');
}
