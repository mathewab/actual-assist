/**
 * Job entity - unit of work initiated by a user
 * P1 (Single Responsibility): Represents job lifecycle state
 */
export type JobType = 'sync' | 'suggestions' | 'sync_and_generate';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface Job {
  id: string;
  budgetId: string;
  type: JobType;
  status: JobStatus;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failureReason: string | null;
  parentJobId: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Factory function to create a new Job
 * P4 (Explicitness): All fields explicitly captured
 */
export function createJob(params: {
  id: string;
  budgetId: string;
  type: JobType;
  metadata?: Record<string, unknown> | null;
  parentJobId?: string | null;
}): Job {
  return {
    id: params.id,
    budgetId: params.budgetId,
    type: params.type,
    status: 'queued',
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    failureReason: null,
    parentJobId: params.parentJobId ?? null,
    metadata: params.metadata ?? null,
  };
}
