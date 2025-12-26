import { randomUUID } from 'node:crypto';
import type { Job, JobStatus, JobType } from '../domain/entities/Job.js';
import type { JobStep, JobStepStatus, JobStepType } from '../domain/entities/JobStep.js';
import { createJob } from '../domain/entities/Job.js';
import { createJobStep } from '../domain/entities/JobStep.js';
import type { JobRepository } from '../infra/repositories/JobRepository.js';
import type { JobStepRepository } from '../infra/repositories/JobStepRepository.js';
import type { JobEventRepository } from '../infra/repositories/JobEventRepository.js';
import { ValidationError, NotFoundError } from '../domain/errors.js';
import { logger } from '../infra/logger.js';

const jobTransitions: Record<JobStatus, JobStatus[]> = {
  queued: ['running', 'failed', 'canceled'],
  running: ['succeeded', 'failed', 'canceled'],
  succeeded: [],
  failed: [],
  canceled: [],
};

const stepTransitions: Record<JobStepStatus, JobStepStatus[]> = {
  queued: ['running', 'failed', 'canceled'],
  running: ['succeeded', 'failed', 'canceled'],
  succeeded: [],
  failed: [],
  canceled: [],
};

/**
 * JobService - manages job lifecycle and status updates
 * P5 (Separation of concerns): Orchestration handled elsewhere
 */
export class JobService {
  constructor(
    private jobRepo: JobRepository,
    private stepRepo: JobStepRepository,
    private eventRepo: JobEventRepository
  ) {}

  createJob(params: {
    budgetId: string;
    type: JobType;
    metadata?: Record<string, unknown> | null;
    parentJobId?: string | null;
  }): Job {
    const job = createJob({
      id: randomUUID(),
      budgetId: params.budgetId,
      type: params.type,
      metadata: params.metadata,
      parentJobId: params.parentJobId ?? null,
    });

    this.jobRepo.create(job);
    this.recordEvent(job.id, null, job.status, 'Job created');
    logger.info('Job created', { jobId: job.id, type: job.type, status: job.status });
    return job;
  }

  createJobStep(params: { jobId: string; stepType: JobStepType; position: number }): JobStep {
    const step = createJobStep({
      id: randomUUID(),
      jobId: params.jobId,
      stepType: params.stepType,
      position: params.position,
    });

    this.stepRepo.create(step);
    this.recordEvent(step.jobId, step.id, step.status, 'Job step created');
    logger.info('Job step created', {
      jobId: step.jobId,
      stepId: step.id,
      stepType: step.stepType,
    });
    return step;
  }

  getJob(jobId: string): Job {
    const job = this.jobRepo.getById(jobId);
    if (!job) {
      throw new NotFoundError('Job', jobId);
    }
    return job;
  }

  listJobs(params: {
    budgetId: string;
    type?: JobType;
    status?: JobStatus;
    limit?: number;
  }): Job[] {
    return this.jobRepo.listByBudget(params);
  }

  listJobSteps(jobId: string): JobStep[] {
    return this.stepRepo.listByJob(jobId);
  }

  markJobRunning(jobId: string): void {
    const job = this.getJob(jobId);
    this.assertJobTransition(job.status, 'running');
    const startedAt = new Date();
    this.jobRepo.updateStatus({ jobId, status: 'running', startedAt });
    this.recordEvent(jobId, null, 'running', 'Job started');
    logger.info('Job running', { jobId });
  }

  markJobSucceeded(jobId: string): void {
    const job = this.getJob(jobId);
    this.assertJobTransition(job.status, 'succeeded');
    const completedAt = new Date();
    this.jobRepo.updateStatus({ jobId, status: 'succeeded', completedAt });
    this.recordEvent(jobId, null, 'succeeded', 'Job succeeded');
    logger.info('Job succeeded', { jobId });
  }

