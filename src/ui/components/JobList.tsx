import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Job } from '../services/api';
import { JobDetail } from './JobDetail';

interface JobListProps {
  budgetId: string;
}

const statusTagClass = (status: string) => {
  switch (status) {
    case 'queued':
      return 'bg-slate-200 text-slate-600';
    case 'running':
      return 'bg-blue-100 text-blue-700';
    case 'succeeded':
      return 'bg-emerald-100 text-emerald-700';
    case 'failed':
      return 'bg-rose-100 text-rose-700';
    case 'canceled':
      return 'bg-slate-100 text-slate-500';
    default:
      return 'bg-slate-100 text-slate-600';
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
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Loading jobs...
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Error loading jobs: {(error as Error).message}
      </div>
    );
  }

  const jobs = data?.jobs ?? [];

  return (
    <div className="my-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">Jobs</h3>
        <span className="text-xs text-slate-500">{jobs.length} recent</span>
      </div>
      {jobs.length === 0 ? (
        <div className="text-sm text-slate-500">No jobs yet</div>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-600">
                Type
              </th>
              <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-600">
                Status
              </th>
              <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-600">
                Started
              </th>
              <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-600">
                Completed
              </th>
              <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-600">
                Failure
              </th>
              <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-600"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-2 py-2">{formatJobType(job.type)}</td>
                <td className="px-2 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${statusTagClass(
                      job.status
                    )}`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="px-2 py-2">{formatTimestamp(job.startedAt)}</td>
                <td className="px-2 py-2">{formatTimestamp(job.completedAt)}</td>
                <td className="px-2 py-2 text-rose-700">{job.failureReason || '—'}</td>
                <td className="px-2 py-2">
                  {job.type === 'sync_and_suggest' ? (
                    <button
                      className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[0.7rem] font-semibold text-indigo-700 transition hover:bg-indigo-100"
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
