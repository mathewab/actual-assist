import { logger } from '../infra/logger.js';
import type { SuggestionService } from './SuggestionService.js';
import type { JobService } from './JobService.js';
import type { SyncService } from './SyncService.js';
import type { Job } from '../domain/entities/Job.js';
import type { JobStep } from '../domain/entities/JobStep.js';

/**
 * JobOrchestrator - coordinates job execution and step ordering
 * P5 (Separation of concerns): Orchestration separate from job lifecycle updates
 */
export class JobOrchestrator {
  constructor(
    private jobService: JobService,
    private syncService: SyncService,
    private suggestionService: SuggestionService
  ) {}

  startSyncJob(budgetId: string): { job: Job } {
    const job = this.jobService.createJob({ budgetId, type: 'sync' });
    this.runSingleJob(job, async () => {
      await this.syncService.syncBudget(budgetId);
    });
    return { job };
  }

  startSuggestionsJob(budgetId: string): { job: Job } {
    const job = this.jobService.createJob({ budgetId, type: 'suggestions' });
    this.runSingleJob(job, async () => {
      await this.suggestionService.generateSuggestions(budgetId);
    });
    return { job };
  }

  startSyncAndGenerateJob(params: { budgetId: string; fullResync?: boolean }): {
    job: Job;
    steps: JobStep[];
  } {
    const job = this.jobService.createJob({
      budgetId: params.budgetId,
      type: 'sync_and_generate',
      metadata: { fullResync: params.fullResync === true },
    });

    const steps = [
      this.jobService.createJobStep({ jobId: job.id, stepType: 'sync', position: 1 }),
      this.jobService.createJobStep({ jobId: job.id, stepType: 'suggestions', position: 2 }),
    ];

    this.runCombinedJob(job, steps, params.fullResync === true);
    return { job, steps };
  }

  private runSingleJob(job: Job, fn: () => Promise<void>): void {
    setImmediate(async () => {
      try {
        this.jobService.markJobRunning(job.id);
        await fn();
        this.jobService.markJobSucceeded(job.id);
      } catch (error) {
        const reason = this.formatFailureReason(error);
        logger.error('Job execution failed', { jobId: job.id, error: reason });
        this.jobService.markJobFailed(job.id, reason);
      }
    });
  }

  private runCombinedJob(job: Job, steps: JobStep[], fullResync: boolean): void {
    setImmediate(async () => {
      try {
        this.jobService.markJobRunning(job.id);
        await this.executeStep(steps[0], async () => {
          await this.syncService.syncBudget(job.budgetId);
        });

        await this.executeStep(steps[1], async () => {
          if (fullResync) {
            await this.suggestionService.generateSuggestions(job.budgetId);
          } else {
            await this.suggestionService.generateSuggestions(job.budgetId);
          }
        });

        this.jobService.markJobSucceeded(job.id);
      } catch (error) {
        const reason = this.formatFailureReason(error);
        logger.error('Combined job execution failed', { jobId: job.id, error: reason });
        this.jobService.markJobFailed(job.id, reason);
      }
    });
  }

  private async executeStep(step: JobStep, fn: () => Promise<void>): Promise<void> {
    this.jobService.markStepRunning(step.id);
    try {
      await fn();
      this.jobService.markStepSucceeded(step.id);
    } catch (error) {
      const reason = this.formatFailureReason(error);
      this.jobService.markStepFailed(step.id, reason);
      throw error;
    }
  }

  private formatFailureReason(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return 'Unexpected error';
  }
}
