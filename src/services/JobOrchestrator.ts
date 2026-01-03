import { logger } from '../infra/logger.js';
import type { SuggestionService } from './SuggestionService.js';
import type { PayeeMergeService } from './PayeeMergeService.js';
import type { JobService } from './JobService.js';
import type { SyncService } from './SyncService.js';
import type { SnapshotService } from './SnapshotService.js';
import type { Job } from '../domain/entities/Job.js';
import type { JobStep } from '../domain/entities/JobStep.js';

/**
 * JobOrchestrator - coordinates job execution and step ordering
 * P5 (Separation of concerns): Orchestration separate from job lifecycle updates
 */
export class JobOrchestrator {
  private readonly scheduledRetryDelays = [60000, 300000, 900000]; // 1min, 5min, 15min

  constructor(
    private jobService: JobService,
    private syncService: SyncService,
    private suggestionService: SuggestionService,
    private snapshotService: SnapshotService,
    private payeeMergeService: PayeeMergeService
  ) {}

  startBudgetSyncJob(budgetId: string): { job: Job } {
    const job = this.jobService.createJob({ budgetId, type: 'budget_sync' });
    this.runSingleJob(job, async () => {
      await this.syncService.syncBudget(budgetId);
    });
    return { job };
  }

  startSuggestionsGenerateJob(params: { budgetId: string; useAI?: boolean }): { job: Job } {
    const job = this.jobService.createJob({
      budgetId: params.budgetId,
      type: 'suggestions_generate',
      metadata: { useAI: params.useAI === true },
    });
    this.runSingleJob(job, async () => {
      await this.suggestionService.generateSuggestions(params.budgetId, params.useAI === true);
    });
    return { job };
  }

  startSyncAndSuggestJob(params: { budgetId: string; fullResync?: boolean; useAI?: boolean }): {
    job: Job;
    steps: JobStep[];
  } {
    const job = this.jobService.createJob({
      budgetId: params.budgetId,
      type: 'sync_and_suggest',
      metadata: { fullResync: params.fullResync === true, useAI: params.useAI === true },
    });

    const steps = [
      this.jobService.createJobStep({ jobId: job.id, stepType: 'sync', position: 1 }),
      this.jobService.createJobStep({ jobId: job.id, stepType: 'suggestions', position: 2 }),
    ];

    this.runCombinedJob(job, steps, params.fullResync === true, params.useAI === true);
    return { job, steps };
  }

  startSuggestionsRetryJob(params: { budgetId: string; suggestionId: string; useAI?: boolean }): {
    job: Job;
  } {
    const job = this.jobService.createJob({
      budgetId: params.budgetId,
      type: 'suggestions_retry_payee',
      metadata: { suggestionId: params.suggestionId, useAI: params.useAI === true },
    });
    this.runSingleJob(job, async () => {
      await this.suggestionService.retryPayeeGroup(params.suggestionId, params.useAI === true);
    });
    return { job };
  }

  startSuggestionsApplyJob(budgetId: string, suggestionIds: string[]): { job: Job } {
    const job = this.jobService.createJob({
      budgetId,
      type: 'suggestions_apply',
      metadata: { suggestionIds },
    });
    this.runSingleJob(job, async () => {
      await this.syncService.applySpecificSuggestions(budgetId, suggestionIds);
    });
    return { job };
  }

  startPayeeMergeSuggestionsJob(params: {
    budgetId: string;
    minScore?: number;
    useAI?: boolean;
    force?: boolean;
    aiMinClusterSize?: number;
  }): { job: Job } {
    const job = this.jobService.createJob({
      budgetId: params.budgetId,
      type: 'payees_merge_suggestions_generate',
      metadata: {
        minScore: params.minScore,
        useAI: params.useAI === true,
        force: params.force === true,
        aiMinClusterSize: params.aiMinClusterSize,
      },
    });

    this.runSingleJob(job, async () => {
      await this.payeeMergeService.generateMergeClusters({
        budgetId: params.budgetId,
        minScore: params.minScore,
        useAI: params.useAI === true,
        force: params.force === true,
        aiMinClusterSize: params.aiMinClusterSize,
      });
    });

    return { job };
  }

  startSnapshotCreateJob(budgetId: string): { job: Job } {
    const job = this.jobService.createJob({ budgetId, type: 'snapshot_create' });
    this.runSingleJob(job, async () => {
      await this.snapshotService.createSnapshot(budgetId);
    });
    return { job };
  }

  startSnapshotRedownloadJob(budgetId: string): { job: Job } {
    const job = this.jobService.createJob({
      budgetId,
      type: 'snapshot_redownload',
      metadata: { redownload: true },
    });
    this.runSingleJob(job, async () => {
      await this.snapshotService.createSnapshot(budgetId);
    });
    return { job };
  }

  startScheduledSyncAndSuggestJob(budgetId: string): { job: Job } {
    const job = this.jobService.createJob({
      budgetId,
      type: 'scheduled_sync_and_suggest',
      metadata: { trigger: 'scheduled' },
    });

    this.runScheduledJob(job, async () => {
      await this.suggestionService.syncAndGenerateSuggestions(budgetId);
    });

    return { job };
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

  private runCombinedJob(job: Job, steps: JobStep[], fullResync: boolean, useAI: boolean): void {
    setImmediate(async () => {
      try {
        this.jobService.markJobRunning(job.id);
        await this.executeStep(steps[0], async () => {
          await this.syncService.syncBudget(job.budgetId);
        });

        await this.executeStep(steps[1], async () => {
          if (fullResync) {
            await this.suggestionService.syncAndGenerateSuggestions(job.budgetId, true, useAI);
          } else {
            await this.suggestionService.syncAndGenerateSuggestions(job.budgetId, false, useAI);
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

  private runScheduledJob(job: Job, fn: () => Promise<void>): void {
    setImmediate(async () => {
      let attempt = 0;
      try {
        this.jobService.markJobRunning(job.id);
        while (true) {
          try {
            await fn();
            this.jobService.markJobSucceeded(job.id);
            return;
          } catch (error) {
            const reason = this.formatFailureReason(error);
            if (attempt >= this.scheduledRetryDelays.length) {
              logger.error('Scheduled job failed after retries', { jobId: job.id, error: reason });
              this.jobService.markJobFailed(job.id, reason);
              return;
            }
            const delay = this.scheduledRetryDelays[attempt];
            attempt += 1;
            logger.warn('Scheduled job retrying', { jobId: job.id, attempt, delayMs: delay });
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      } catch (error) {
        const reason = this.formatFailureReason(error);
        logger.error('Scheduled job execution failed', { jobId: job.id, error: reason });
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
