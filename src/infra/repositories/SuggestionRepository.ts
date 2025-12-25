import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import type {
  Suggestion,
  SuggestionStatus,
  SuggestionComponentStatus,
} from '../../domain/entities/Suggestion.js';
import {
  computeCombinedStatus,
  computeCombinedConfidence,
  computeCombinedRationale,
} from '../../domain/entities/Suggestion.js';
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
   * Uses INSERT OR REPLACE to handle unique constraint on (budget_id, transaction_id)
   * If a suggestion already exists for this transaction, it will be replaced
   * P4 (Explicitness): All fields explicitly mapped
   */
  save(suggestion: Suggestion): void {
    const sql = `
      INSERT OR REPLACE INTO suggestions (
        id, budget_id, transaction_id, transaction_account_id, transaction_account_name,
        transaction_payee, transaction_amount, transaction_date, 
        current_category_id, current_payee_id,
        proposed_payee_id, proposed_payee_name, payee_confidence, payee_rationale, payee_status,
        proposed_category_id, proposed_category_name, category_confidence, category_rationale, category_status,
        suggested_payee_name, confidence, rationale, status,
        corrected_payee_id, corrected_payee_name, corrected_category_id, corrected_category_name,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      suggestion.currentPayeeId,
      suggestion.payeeSuggestion.proposedPayeeId,
      suggestion.payeeSuggestion.proposedPayeeName,
      suggestion.payeeSuggestion.confidence,
      suggestion.payeeSuggestion.rationale,
      suggestion.payeeSuggestion.status,
      suggestion.categorySuggestion.proposedCategoryId,
      suggestion.categorySuggestion.proposedCategoryName,
      suggestion.categorySuggestion.confidence,
      suggestion.categorySuggestion.rationale,
      suggestion.categorySuggestion.status,
      suggestion.suggestedPayeeName,
      suggestion.confidence,
      suggestion.rationale,
      suggestion.status,
      suggestion.correction.correctedPayeeId,
      suggestion.correction.correctedPayeeName,
      suggestion.correction.correctedCategoryId,
      suggestion.correction.correctedCategoryName,
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
    return rows.map((row) => this.mapRowToSuggestion(row));
  }

  /**
   * Find suggestions by status
   */
  findByStatus(status: SuggestionStatus): Suggestion[] {
    const sql = 'SELECT * FROM suggestions WHERE status = ? ORDER BY created_at DESC';
    const rows = this.db.query<any>(sql, [status]);
    return rows.map((row) => this.mapRowToSuggestion(row));
  }

  /**
   * Find suggestions with pending payee or category components
   */
  findWithPendingComponents(budgetId: string): Suggestion[] {
    const sql = `
      SELECT * FROM suggestions 
      WHERE budget_id = ? 
        AND (payee_status = 'pending' OR category_status = 'pending')
      ORDER BY created_at DESC
    `;
    const rows = this.db.query<any>(sql, [budgetId]);
    return rows.map((row) => this.mapRowToSuggestion(row));
  }

  /**
   * Update suggestion status (legacy - updates both components)
   * P2 (Zero duplication): Single place to update status
   */
  updateStatus(id: string, status: SuggestionStatus): void {
    // Map legacy status to component statuses
    let payeeStatus: SuggestionComponentStatus;
    let categoryStatus: SuggestionComponentStatus;

    if (status === 'approved') {
      payeeStatus = 'approved';
      categoryStatus = 'approved';
    } else if (status === 'rejected') {
      payeeStatus = 'rejected';
      categoryStatus = 'rejected';
    } else if (status === 'applied') {
      payeeStatus = 'applied';
      categoryStatus = 'applied';
    } else {
      payeeStatus = 'pending';
      categoryStatus = 'pending';
    }

    const sql = `
      UPDATE suggestions 
      SET status = ?, payee_status = ?, category_status = ?, updated_at = ? 
      WHERE id = ?
    `;
    const changes = this.db.execute(sql, [
      status,
      payeeStatus,
      categoryStatus,
      new Date().toISOString(),
      id,
    ]);

    if (changes === 0) {
      throw new NotFoundError('Suggestion', id);
    }

    logger.debug('Suggestion status updated', { id, status });
  }

  /**
   * Update payee suggestion status independently
   */
  updatePayeeStatus(
    id: string,
    payeeStatus: SuggestionComponentStatus,
    correction?: { payeeId?: string | null; payeeName?: string | null }
  ): void {
    const suggestion = this.findById(id);
    if (!suggestion) {
      throw new NotFoundError('Suggestion', id);
    }

    const newCombinedStatus = computeCombinedStatus(
      payeeStatus,
      suggestion.categorySuggestion.status
    );
    const now = new Date().toISOString();

    let sql = `
      UPDATE suggestions 
      SET payee_status = ?, status = ?, updated_at = ?
    `;
    const params: any[] = [payeeStatus, newCombinedStatus, now];

    if (correction) {
      sql += `, corrected_payee_id = ?, corrected_payee_name = ?`;
      params.push(correction.payeeId ?? null, correction.payeeName ?? null);
    }

    sql += ` WHERE id = ?`;
    params.push(id);

    this.db.execute(sql, params);
    logger.debug('Suggestion payee status updated', { id, payeeStatus, correction });
  }

  /**
   * Update category suggestion status independently
   */
  updateCategoryStatus(
    id: string,
    categoryStatus: SuggestionComponentStatus,
    correction?: { categoryId?: string | null; categoryName?: string | null }
  ): void {
    const suggestion = this.findById(id);
    if (!suggestion) {
      throw new NotFoundError('Suggestion', id);
    }

    const newCombinedStatus = computeCombinedStatus(
      suggestion.payeeSuggestion.status,
      categoryStatus
    );
    const now = new Date().toISOString();

    let sql = `
      UPDATE suggestions 
      SET category_status = ?, status = ?, updated_at = ?
    `;
    const params: any[] = [categoryStatus, newCombinedStatus, now];

    if (correction) {
      sql += `, corrected_category_id = ?, corrected_category_name = ?`;
      params.push(correction.categoryId ?? null, correction.categoryName ?? null);
    }

    sql += ` WHERE id = ?`;
    params.push(id);

    this.db.execute(sql, params);
    logger.debug('Suggestion category status updated', { id, categoryStatus, correction });
  }

  /**
   * Update category proposal and status (used for user corrections)
   */
  updateCategoryProposal(
    id: string,
    params: {
      categoryId: string | null;
      categoryName: string | null;
      categoryStatus: SuggestionComponentStatus;
      correction?: { categoryId?: string | null; categoryName?: string | null };
    }
  ): void {
    const suggestion = this.findById(id);
    if (!suggestion) {
      throw new NotFoundError('Suggestion', id);
    }

    const newCombinedStatus = computeCombinedStatus(
      suggestion.payeeSuggestion.status,
      params.categoryStatus
    );
    const now = new Date().toISOString();

    let sql = `
      UPDATE suggestions
      SET proposed_category_id = ?,
          proposed_category_name = ?,
          category_status = ?,
          status = ?,
          updated_at = ?
    `;
    const sqlParams: any[] = [
      params.categoryId,
      params.categoryName,
      params.categoryStatus,
      newCombinedStatus,
      now,
    ];

    if (params.correction) {
      sql += `, corrected_category_id = ?, corrected_category_name = ?`;
      sqlParams.push(params.correction.categoryId ?? null, params.correction.categoryName ?? null);
    }

    sql += ` WHERE id = ?`;
    sqlParams.push(id);

    this.db.execute(sql, sqlParams);
    logger.debug('Suggestion category proposal updated', {
      id,
      categoryStatus: params.categoryStatus,
      correction: params.correction,
    });
  }

  /**
   * Update payee proposal and status (used for user corrections)
   */
  updatePayeeProposal(
    id: string,
    params: {
      payeeId: string | null;
      payeeName: string | null;
      payeeStatus: SuggestionComponentStatus;
      correction?: { payeeId?: string | null; payeeName?: string | null };
    }
  ): void {
    const suggestion = this.findById(id);
    if (!suggestion) {
      throw new NotFoundError('Suggestion', id);
    }

    const newCombinedStatus = computeCombinedStatus(
      params.payeeStatus,
      suggestion.categorySuggestion.status
    );
    const now = new Date().toISOString();

    let sql = `
      UPDATE suggestions
      SET proposed_payee_id = ?,
          proposed_payee_name = ?,
          suggested_payee_name = ?,
          payee_status = ?,
          status = ?,
          updated_at = ?
    `;
    const sqlParams: any[] = [
      params.payeeId,
      params.payeeName,
      params.payeeName,
      params.payeeStatus,
      newCombinedStatus,
      now,
    ];

    if (params.correction) {
      sql += `, corrected_payee_id = ?, corrected_payee_name = ?`;
      sqlParams.push(params.correction.payeeId ?? null, params.correction.payeeName ?? null);
    }

    sql += ` WHERE id = ?`;
    sqlParams.push(id);

    this.db.execute(sql, sqlParams);
    logger.debug('Suggestion payee proposal updated', {
      id,
      payeeStatus: params.payeeStatus,
      correction: params.correction,
    });
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
    return new Set(rows.map((row) => row.transaction_id));
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
      .filter((row) => !validTransactionIds.has(row.transaction_id))
      .map((row) => row.id);

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
        .filter((row) => !validTransactionIds.has(row.transaction_id))
        .map((row) => row.transaction_id),
    });

    return deleteCount;
  }

  /**
   * Map database row to Suggestion entity
   * Handles both new schema and legacy schema for backward compatibility
   * P2 (Zero duplication): Single mapping function
   */
  private mapRowToSuggestion(row: any): Suggestion {
    // Handle new schema with separate payee/category fields
    const payeeStatus = (row.payee_status || 'skipped') as SuggestionComponentStatus;
    const categoryStatus = (row.category_status || 'pending') as SuggestionComponentStatus;
    const payeeConfidence = row.payee_confidence ?? 0;
    const categoryConfidence = row.category_confidence ?? row.confidence ?? 0;
    const payeeRationale = row.payee_rationale || '';
    const categoryRationale = row.category_rationale || row.rationale || '';

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
      currentPayeeId: row.current_payee_id || null,

      payeeSuggestion: {
        proposedPayeeId: row.proposed_payee_id || null,
        proposedPayeeName: row.proposed_payee_name || row.suggested_payee_name || null,
        confidence: payeeConfidence,
        rationale: payeeRationale,
        status: payeeStatus,
      },

      categorySuggestion: {
        proposedCategoryId: row.proposed_category_id,
        proposedCategoryName: row.proposed_category_name,
        confidence: categoryConfidence,
        rationale: categoryRationale,
        status: categoryStatus,
      },

      correction: {
        correctedPayeeId: row.corrected_payee_id || null,
        correctedPayeeName: row.corrected_payee_name || null,
        correctedCategoryId: row.corrected_category_id || null,
        correctedCategoryName: row.corrected_category_name || null,
      },

      // Legacy fields
      suggestedPayeeName: row.suggested_payee_name,
      confidence:
        row.confidence ??
        computeCombinedConfidence(payeeConfidence, categoryConfidence, payeeStatus, categoryStatus),
      rationale:
        row.rationale ||
        computeCombinedRationale(payeeRationale, categoryRationale, payeeStatus, categoryStatus),
      status: (row.status ||
        computeCombinedStatus(payeeStatus, categoryStatus)) as SuggestionStatus,
      proposedCategoryId: row.proposed_category_id || 'unknown',
      proposedCategoryName: row.proposed_category_name || 'Unknown',

      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
