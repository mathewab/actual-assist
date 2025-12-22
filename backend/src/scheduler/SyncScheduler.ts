import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../infra/logger.js';
import type { SuggestionService } from '../services/SuggestionService.js';
import type { Env } from '../infra/env.js';

/**
 * SyncScheduler - Periodic sync scheduling using node-cron
 * P1 (Modularity): Single responsibility for scheduling
 * P7 (Error handling): Retry with exponential backoff
 */
export class SyncScheduler {
  private task: ScheduledTask | null = null;
  private retryCount = 0;
  private readonly maxRetries = 3;
  private readonly retryDelays = [60000, 300000, 900000]; // 1min, 5min, 15min

  constructor(
    private env: Env,
    private suggestionService: SuggestionService,
    private budgetId: string
  ) {}

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
   * Run sync with retry logic
   * P7 (Error handling): Exponential backoff on failure
   */
  private async runSync(): Promise<void> {
    try {
      logger.info('Periodic sync starting', { budgetId: this.budgetId });

      const suggestions = await this.suggestionService.syncAndGenerateSuggestions(this.budgetId);

      // Reset retry count on success
      this.retryCount = 0;

      logger.info('Periodic sync completed', {
        budgetId: this.budgetId,
        suggestionsGenerated: suggestions.length,
      });
    } catch (error) {
      logger.error('Periodic sync failed', {
        budgetId: this.budgetId,
        error: error instanceof Error ? error.message : String(error),
        retryCount: this.retryCount,
      });

      // Retry with backoff if under max retries
      if (this.retryCount < this.maxRetries) {
        const delay = this.retryDelays[this.retryCount];
        this.retryCount++;

        logger.info('Scheduling retry', {
          retryNumber: this.retryCount,
          delayMs: delay,
        });

        setTimeout(() => this.runSync(), delay);
      } else {
        // Max retries exhausted - log critical error
        logger.error('Periodic sync failed after max retries', {
          budgetId: this.budgetId,
          maxRetries: this.maxRetries,
        });

        // Reset for next scheduled run
        this.retryCount = 0;
      }
    }
  }
}

/**
 * Factory function to create and start scheduler
 */
export function startScheduler(
  env: Env,
  suggestionService: SuggestionService,
  budgetId: string
): SyncScheduler {
  const scheduler = new SyncScheduler(env, suggestionService, budgetId);
  scheduler.start();
  return scheduler;
}
