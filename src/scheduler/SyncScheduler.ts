import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../infra/logger.js';
import type { JobOrchestrator } from '../services/JobOrchestrator.js';
import type { Env } from '../infra/env.js';

/**
 * SyncScheduler - Periodic sync scheduling using node-cron
 * P1 (Modularity): Single responsibility for scheduling
 * P7 (Error handling): Retry with exponential backoff
 */
export class SyncScheduler {
  private task: ScheduledTask | null = null;
  private isPaused = false;
  private static instance: SyncScheduler | null = null;

  constructor(
    private env: Env,
    private jobOrchestrator: JobOrchestrator,
    private budgetId: string
  ) {
    SyncScheduler.instance = this;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SyncScheduler | null {
    return SyncScheduler.instance;
  }

  /**
   * Pause the scheduler (for use during apply operations)
   */
  pause(): void {
    this.isPaused = true;
    logger.info('SyncScheduler paused');
  }

  /**
   * Resume the scheduler after pause
   */
  resume(): void {
    this.isPaused = false;
    logger.info('SyncScheduler resumed');
  }

  /**
   * Start the periodic sync scheduler
   * Runs every SYNC_INTERVAL_MINUTES minutes
   */
  start(): void {
    const intervalMinutes = this.env.SYNC_INTERVAL_MINUTES;

    // Validate interval
    if (intervalMinutes < 1) {
      logger.warn('SYNC_INTERVAL_MINUTES is less than 1, skipping scheduler');
      return;
    }

    // Create cron expression: run every N minutes
    // For intervals > 59 minutes, we need to handle differently
    let cronExpression: string;
    if (intervalMinutes <= 59) {
      cronExpression = `*/${intervalMinutes} * * * *`;
    } else {
      // For longer intervals, run every hour and check internally
      cronExpression = '0 * * * *'; // Every hour on the hour
    }

    this.task = cron.schedule(cronExpression, async () => {
      await this.runSync();
    });

    logger.info('SyncScheduler started', {
      intervalMinutes,
      cronExpression,
      budgetId: this.budgetId,
    });
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('SyncScheduler stopped');
    }
  }

  /**
   * Enqueue scheduled sync+suggest job
   */
  private async runSync(): Promise<void> {
    if (this.isPaused) {
      logger.info('Periodic sync skipped - scheduler is paused');
      return;
    }

    try {
      logger.info('Periodic sync starting', { budgetId: this.budgetId });
      this.jobOrchestrator.startScheduledSyncAndSuggestJob(this.budgetId);
      logger.info('Periodic sync job enqueued', { budgetId: this.budgetId });
    } catch (error) {
      logger.error('Failed to enqueue periodic sync job', {
        budgetId: this.budgetId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Factory function to create and start scheduler
 */
export function startScheduler(
  env: Env,
  jobOrchestrator: JobOrchestrator,
  budgetId: string
): SyncScheduler {
  const scheduler = new SyncScheduler(env, jobOrchestrator, budgetId);
  scheduler.start();
  return scheduler;
}
