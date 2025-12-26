import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Job } from '../services/api';
import { JobDetail } from './JobDetail';
import './JobList.css';

interface JobListProps {
  budgetId: string;
}

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
  if (isLoading) return <div className="job-list">Loading jobs...</div>;
  if (error) {
    return <div className="job-list error">Error loading jobs: {(error as Error).message}</div>;
  }

  const jobs = data?.jobs ?? [];

  return (
    <div className="job-list">
      <div className="job-list-header">
        <h3>Jobs</h3>
        <span className="job-list-count">{jobs.length} recent</span>
      </div>
      {jobs.length === 0 ? (
        <div className="job-list-empty">No jobs yet</div>
      ) : (
        <table className="job-list-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Status</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Failure</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className={`status-${job.status}`}>
                <td>{formatJobType(job.type)}</td>
                <td>
                  <span className={`status-tag status-${job.status}`}>{job.status}</span>
                </td>
                <td>{formatTimestamp(job.startedAt)}</td>
                <td>{formatTimestamp(job.completedAt)}</td>
                <td className="job-failure">{job.failureReason || '—'}</td>
                <td>
                  {job.type === 'sync_and_suggest' ? (
                    <button
                      className="job-detail-toggle"
                      onClick={() => setSelectedJobId(selectedJobId === job.id ? null : job.id)}
                    >
                      {selectedJobId === job.id ? 'Hide' : 'Details'}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selectedJobId && <JobDetail jobId={selectedJobId} />}
    </div>
  );
}
