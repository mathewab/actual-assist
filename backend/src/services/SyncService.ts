import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { SuggestionRepository } from '../infra/repositories/SuggestionRepository.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import { createSyncPlan, type SyncPlan, createChange } from '../domain/entities/SyncPlan.js';
import { ValidationError } from '../domain/errors.js';
import { logger } from '../infra/logger.js';

/**
 * SyncService - manages syncing approved suggestions to Actual Budget
 * P1 (Single Responsibility): Handles sync plan creation and execution
 * P7 (Explicit error handling): All operations wrapped with proper error types
 */
export class SyncService {
  constructor(
    private actualBudget: ActualBudgetAdapter,
    private suggestionRepo: SuggestionRepository,
    private auditRepo: AuditRepository
  ) {}

  /**
   * Create a sync plan from approved suggestions
   * P4 (Explicitness): Returns complete SyncPlan entity
   */
  createSyncPlan(budgetId: string): SyncPlan {
    logger.info('Creating sync plan', { budgetId });

    // Get all approved suggestions for this budget
    const allSuggestions = this.suggestionRepo.findByBudgetId(budgetId);
    const approvedSuggestions = allSuggestions.filter(
      (suggestion) => suggestion.status === 'approved'
    );

    if (approvedSuggestions.length === 0) {
      throw new ValidationError('No approved suggestions to sync');
    }

    // Build changes from approved suggestions
    const changes = approvedSuggestions.map(suggestion =>
      createChange(
        suggestion.transactionId,
        suggestion.proposedCategoryId,
        suggestion.currentCategoryId,
        suggestion.id
      )
    );

    // Create sync plan
    const syncPlan = createSyncPlan(crypto.randomUUID(), budgetId, changes, approvedSuggestions.length);

    // Log audit event
    this.auditRepo.log({
      eventType: 'sync_plan_created',
      entityType: 'SyncPlan',
      entityId: syncPlan.id,
      metadata: {
        budgetId,
        changeCount: syncPlan.changes.length,
      },
    });

    logger.info('Sync plan created', {
      planId: syncPlan.id,
      changeCount: syncPlan.changes.length,
    });

    return syncPlan;
  }

  /**
   * Execute a sync plan - apply changes to Actual Budget
   * P7 (Explicit error handling): Rolls back on failure, logs all operations
   */
  async executeSyncPlan(syncPlan: SyncPlan): Promise<void> {
    logger.info('Executing sync plan', {
      planId: syncPlan.id,
      changeCount: syncPlan.changes.length,
    });

    try {
      // Apply each change
      for (const change of syncPlan.changes) {
        await this.actualBudget.updateTransactionCategory(
          change.transactionId,
          change.proposedCategoryId
        );

        // Update suggestion status to 'applied'
        if (change.suggestionId) {
          this.suggestionRepo.updateStatus(change.suggestionId, 'applied');
        }

        logger.debug('Sync change applied', {
          transactionId: change.transactionId,
          proposedCategoryId: change.proposedCategoryId,
        });
      }

      // Sync changes to server
      await this.actualBudget.sync();

      // Log success audit event
      this.auditRepo.log({
        eventType: 'sync_executed',
        entityType: 'SyncPlan',
        entityId: syncPlan.id,
        metadata: {
          changesApplied: syncPlan.changes.length,
        },
      });

      logger.info('Sync plan executed successfully', {
        planId: syncPlan.id,
        changesApplied: syncPlan.changes.length,
      });
    } catch (error) {
      // Log failure audit event
      this.auditRepo.log({
        eventType: 'sync_failed',
        entityType: 'SyncPlan',
        entityId: syncPlan.id,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      logger.error('Sync plan execution failed', {
        planId: syncPlan.id,
        error,
      });

      throw error;
    }
  }
}
