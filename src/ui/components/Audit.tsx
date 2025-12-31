import { useQuery } from '@tanstack/react-query';
import { api, type AuditEvent } from '../services/api';
import { ProgressBar } from './ProgressBar';

const eventTypeClass = (eventType: string) => {
  if (
    eventType.includes('approved') ||
    eventType.includes('executed') ||
    eventType.includes('applied')
  ) {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (eventType.includes('rejected') || eventType.includes('failed')) {
    return 'bg-rose-50 text-rose-700';
  }
  if (eventType.includes('created') || eventType.includes('generated')) {
    return 'bg-blue-50 text-blue-700';
  }
  return 'bg-slate-100 text-slate-600';
};

export function Audit() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.getAuditEvents(),
  });

  if (isLoading) {
    return <ProgressBar message="Loading audit log..." />;
  }

  if (error) {
    return (
      <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Error loading audit log: {error.message}
      </div>
    );
  }

  const events = data?.events || [];

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4">
      <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
        <h2 className="text-lg font-semibold text-slate-800">Audit Log</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
          {events.length} events
        </span>
      </div>

      {events.length === 0 ? (
        <div className="rounded-md bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          <p>No audit events recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                  Timestamp
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                  Event Type
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                  Entity Type
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                  Entity ID
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event: AuditEvent) => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2 font-mono text-[0.75rem] text-slate-500">
                    {formatTimestamp(event.timestamp)}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${eventTypeClass(
                        event.eventType
                      )}`}
                    >
                      {formatEventType(event.eventType)}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">{event.entityType}</td>
                  <td className="border-b border-slate-100 px-3 py-2 font-mono text-[0.75rem] text-slate-500">
                    {truncateId(event.entityId)}
                  </td>
                  <td className="max-w-[300px] truncate border-b border-slate-100 px-3 py-2 text-[0.75rem] text-slate-600">
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
