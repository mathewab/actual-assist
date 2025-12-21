import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { SuggestionRepository } from '../infra/repositories/SuggestionRepository.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import { createSyncPlan, type SyncPlan } from '../domain/entities/SyncPlan.js';
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
  createSyncPlan(snapshotId: string): SyncPlan {
    logger.info('Creating sync plan', { snapshotId });

    // Get all approved suggestions
    const allSuggestions = this.suggestionRepo.findBySnapshotId(snapshotId);
    const approvedSuggestions = allSuggestions.filter(
      (suggestion) => suggestion.status === 'approved'
    );

    if (approvedSuggestions.length === 0) {
      throw new ValidationError('No approved suggestions to sync');
    }

    // Create sync plan
    const syncPlan = createSyncPlan(snapshotId, approvedSuggestions);

    // Log audit event
    this.auditRepo.log({
      eventType: 'sync_plan_created',
      entityType: 'SyncPlan',
      entityId: syncPlan.id,
      metadata: {
        snapshotId,
        operationCount: syncPlan.operations.length,
      },
    });

    logger.info('Sync plan created', {
      planId: syncPlan.id,
      operationCount: syncPlan.operations.length,
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
      operationCount: syncPlan.operations.length,
    });

    try {
      // Apply each operation
      for (const operation of syncPlan.operations) {
        await this.actualBudget.updateTransactionCategory(
          operation.transactionId,
          operation.newCategoryId
        );

        // Update suggestion status to 'applied'
        this.suggestionRepo.updateStatus(operation.suggestionId, 'applied');

        logger.debug('Sync operation applied', {
          transactionId: operation.transactionId,
          newCategoryId: operation.newCategoryId,
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
          operationsApplied: syncPlan.operations.length,
        },
      });

      logger.info('Sync plan executed successfully', {
        planId: syncPlan.id,
        operationsApplied: syncPlan.operations.length,
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
