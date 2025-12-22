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
        id, budget_id, transaction_id, transaction_payee, transaction_amount, 
        transaction_date, current_category_id, proposed_category_id, proposed_category_name,
        confidence, rationale, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.execute(sql, [
      suggestion.id,
      suggestion.budgetId,
      suggestion.transactionId,
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
