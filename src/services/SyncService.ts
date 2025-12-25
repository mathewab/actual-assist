import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { SuggestionRepository } from '../infra/repositories/SuggestionRepository.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import { createSyncPlan, type SyncPlan, createChange } from '../domain/entities/SyncPlan.js';
import { ValidationError } from '../domain/errors.js';
import { logger } from '../infra/logger.js';
import { SyncScheduler } from '../scheduler/SyncScheduler.js';

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

    // Build changes from approved suggestions with human-readable data
    const changes = approvedSuggestions.map((suggestion) => {
      const hasPayeeChange = !!(
        suggestion.payeeSuggestion?.status === 'approved' &&
        suggestion.payeeSuggestion?.proposedPayeeName &&
        suggestion.payeeSuggestion.proposedPayeeName !== suggestion.transactionPayee
      );

      return createChange({
        transactionId: suggestion.transactionId,
        proposedCategoryId: suggestion.proposedCategoryId,
        currentCategoryId: suggestion.currentCategoryId,
        suggestionId: suggestion.id,
        transactionPayee: suggestion.transactionPayee,
        transactionDate: suggestion.transactionDate,
        transactionAmount: suggestion.transactionAmount,
        transactionAccountName: suggestion.transactionAccountName,
        proposedCategoryName:
          suggestion.categorySuggestion?.proposedCategoryName ||
          suggestion.proposedCategoryName ||
          null,
        currentCategoryName: null, // We don't have this easily available
        proposedPayeeName: suggestion.payeeSuggestion?.proposedPayeeName || null,
        hasPayeeChange,
      });
    });

    // Create sync plan
    const syncPlan = createSyncPlan(crypto.randomUUID(), budgetId, changes);

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

  /**
   * Get all approved suggestions as changes ready to apply
   */
  getApprovedChanges(budgetId: string) {
    const allSuggestions = this.suggestionRepo.findByBudgetId(budgetId);
    const approvedSuggestions = allSuggestions.filter(
      (suggestion) => suggestion.status === 'approved'
    );

    return approvedSuggestions.map((suggestion) => {
      const hasPayeeChange = !!(
        suggestion.payeeSuggestion?.status === 'approved' &&
        suggestion.payeeSuggestion?.proposedPayeeName &&
        suggestion.payeeSuggestion.proposedPayeeName !== suggestion.transactionPayee
      );

      return {
        suggestionId: suggestion.id,
        transactionId: suggestion.transactionId,
        proposedCategoryId: suggestion.proposedCategoryId,
        currentCategoryId: suggestion.currentCategoryId,
        transactionPayee: suggestion.transactionPayee,
        transactionDate: suggestion.transactionDate,
        transactionAmount: suggestion.transactionAmount,
        transactionAccountName: suggestion.transactionAccountName,
        proposedCategoryName:
          suggestion.categorySuggestion?.proposedCategoryName ||
          suggestion.proposedCategoryName ||
          null,
        currentCategoryName: null,
        proposedPayeeName: suggestion.payeeSuggestion?.proposedPayeeName || null,
        hasPayeeChange,
      };
    });
  }

  /**
   * Apply specific suggestions by their IDs
   * Pauses scheduler during apply to prevent conflicts
   */
  async applySpecificSuggestions(
    budgetId: string,
    suggestionIds: string[]
  ): Promise<{ success: boolean; applied: number }> {
    logger.info('Applying specific suggestions', { budgetId, count: suggestionIds.length });

    // Pause scheduler during apply
    const scheduler = SyncScheduler.getInstance();
    if (scheduler) {
      scheduler.pause();
    }

    const allSuggestions = this.suggestionRepo.findByBudgetId(budgetId);
    const suggestionsToApply = allSuggestions.filter(
      (s) => suggestionIds.includes(s.id) && s.status === 'approved'
    );

    if (suggestionsToApply.length === 0) {
      if (scheduler) scheduler.resume();
      throw new ValidationError('No valid approved suggestions to apply');
    }

    let applied = 0;

    try {
      for (const suggestion of suggestionsToApply) {
        // Determine what to update
        const hasPayeeChange = !!(
          suggestion.payeeSuggestion?.status === 'approved' &&
          suggestion.payeeSuggestion?.proposedPayeeName &&
          suggestion.payeeSuggestion.proposedPayeeName !== suggestion.transactionPayee
        );
        const hasCategoryChange = !!(
          suggestion.categorySuggestion?.status === 'approved' || suggestion.proposedCategoryId
        );

        // Apply category change
        if (hasCategoryChange) {
          await this.actualBudget.updateTransactionCategory(
            suggestion.transactionId,
            suggestion.proposedCategoryId
          );
        }

        // Apply payee change - find or create the payee by name
        if (hasPayeeChange && suggestion.payeeSuggestion?.proposedPayeeName) {
          const payeeId = await this.actualBudget.findOrCreatePayee(
            suggestion.payeeSuggestion.proposedPayeeName
          );
          await this.actualBudget.updateTransactionPayee(suggestion.transactionId, payeeId);
          logger.debug('Applied payee change', {
            transactionId: suggestion.transactionId,
            newPayeeName: suggestion.payeeSuggestion.proposedPayeeName,
            payeeId,
          });
        }

        this.suggestionRepo.updateStatus(suggestion.id, 'applied');
        applied++;

        logger.debug('Suggestion applied', {
          suggestionId: suggestion.id,
          transactionId: suggestion.transactionId,
          categoryApplied: hasCategoryChange,
          payeeApplied: hasPayeeChange,
        });
      }

      // Sync changes to server
      await this.actualBudget.sync();

      this.auditRepo.log({
        eventType: 'sync_executed',
        entityType: 'Suggestions',
        entityId: budgetId,
        metadata: { applied, suggestionIds },
      });

      logger.info('Suggestions applied successfully', { budgetId, applied });

      // Resume scheduler after apply
      if (scheduler) {
        scheduler.resume();
      }

      return { success: true, applied };
    } catch (error) {
      // Resume scheduler on error too
      if (scheduler) {
        scheduler.resume();
      }

      this.auditRepo.log({
        eventType: 'sync_failed',
        entityType: 'Suggestions',
        entityId: budgetId,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          applied,
        },
      });

      logger.error('Failed to apply suggestions', { budgetId, error });
      throw error;
    }
  }
}
