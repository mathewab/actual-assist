import { useQuery } from '@tanstack/react-query';
import { api, type JobStep } from '../services/api';
import './JobDetail.css';

interface JobDetailProps {
  jobId: string;
}

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
  if (isLoading) return <div className="job-detail">Loading job details...</div>;
  if (error) {
    return (
      <div className="job-detail error">Error loading job detail: {(error as Error).message}</div>
    );
  }

  const steps = data?.steps ?? [];

  return (
    <div className="job-detail">
      <div className="job-detail-header">Steps</div>
      {steps.length === 0 ? (
        <div className="job-detail-empty">No steps</div>
      ) : (
        <table className="job-detail-table">
          <thead>
            <tr>
              <th>Step</th>
              <th>Status</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Failure</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.id} className={`status-${step.status}`}>
                <td>{formatStepType(step.stepType)}</td>
                <td>
                  <span className={`status-tag status-${step.status}`}>{step.status}</span>
                </td>
                <td>{formatTimestamp(step.startedAt)}</td>
                <td>{formatTimestamp(step.completedAt)}</td>
                <td className="job-detail-failure">{step.failureReason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
