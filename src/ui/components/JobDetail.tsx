import { useQuery } from '@tanstack/react-query';
import { api, type JobStep } from '../services/api';

interface JobDetailProps {
  jobId: string;
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
      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
        Loading job details...
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        Error loading job detail: {(error as Error).message}
      </div>
    );
  }

  const steps = data?.steps ?? [];

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-sm font-semibold text-slate-700">Steps</div>
      {steps.length === 0 ? (
        <div className="text-sm text-slate-500">No steps</div>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border-b border-slate-200 px-2 py-1 text-left font-semibold text-slate-600">
                Step
              </th>
              <th className="border-b border-slate-200 px-2 py-1 text-left font-semibold text-slate-600">
                Status
              </th>
              <th className="border-b border-slate-200 px-2 py-1 text-left font-semibold text-slate-600">
                Started
              </th>
              <th className="border-b border-slate-200 px-2 py-1 text-left font-semibold text-slate-600">
                Completed
              </th>
              <th className="border-b border-slate-200 px-2 py-1 text-left font-semibold text-slate-600">
                Failure
              </th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-2 py-1">{formatStepType(step.stepType)}</td>
                <td className="px-2 py-1">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${statusTagClass(
                      step.status
                    )}`}
                  >
                    {step.status}
                  </span>
                </td>
                <td className="px-2 py-1">{formatTimestamp(step.startedAt)}</td>
                <td className="px-2 py-1">{formatTimestamp(step.completedAt)}</td>
                <td className="px-2 py-1 text-rose-700">{step.failureReason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
