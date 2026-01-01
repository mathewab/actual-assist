import type { Job } from '../domain/entities/Job.js';
import type { JobStep } from '../domain/entities/JobStep.js';

export function mapJobToResponse(job: Job) {
  return {
    id: job.id,
    budgetId: job.budgetId,
    type: job.type,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failureReason: job.failureReason,
    parentJobId: job.parentJobId,
    metadata: job.metadata,
  };
}

export function mapStepToResponse(step: JobStep) {
  return {
    id: step.id,
    jobId: step.jobId,
    stepType: step.stepType,
    status: step.status,
    position: step.position,
    createdAt: step.createdAt,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    failureReason: step.failureReason,
  };
}