  markJobFailed(jobId: string, reason: string): void {
    const job = this.getJob(jobId);
    this.assertJobTransition(job.status, 'failed');
    const completedAt = new Date();
    this.jobRepo.updateStatus({
      jobId,
      status: 'failed',
      completedAt,
      failureReason: reason,
    });
    this.recordEvent(jobId, null, 'failed', reason);
    logger.info('Job failed', { jobId, reason });
  }

  markJobFailedIfActive(jobId: string, reason: string): boolean {
    const job = this.getJob(jobId);
    if (job.status !== 'running' && job.status !== 'queued') {
      return false;
    }
    const completedAt = new Date();
    this.jobRepo.updateStatus({
      jobId,
      status: 'failed',
      completedAt,
      failureReason: reason,
    });
    this.recordEvent(jobId, null, 'failed', reason);
    logger.info('Job failed', { jobId, reason });
    return true;
  }

  markJobCanceled(jobId: string, reason?: string | null): void {
    const job = this.getJob(jobId);
    this.assertJobTransition(job.status, 'canceled');
    const completedAt = new Date();
    this.jobRepo.updateStatus({
      jobId,
      status: 'canceled',
      completedAt,
      failureReason: reason ?? null,
    });
    this.recordEvent(jobId, null, 'canceled', reason ?? 'Job canceled');
    logger.info('Job canceled', { jobId });
  }

  markStepRunning(stepId: string): void {
    const step = this.getStep(stepId);
    this.assertStepTransition(step.status, 'running');
    const startedAt = new Date();
    this.stepRepo.updateStatus({ stepId, status: 'running', startedAt });
    this.recordEvent(step.jobId, step.id, 'running', 'Job step started');
    logger.info('Job step running', { stepId, jobId: step.jobId });
  }

  markStepSucceeded(stepId: string): void {
    const step = this.getStep(stepId);
    this.assertStepTransition(step.status, 'succeeded');
    const completedAt = new Date();
    this.stepRepo.updateStatus({ stepId, status: 'succeeded', completedAt });
    this.recordEvent(step.jobId, step.id, 'succeeded', 'Job step succeeded');
    logger.info('Job step succeeded', { stepId, jobId: step.jobId });
  }

  markStepFailed(stepId: string, reason: string): void {
    const step = this.getStep(stepId);
    this.assertStepTransition(step.status, 'failed');
    const completedAt = new Date();
    this.stepRepo.updateStatus({
      stepId,
      status: 'failed',
      completedAt,
      failureReason: reason,
    });
    this.recordEvent(step.jobId, step.id, 'failed', reason);
    logger.info('Job step failed', { stepId, jobId: step.jobId, reason });
  }

  markStepFailedIfActive(stepId: string, reason: string): boolean {
    const step = this.getStep(stepId);
    if (step.status !== 'running' && step.status !== 'queued') {
      return false;
    }
    const completedAt = new Date();
    this.stepRepo.updateStatus({
      stepId,
      status: 'failed',
      completedAt,
      failureReason: reason,
    });
    this.recordEvent(step.jobId, step.id, 'failed', reason);
    logger.info('Job step failed', { stepId, jobId: step.jobId, reason });
    return true;
  }

  private getStep(stepId: string): JobStep {
    const step = this.stepRepo.getById(stepId);
    if (!step) {
      throw new NotFoundError('JobStep', stepId);
    }
    return step;
  }

  private assertJobTransition(from: JobStatus, to: JobStatus): void {
    const allowed = jobTransitions[from] || [];
    if (!allowed.includes(to)) {
      throw new ValidationError(`Invalid job status transition: ${from} -> ${to}`);
    }
  }

  private assertStepTransition(from: JobStepStatus, to: JobStepStatus): void {
    const allowed = stepTransitions[from] || [];
    if (!allowed.includes(to)) {
      throw new ValidationError(`Invalid job step status transition: ${from} -> ${to}`);
    }
  }

  private recordEvent(
    jobId: string,
    jobStepId: string | null,
    status: JobStatus | JobStepStatus,
    message?: string
  ): void {
    this.eventRepo.record({
      id: randomUUID(),
      jobId,
      jobStepId,
      status,
      message: message ?? null,
    });
  }
}
