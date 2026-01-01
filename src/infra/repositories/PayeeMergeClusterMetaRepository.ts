import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import { logger } from '../logger.js';

type PayeeMergeClusterMetaRow = {
  budget_id: string;
  payee_hash: string;
  created_at: string;
};

export class PayeeMergeClusterMetaRepository {
  constructor(private db: DatabaseAdapter) {}

  getByBudgetId(
    budgetId: string
  ): { budgetId: string; payeeHash: string; createdAt: string } | null {
    const row = this.db.queryOne<PayeeMergeClusterMetaRow>(
      `SELECT * FROM payee_merge_cluster_meta WHERE budget_id = ?`,
      [budgetId]
    );
    if (!row) return null;
    return {
      budgetId: row.budget_id,
      payeeHash: row.payee_hash,
      createdAt: row.created_at,
    };
  }

  upsert(params: { budgetId: string; payeeHash: string; createdAt: string }): void {
    const sql = `
      INSERT INTO payee_merge_cluster_meta (budget_id, payee_hash, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(budget_id) DO UPDATE SET
        payee_hash = excluded.payee_hash,
        created_at = excluded.created_at
    `;
    this.db.execute(sql, [params.budgetId, params.payeeHash, params.createdAt]);
    logger.info('Payee merge cluster meta saved', { budgetId: params.budgetId });
  }

  clearByBudgetId(budgetId: string): void {
    this.db.execute(`DELETE FROM payee_merge_cluster_meta WHERE budget_id = ?`, [budgetId]);
    logger.info('Payee merge cluster meta cleared', { budgetId });
  }
}
