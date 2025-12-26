import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Job } from '../services/api';
import './JobCenter.css';

interface JobCenterProps {
  budgetId?: string;
}

type ToastPhase = 'running' | 'completed';

interface ToastState {
  job: Job;
  phase: ToastPhase;
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatJobType(type: Job['type']): string {
  switch (type) {
    case 'sync':
      return 'Sync';
    case 'suggestions':
      return 'Suggestions';
    case 'sync_and_generate':
      return 'Sync + Generate';
    default:
      return type;
  }
}

function sortJobsByCreatedAt(items: Job[]): Job[] {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function JobCenter({ budgetId }: JobCenterProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const lastActiveJobIdRef = useRef<string | null>(null);
  const toastHideTimeoutRef = useRef<number | null>(null);
  const hasBudget = Boolean(budgetId);

  const updateToastForJobs = useCallback((items: Job[]) => {
    const clearToastTimeout = () => {
      if (toastHideTimeoutRef.current) {
        window.clearTimeout(toastHideTimeoutRef.current);
        toastHideTimeoutRef.current = null;
      }
    };

    const active = items.filter((job) => job.status === 'running' || job.status === 'queued');
    if (active.length > 0) {
      const latestActive = active[0];
      clearToastTimeout();
      lastActiveJobIdRef.current = latestActive.id;
      setToast({ job: latestActive, phase: 'running' });
      return;
    }

    const lastActiveId = lastActiveJobIdRef.current;
    if (!lastActiveId) {
      clearToastTimeout();
      setToast(null);
      return;
    }

    const finishedJob = items.find((job) => job.id === lastActiveId && job.completedAt);
    if (!finishedJob) {
      clearToastTimeout();
      setToast(null);
      return;
    }

    clearToastTimeout();
    setToast({ job: finishedJob, phase: 'completed' });
    lastActiveJobIdRef.current = null;
    toastHideTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2400);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs', budgetId],
    queryFn: () => api.listJobs({ budgetId: budgetId ?? '', limit: 25 }),
    enabled: hasBudget,
    refetchInterval: 4000,
    onSuccess: (response) => {
      updateToastForJobs(sortJobsByCreatedAt(response.jobs ?? []));
    },
  });

  const jobs = useMemo(() => {
    return sortJobsByCreatedAt(data?.jobs ?? []);
  }, [data]);

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === 'running' || job.status === 'queued'),
    [jobs]
  );

  useEffect(() => {
    if (!hasBudget && toastHideTimeoutRef.current) {
      window.clearTimeout(toastHideTimeoutRef.current);
      toastHideTimeoutRef.current = null;
      lastActiveJobIdRef.current = null;
    }
  }, [hasBudget]);

  useEffect(() => {
    return () => {
      if (toastHideTimeoutRef.current) {
        window.clearTimeout(toastHideTimeoutRef.current);
      }
    };
  }, []);

  const isHistoryVisible = hasBudget && isHistoryOpen;

  useEffect(() => {
    if (!isHistoryVisible) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHistoryOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHistoryVisible]);

  const runningCount = activeJobs.length;
  const historyJobs = jobs.slice(0, 10);
  const showToast = hasBudget && !isLoading && toast;

  return (
    <div className="job-center">
      <button
        className={`job-center-button ${isHistoryVisible ? 'open' : ''}`}
        type="button"
        disabled={!hasBudget}
        title={hasBudget ? 'Job history' : 'Select a budget to view jobs'}
        aria-label="Job history"
        aria-expanded={isHistoryVisible}
        onClick={() => {
          if (!hasBudget) return;
          setIsHistoryOpen((open) => !open);
        }}
      >
        <span className="job-center-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5v5l3.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {runningCount > 0 && <span className="job-center-badge">{runningCount}</span>}
      </button>

      {showToast && (
        <div className={`job-toast ${toast.phase} status-${toast.job.status}`} role="status">
          <span className="job-toast-icon" aria-hidden="true">
            {toast.phase === 'running' ? (
              <span className="job-toast-spinner" />
            ) : (
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 10.5l3.5 3.5L16 6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <div className="job-toast-body">
            <div className="job-toast-title">
              {formatJobType(toast.job.type)} job{' '}
              {toast.phase === 'running'
                ? toast.job.status === 'queued'
                  ? 'queued'
                  : 'running'
                : toast.job.status}
            </div>
            <div className="job-toast-meta">
              {toast.phase === 'running'
                ? 'Working in the background'
                : `Completed at ${formatTimestamp(toast.job.completedAt)}`}
            </div>
          </div>
        </div>
      )}

      {isHistoryVisible && (
        <>
          <div
            className="job-history-overlay"
            onClick={() => setIsHistoryOpen(false)}
            aria-hidden="true"
          />
          <div className="job-history-popover" role="menu">
            <div className="job-history-header">
              <div>
                <div className="job-history-title">Job history</div>
                <div className="job-history-subtitle">Latest activity</div>
              </div>
              <button
                className="job-history-close"
                type="button"
                onClick={() => setIsHistoryOpen(false)}
              >
                Close
              </button>
            </div>

            {isLoading && <div className="job-history-empty">Loading jobs...</div>}
            {error && (
              <div className="job-history-empty">
                Error loading jobs: {(error as Error).message}
              </div>
            )}
            {!isLoading && !error && historyJobs.length === 0 && (
              <div className="job-history-empty">No jobs yet</div>
            )}

            {!isLoading && !error && historyJobs.length > 0 && (
              <ul className="job-history-list">
                {historyJobs.map((job) => (
                  <li key={job.id} className={`job-history-item status-${job.status}`}>
                    <div className="job-history-main">
                      <div>
                        <div className="job-history-item-title">{formatJobType(job.type)}</div>
                        <div className="job-history-meta">
                          Started {formatTimestamp(job.startedAt)} · Completed{' '}
                          {formatTimestamp(job.completedAt)}
                        </div>
                      </div>
                      <span className="status-tag">{job.status}</span>
                    </div>
                    {job.failureReason && (
                      <div className="job-history-failure">{job.failureReason}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
