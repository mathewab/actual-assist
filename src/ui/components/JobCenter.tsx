import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Job } from '../services/api';

interface JobCenterProps {
  budgetId?: string;
}

type ToastPhase = 'running' | 'completed';

interface ToastState {
  job: Job;
  phase: ToastPhase;
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

const statusBorderClass = (status: string) => {
  switch (status) {
    case 'succeeded':
      return 'border-l-emerald-400';
    case 'failed':
      return 'border-l-rose-400';
    case 'canceled':
      return 'border-l-slate-300';
    default:
      return 'border-l-sky-400';
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
    <div className="relative flex items-center">
      <button
        className={[
          'relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-white/10 text-white transition',
          'hover:-translate-y-0.5 hover:border-white/60 hover:bg-white/20',
          isHistoryVisible ? 'border-white/70 bg-white/25' : '',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ]
          .filter(Boolean)
          .join(' ')}
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
        <span className="inline-flex" aria-hidden="true">
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5v5l3.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {runningCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white shadow">
            {runningCount}
          </span>
        )}
      </button>

      {showToast && (
        <div
          className={`fixed right-6 top-[78px] z-50 flex min-w-[240px] items-center gap-2 rounded-xl border-l-4 bg-slate-900 px-3 py-3 text-white shadow-xl ${statusBorderClass(
            toast.job.status
          )}`}
          role="status"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center" aria-hidden="true">
            {toast.phase === 'running' ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 10.5l3.5 3.5L16 6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <div>
            <div className="text-xs font-semibold capitalize">
              {formatJobType(toast.job.type)} job{' '}
              {toast.phase === 'running'
                ? toast.job.status === 'queued'
                  ? 'queued'
                  : 'running'
                : toast.job.status}
            </div>
            <div className="mt-1 text-[11px] text-white/70">
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
            className="fixed inset-0 z-40 bg-slate-900/20"
            onClick={() => setIsHistoryOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-50 mt-3 w-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">Job history</div>
                <div className="text-xs text-slate-500">Latest activity</div>
              </div>
              <button
                className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                type="button"
                onClick={() => setIsHistoryOpen(false)}
              >
                Close
              </button>
            </div>

            {isLoading && <div className="text-xs text-slate-500">Loading jobs...</div>}
            {error && (
              <div className="text-xs text-rose-700">
                Error loading jobs: {(error as Error).message}
              </div>
            )}
            {!isLoading && !error && historyJobs.length === 0 && (
              <div className="text-xs text-slate-500">No jobs yet</div>
            )}

            {!isLoading && !error && historyJobs.length > 0 && (
              <ul className="max-h-[360px] space-y-2 overflow-y-auto">
                {historyJobs.map((job) => (
                  <li
                    key={job.id}
                    className={`rounded-xl border border-slate-200 bg-slate-50 p-3 ${statusBorderClass(
                      job.status
                    )} border-l-4`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-700">
                          {formatJobType(job.type)}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Started {formatTimestamp(job.startedAt)} · Completed{' '}
                          {formatTimestamp(job.completedAt)}
                        </div>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${statusTagClass(
                          job.status
                        )}`}
                      >
                        {job.status}
                      </span>
                    </div>
                    {job.failureReason && (
                      <div className="mt-2 text-[11px] text-rose-700">{job.failureReason}</div>
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
