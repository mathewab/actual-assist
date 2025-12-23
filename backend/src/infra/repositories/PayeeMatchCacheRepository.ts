import { DatabaseAdapter } from '../DatabaseAdapter.js';
import { logger } from '../logger.js';

/**
 * Cached payee match entry (raw payee name -> canonical payee)
 * Separate from PayeeCacheEntry which maps payee->category
 */
export interface PayeeMatchCacheEntry {
  id: number;
  budgetId: string;
  rawPayeeName: string;           // Normalized raw payee name
  rawPayeeNameOriginal: string;   // Original for display
  canonicalPayeeId: string | null; // Canonical payee ID in Actual (if exists)
  canonicalPayeeName: string;      // Canonical/clean payee name
  confidence: number;
  source: 'user_approved' | 'high_confidence_ai' | 'fuzzy_match';
  hitCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PayeeMatchCacheRow {
  id: number;
  budget_id: string;
  raw_payee_name: string;
  raw_payee_name_original: string;
  canonical_payee_id: string | null;
  canonical_payee_name: string;
  confidence: number;
  source: string;
  hit_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Repository for payee match cache
 * Caches raw payee name -> canonical payee name mappings
 * Separate from PayeeCacheRepository which caches payee->category
 */
export class PayeeMatchCacheRepository {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Normalize payee name for consistent cache lookups
   */
  static normalizePayeeName(payeeName: string): string {
    return payeeName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');
  }

  private mapRowToEntry(row: PayeeMatchCacheRow): PayeeMatchCacheEntry {
    return {
      id: row.id,
      budgetId: row.budget_id,
      rawPayeeName: row.raw_payee_name,
      rawPayeeNameOriginal: row.raw_payee_name_original,
      canonicalPayeeId: row.canonical_payee_id,
      canonicalPayeeName: row.canonical_payee_name,
      confidence: row.confidence,
      source: row.source as 'user_approved' | 'high_confidence_ai' | 'fuzzy_match',
      hitCount: row.hit_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Look up cached canonical payee for a raw payee name
   */
  findByPayee(budgetId: string, rawPayeeName: string): PayeeMatchCacheEntry | null {
    const normalized = PayeeMatchCacheRepository.normalizePayeeName(rawPayeeName);
    
    const row = this.db.queryOne<PayeeMatchCacheRow>(
      `SELECT * FROM payee_match_cache WHERE budget_id = ? AND raw_payee_name = ?`,
      [budgetId, normalized]
    );

    if (row) {
      // Increment hit count for analytics
      this.db.execute(
        `UPDATE payee_match_cache SET hit_count = hit_count + 1, updated_at = datetime('now') WHERE id = ?`,
        [row.id]
      );

      logger.debug('Payee match cache hit', { 
        rawPayeeName, 
        canonicalPayeeName: row.canonical_payee_name 
      });
      return this.mapRowToEntry(row);
    }

    return null;
  }

  /**
   * Batch lookup for multiple payees
   */
  findByPayees(budgetId: string, rawPayeeNames: string[]): Map<string, PayeeMatchCacheEntry> {
    const result = new Map<string, PayeeMatchCacheEntry>();
    if (rawPayeeNames.length === 0) return result;

    const normalized = rawPayeeNames.map(p => PayeeMatchCacheRepository.normalizePayeeName(p));
    const placeholders = normalized.map(() => '?').join(',');

    const rows = this.db.query<PayeeMatchCacheRow>(
      `SELECT * FROM payee_match_cache WHERE budget_id = ? AND raw_payee_name IN (${placeholders})`,
      [budgetId, ...normalized]
    );

    const idsToUpdate: number[] = [];
    for (const row of rows) {
      result.set(row.raw_payee_name, this.mapRowToEntry(row));
      idsToUpdate.push(row.id);
    }

    // Batch increment hit counts
    if (idsToUpdate.length > 0) {
      const idPlaceholders = idsToUpdate.map(() => '?').join(',');
      this.db.execute(
        `UPDATE payee_match_cache SET hit_count = hit_count + 1, updated_at = datetime('now') WHERE id IN (${idPlaceholders})`,
        idsToUpdate
      );
    }

    logger.debug('Payee match cache batch lookup', { 
      requested: rawPayeeNames.length, 
      found: result.size 
    });

    return result;
  }

  /**
   * Save a payee match to cache
   */
  save(entry: {
    budgetId: string;
    rawPayeeName: string;
    canonicalPayeeId?: string | null;
    canonicalPayeeName: string;
    confidence: number;
    source: 'user_approved' | 'high_confidence_ai' | 'fuzzy_match';
  }): void {
    const normalized = PayeeMatchCacheRepository.normalizePayeeName(entry.rawPayeeName);

    this.db.execute(`
      INSERT INTO payee_match_cache 
        (budget_id, raw_payee_name, raw_payee_name_original, canonical_payee_id, canonical_payee_name, confidence, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(budget_id, raw_payee_name) DO UPDATE SET
        canonical_payee_id = excluded.canonical_payee_id,
        canonical_payee_name = excluded.canonical_payee_name,
        confidence = excluded.confidence,
        source = excluded.source,
        updated_at = datetime('now')
    `, [
      entry.budgetId,
      normalized,
      entry.rawPayeeName,
      entry.canonicalPayeeId || null,
      entry.canonicalPayeeName,
      entry.confidence,
      entry.source,
    ]);

    logger.debug('Payee match cache saved', { 
      rawPayeeName: entry.rawPayeeName, 
      canonicalPayeeName: entry.canonicalPayeeName,
      source: entry.source 
    });
  }

  /**
   * Bulk save multiple entries
   */
  saveBatch(entries: Array<{
    budgetId: string;
    rawPayeeName: string;
    canonicalPayeeId?: string | null;
    canonicalPayeeName: string;
    confidence: number;
    source: 'user_approved' | 'high_confidence_ai' | 'fuzzy_match';
  }>): void {
    for (const entry of entries) {
      this.save(entry);
    }

    logger.debug('Payee match cache batch saved', { count: entries.length });
  }

  /**
   * Get all cached payee matches for a budget
   * Used for building fuzzy match candidate pool
   */
  getAllCachedPayeeMatches(budgetId: string): PayeeMatchCacheEntry[] {
    const rows = this.db.query<PayeeMatchCacheRow>(
      `SELECT * FROM payee_match_cache WHERE budget_id = ? ORDER BY hit_count DESC`,
      [budgetId]
    );

    const entries = rows.map(row => this.mapRowToEntry(row));
    logger.debug('Retrieved all cached payee matches', { budgetId, count: entries.length });
    return entries;
  }

  /**
   * Get cache statistics
   */
  getStats(budgetId: string): { totalEntries: number; totalHits: number } {
    const row = this.db.queryOne<{ totalEntries: number; totalHits: number }>(
      `SELECT COUNT(*) as totalEntries, COALESCE(SUM(hit_count), 0) as totalHits FROM payee_match_cache WHERE budget_id = ?`,
      [budgetId]
    );

    return row || { totalEntries: 0, totalHits: 0 };
  }

  /**
   * Clear cache for a budget
   */
  clearBudgetCache(budgetId: string): void {
    this.db.execute(
      `DELETE FROM payee_match_cache WHERE budget_id = ?`,
      [budgetId]
    );

    logger.info('Payee match cache cleared', { budgetId });
  }
}
