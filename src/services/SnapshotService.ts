import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { SuggestionRepository } from '../infra/repositories/SuggestionRepository.js';
import { createBudgetSnapshot, type BudgetSnapshot } from '../domain/entities/BudgetSnapshot.js';
import { logger } from '../infra/logger.js';

/**
 * SnapshotService - creates immutable snapshots of budget state
 * P1 (Single Responsibility): Focused on snapshot creation only
 * P5 (Separation of concerns): Coordinates between adapters and domain
 */
export class SnapshotService {
  constructor(
    private actualBudget: ActualBudgetAdapter,
    private auditRepo: AuditRepository,
    private suggestionRepo: SuggestionRepository
  ) {}

  /**
   * Create a new budget snapshot
   * P4 (Explicitness): Returns complete BudgetSnapshot with all data
   */
  async createSnapshot(budgetId: string): Promise<BudgetSnapshot> {
    logger.info('Creating budget snapshot', { budgetId });

    // Fetch current budget state
    const [transactions, categories] = await Promise.all([
      this.actualBudget.getTransactions(),
      this.actualBudget.getCategories(),
    ]);

    // Clear any existing suggestions for this budget to avoid stale data after redownload
    const cleared = this.suggestionRepo.deleteByBudgetId(budgetId);
    if (cleared > 0) {
      logger.info('Cleared existing suggestions for budget', { budgetId, cleared });
    }

    // Create immutable snapshot
    const snapshot = createBudgetSnapshot({
      budgetId,
      filepath: '', // Filepath is populated when downloaded
      transactionCount: transactions.length,
      categoryCount: categories.length,
    });

    // Log audit event
    this.auditRepo.log({
      eventType: 'snapshot_created',
      entityType: 'BudgetSnapshot',
      entityId: budgetId,
      metadata: {
        budgetId,
        transactionCount: transactions.length,
        categoryCount: categories.length,
      },
    });

    logger.info('Budget snapshot created', {
      budgetId,
      transactionCount: transactions.length,
      categoryCount: categories.length,
    });

    return snapshot;
  }
}
