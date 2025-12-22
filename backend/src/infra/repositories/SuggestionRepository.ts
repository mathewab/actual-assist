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
        id, budget_snapshot_id, transaction_id, suggested_category_id,
        suggested_category_name, confidence, reasoning, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.execute(sql, [
      suggestion.id,
      suggestion.budgetSnapshotId,
      suggestion.transactionId,
      suggestion.suggestedCategoryId,
      suggestion.suggestedCategoryName,
      suggestion.confidence,
      suggestion.reasoning,
      suggestion.status,
      suggestion.createdAt.toISOString(),
      suggestion.updatedAt.toISOString(),
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
  findBySnapshotId(snapshotId: string): Suggestion[] {
    const sql = 'SELECT * FROM suggestions WHERE budget_snapshot_id = ? ORDER BY created_at DESC';
    const rows = this.db.query<any>(sql, [snapshotId]);
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
   * Delete all suggestions for a snapshot
   */
  deleteBySnapshotId(snapshotId: string): number {
    const sql = 'DELETE FROM suggestions WHERE budget_snapshot_id = ?';
    return this.db.execute(sql, [snapshotId]);
  }

  /**
   * Map database row to Suggestion entity
   * P2 (Zero duplication): Single mapping function
   */
  private mapRowToSuggestion(row: any): Suggestion {
    return {
      id: row.id,
      budgetSnapshotId: row.budget_snapshot_id,
      transactionId: row.transaction_id,
      suggestedCategoryId: row.suggested_category_id,
      suggestedCategoryName: row.suggested_category_name,
      confidence: row.confidence,
      reasoning: row.reasoning,
      status: row.status as SuggestionStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
