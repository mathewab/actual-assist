import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
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
    private auditRepo: AuditRepository
  ) {}

  /**
   * Create a new budget snapshot
   * P4 (Explicitness): Returns complete BudgetSnapshot with all data
   */
  async createSnapshot(budgetId: string, syncId: string | null): Promise<BudgetSnapshot> {
    logger.info('Creating budget snapshot', { budgetId });

    // Fetch current budget state
    const [transactions, categories] = await Promise.all([
      this.actualBudget.getTransactions(),
      this.actualBudget.getCategories(),
    ]);

    // Create immutable snapshot
    const snapshot = createBudgetSnapshot({
      budgetId,
      syncId,
      transactions,
      categories,
    });

    // Log audit event
    this.auditRepo.log({
      eventType: 'snapshot_created',
      entityType: 'BudgetSnapshot',
      entityId: snapshot.id,
      metadata: {
        budgetId,
        transactionCount: transactions.length,
        categoryCount: categories.length,
      },
    });

    logger.info('Budget snapshot created', {
      snapshotId: snapshot.id,
      transactionCount: transactions.length,
      categoryCount: categories.length,
    });

    return snapshot;
  }
}
