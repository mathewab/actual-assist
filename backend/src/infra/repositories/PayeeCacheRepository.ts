import { DatabaseAdapter } from '../DatabaseAdapter.js';
import { logger } from '../logger.js';

/**
 * Cached payee→category mapping
 */
export interface PayeeCacheEntry {
  id: number;
  budgetId: string;
  payeeName: string;         // Normalized (lowercase, trimmed)
  payeeNameOriginal: string; // Original for display
  categoryId: string;
  categoryName: string;
  confidence: number;
  source: 'user_approved' | 'high_confidence_ai';
  hitCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PayeeCacheRow {
  id: number;
  budget_id: string;
  payee_name: string;
  payee_name_original: string;
  category_id: string;
  category_name: string;
  confidence: number;
  source: string;
  hit_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Repository for payee→category cache
 * Reduces LLM calls by storing learned mappings
 */
export class PayeeCacheRepository {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Normalize payee name for consistent cache lookups
   * Uses fuzzy-friendly normalization: lowercase, trim, collapse whitespace
   */
  static normalizePayeeName(payeeName: string): string {
    return payeeName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, ''); // Remove special chars for fuzzy matching
  }

  private mapRowToEntry(row: PayeeCacheRow): PayeeCacheEntry {
    return {
      id: row.id,
      budgetId: row.budget_id,
      payeeName: row.payee_name,
      payeeNameOriginal: row.payee_name_original,
      categoryId: row.category_id,
      categoryName: row.category_name,
      confidence: row.confidence,
      source: row.source as 'user_approved' | 'high_confidence_ai',
      hitCount: row.hit_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Look up cached category for a payee
   * Returns null if not found
   */
  findByPayee(budgetId: string, payeeName: string): PayeeCacheEntry | null {
    const normalized = PayeeCacheRepository.normalizePayeeName(payeeName);
    
    const row = this.db.queryOne<PayeeCacheRow>(
      `SELECT * FROM payee_category_cache WHERE budget_id = ? AND payee_name = ?`,
      [budgetId, normalized]
    );

    if (row) {
      // Increment hit count for analytics
      this.db.execute(
        `UPDATE payee_category_cache SET hit_count = hit_count + 1, updated_at = datetime('now') WHERE id = ?`,
        [row.id]
      );

      logger.debug('Payee cache hit', { payeeName, categoryName: row.category_name });
      return this.mapRowToEntry(row);
    }

    return null;
  }

  /**
   * Batch lookup for multiple payees
   * Returns a map of normalized payee name → cache entry
   */
  findByPayees(budgetId: string, payeeNames: string[]): Map<string, PayeeCacheEntry> {
    const result = new Map<string, PayeeCacheEntry>();
    if (payeeNames.length === 0) return result;

    const normalized = payeeNames.map(p => PayeeCacheRepository.normalizePayeeName(p));
    const placeholders = normalized.map(() => '?').join(',');

    const rows = this.db.query<PayeeCacheRow>(
      `SELECT * FROM payee_category_cache WHERE budget_id = ? AND payee_name IN (${placeholders})`,
      [budgetId, ...normalized]
    );

    const idsToUpdate: number[] = [];
    for (const row of rows) {
      result.set(row.payee_name, this.mapRowToEntry(row));
      idsToUpdate.push(row.id);
    }

    // Batch increment hit counts
    if (idsToUpdate.length > 0) {
      const idPlaceholders = idsToUpdate.map(() => '?').join(',');
      this.db.execute(
        `UPDATE payee_category_cache SET hit_count = hit_count + 1, updated_at = datetime('now') WHERE id IN (${idPlaceholders})`,
        idsToUpdate
      );
    }

    logger.debug('Payee cache batch lookup', { 
      requested: payeeNames.length, 
      found: result.size 
    });

    return result;
  }

  /**
   * Save a payee→category mapping to cache
   * Only caches user-approved or high-confidence AI suggestions
   */
  save(entry: {
    budgetId: string;
    payeeName: string;
    categoryId: string;
    categoryName: string;
    confidence: number;
    source: 'user_approved' | 'high_confidence_ai';
  }): void {
    const normalized = PayeeCacheRepository.normalizePayeeName(entry.payeeName);

    this.db.execute(`
      INSERT INTO payee_category_cache 
        (budget_id, payee_name, payee_name_original, category_id, category_name, confidence, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(budget_id, payee_name) DO UPDATE SET
        category_id = excluded.category_id,
        category_name = excluded.category_name,
        confidence = excluded.confidence,
        source = excluded.source,
        updated_at = datetime('now')
    `, [
      entry.budgetId,
      normalized,
      entry.payeeName,
      entry.categoryId,
      entry.categoryName,
      entry.confidence,
      entry.source,
    ]);

    logger.debug('Payee cache saved', { 
      payeeName: entry.payeeName, 
      categoryName: entry.categoryName,
      source: entry.source 
    });
  }

  /**
   * Bulk save multiple entries (for batch processing)
   */
  saveBatch(entries: Array<{
    budgetId: string;
    payeeName: string;
    categoryId: string;
    categoryName: string;
    confidence: number;
    source: 'user_approved' | 'high_confidence_ai';
  }>): void {
    for (const entry of entries) {
      this.save(entry);
    }

    logger.debug('Payee cache batch saved', { count: entries.length });
  }

  /**
   * Get cache statistics for a budget
   */
  getStats(budgetId: string): { totalEntries: number; totalHits: number } {
    const row = this.db.queryOne<{ totalEntries: number; totalHits: number }>(
      `SELECT COUNT(*) as totalEntries, COALESCE(SUM(hit_count), 0) as totalHits FROM payee_category_cache WHERE budget_id = ?`,
      [budgetId]
    );

    return row || { totalEntries: 0, totalHits: 0 };
  }

  /**
   * Get all cached payee→category mappings for a budget
   * Used for fuzzy matching against known payees
   */
  getAllCachedPayees(budgetId: string): PayeeCacheEntry[] {
    const rows = this.db.query<PayeeCacheRow>(
      `SELECT * FROM payee_category_cache WHERE budget_id = ? ORDER BY hit_count DESC`,
      [budgetId]
    );

    const entries = rows.map(row => this.mapRowToEntry(row));
    logger.debug('Retrieved all cached payees', { budgetId, count: entries.length });
    return entries;
  }

  /**
   * Clear cache for a budget (useful for testing or reset)
   */
  clearBudgetCache(budgetId: string): void {
    this.db.execute(
      `DELETE FROM payee_category_cache WHERE budget_id = ?`,
      [budgetId]
    );

    logger.info('Payee cache cleared', { budgetId });
  }
}
