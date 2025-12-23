import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import type { Suggestion, SuggestionStatus } from '../../domain/entities/Suggestion.js';
import { NotFoundError } from '../../domain/errors.js';
import { logger } from '../logger.js';

/**
 * Repository for Suggestion persistence
 * P5 (Separation of concerns): Service layer uses this, domain never imports infra
 */
export class SuggestionRepository {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Save a suggestion to the database
   * P4 (Explicitness): All fields explicitly mapped
   */
  save(suggestion: Suggestion): void {
    const sql = `
      INSERT INTO suggestions (
        id, budget_id, transaction_id, transaction_account_id, transaction_account_name,
        transaction_payee, transaction_amount, transaction_date, current_category_id,
        proposed_category_id, proposed_category_name, confidence, rationale, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.execute(sql, [
      suggestion.id,
      suggestion.budgetId,
      suggestion.transactionId,
      suggestion.transactionAccountId,
      suggestion.transactionAccountName,
      suggestion.transactionPayee,
      suggestion.transactionAmount,
      suggestion.transactionDate,
      suggestion.currentCategoryId,
      suggestion.proposedCategoryId,
      suggestion.proposedCategoryName,
      suggestion.confidence,
      suggestion.rationale,
      suggestion.status,
      suggestion.createdAt,
      suggestion.updatedAt,
    ]);

    logger.debug('Suggestion saved', { id: suggestion.id });
  }

  /**
   * Find suggestion by ID
   */
  findById(id: string): Suggestion | null {
    const sql = 'SELECT * FROM suggestions WHERE id = ?';
    const row = this.db.queryOne<any>(sql, [id]);

    if (!row) {
      return null;
    }

    return this.mapRowToSuggestion(row);
  }

  /**
   * Find all suggestions for a budget snapshot
   */
  findByBudgetId(budgetId: string): Suggestion[] {
    const sql = 'SELECT * FROM suggestions WHERE budget_id = ? ORDER BY created_at DESC';
    const rows = this.db.query<any>(sql, [budgetId]);
    return rows.map(row => this.mapRowToSuggestion(row));
  }

  /**
   * Find suggestions by status
   */
  findByStatus(status: SuggestionStatus): Suggestion[] {
    const sql = 'SELECT * FROM suggestions WHERE status = ? ORDER BY created_at DESC';
    const rows = this.db.query<any>(sql, [status]);
    return rows.map(row => this.mapRowToSuggestion(row));
  }

  /**
   * Update suggestion status
   * P2 (Zero duplication): Single place to update status
   */
  updateStatus(id: string, status: SuggestionStatus): void {
    const sql = 'UPDATE suggestions SET status = ?, updated_at = ? WHERE id = ?';
    const changes = this.db.execute(sql, [status, new Date().toISOString(), id]);

    if (changes === 0) {
      throw new NotFoundError('Suggestion', id);
    }

    logger.debug('Suggestion status updated', { id, status });
  }

  /**
   * Delete all suggestions for a budget
   */
  deleteByBudgetId(budgetId: string): number {
    const sql = 'DELETE FROM suggestions WHERE budget_id = ?';
    return this.db.execute(sql, [budgetId]);
  }

  /**
   * Find suggestion by transaction ID (most recent pending one)
   * Used for deduplication during suggestion generation
   */
  findByTransactionId(budgetId: string, transactionId: string): Suggestion | null {
    const sql = `
      SELECT * FROM suggestions 
      WHERE budget_id = ? AND transaction_id = ? AND status = 'pending'
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const row = this.db.queryOne<any>(sql, [budgetId, transactionId]);
    return row ? this.mapRowToSuggestion(row) : null;
  }

  /**
   * Get set of transaction IDs that already have pending suggestions
   * Used for efficient deduplication during batch suggestion generation
   */
  getExistingPendingTransactionIds(budgetId: string): Set<string> {
    const sql = `
      SELECT DISTINCT transaction_id 
      FROM suggestions 
      WHERE budget_id = ? AND status = 'pending'
    `;
    const rows = this.db.query<{ transaction_id: string }>(sql, [budgetId]);
    return new Set(rows.map(row => row.transaction_id));
  }

  /**
   * Delete orphaned suggestions whose transactions no longer exist in the budget
   * Called after sync/redownload to clean up stale data
   * @param budgetId The budget ID to clean up
   * @param validTransactionIds Set of transaction IDs that still exist in the budget
   * @returns Number of deleted suggestions
   */
  cleanupOrphanedSuggestions(budgetId: string, validTransactionIds: Set<string>): number {
    // Get all pending suggestions for this budget
    const allPending = this.db.query<{ id: string; transaction_id: string }>(
      `SELECT id, transaction_id FROM suggestions WHERE budget_id = ? AND status = 'pending'`,
      [budgetId]
    );

    // Find orphaned ones (transaction no longer exists)
    const orphanedIds = allPending
      .filter(row => !validTransactionIds.has(row.transaction_id))
      .map(row => row.id);

    if (orphanedIds.length === 0) {
      return 0;
    }

    // Delete orphaned suggestions
    const placeholders = orphanedIds.map(() => '?').join(',');
    const deleteCount = this.db.execute(
      `DELETE FROM suggestions WHERE id IN (${placeholders})`,
      orphanedIds
    );

    logger.info('Cleaned up orphaned suggestions', {
      budgetId,
      deletedCount: deleteCount,
      orphanedTransactionIds: allPending
        .filter(row => !validTransactionIds.has(row.transaction_id))
        .map(row => row.transaction_id),
    });

    return deleteCount;
  }

  /**
   * Map database row to Suggestion entity
   * P2 (Zero duplication): Single mapping function
   */
  private mapRowToSuggestion(row: any): Suggestion {
    return {
      id: row.id,
      budgetId: row.budget_id,
      transactionId: row.transaction_id,
      transactionPayee: row.transaction_payee,
      transactionAmount: row.transaction_amount,
      transactionDate: row.transaction_date,
      transactionAccountId: row.transaction_account_id,
      transactionAccountName: row.transaction_account_name,
      currentCategoryId: row.current_category_id,
      proposedCategoryId: row.proposed_category_id,
      proposedCategoryName: row.proposed_category_name,
      confidence: row.confidence,
      rationale: row.rationale,
      status: row.status as SuggestionStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
