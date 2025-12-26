/**
 * JobEvent entity - immutable job status transition record
 * P1 (Single Responsibility): Records job lifecycle changes
 */
import type { JobStatus } from './Job.js';
import type { JobStepStatus } from './JobStep.js';

export type JobEventStatus = JobStatus | JobStepStatus;

export interface JobEvent {
  id: string;
  jobId: string;
  jobStepId: string | null;
  status: JobEventStatus;
  message: string | null;
  createdAt: Date;
}

/**
 * Factory function to create a new JobEvent
 * P4 (Explicitness): All fields explicitly captured
 */
export function createJobEvent(params: {
  id: string;
  jobId: string;
  jobStepId?: string | null;
  status: JobEventStatus;
  message?: string | null;
}): JobEvent {
  return {
    id: params.id,
    jobId: params.jobId,
    jobStepId: params.jobStepId ?? null,
    status: params.status,
    message: params.message ?? null,
    createdAt: new Date(),
  };
}
