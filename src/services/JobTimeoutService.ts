import type { JobRepository } from '../infra/repositories/JobRepository.js';
import type { JobStepRepository } from '../infra/repositories/JobStepRepository.js';
import type { JobService } from './JobService.js';

/**
 * JobTimeoutService - detect and fail jobs that exceeded allowed runtime.
 */
export class JobTimeoutService {
  constructor(
    private jobRepo: JobRepository,
    private stepRepo: JobStepRepository,
    private jobService: JobService
  ) {}

  failTimedOutJobs(timeoutMinutes: number): { jobsFailed: number; stepsFailed: number } {
    if (timeoutMinutes <= 0) {
      return { jobsFailed: 0, stepsFailed: 0 };
    }

    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    const reason =
      timeoutMinutes === 1
        ? 'Timed out after 1 minute'
        : `Timed out after ${timeoutMinutes} minutes`;

    let stepsFailed = 0;
    const affectedJobIds = new Set<string>();
    const timedOutSteps = this.stepRepo.listTimedOutSteps(cutoff);

    for (const step of timedOutSteps) {
      if (this.jobService.markStepFailedIfActive(step.id, reason)) {
        stepsFailed += 1;
        affectedJobIds.add(step.jobId);
      }
    }

    let jobsFailed = 0;
    for (const jobId of affectedJobIds) {
      if (this.jobService.markJobFailedIfActive(jobId, reason)) {
        jobsFailed += 1;
      }
    }

    const timedOutJobs = this.jobRepo.listTimedOutJobs(cutoff);
    for (const job of timedOutJobs) {
      if (this.jobService.markJobFailedIfActive(job.id, reason)) {
        jobsFailed += 1;
      }
    }

    return { jobsFailed, stepsFailed };
  }
}
