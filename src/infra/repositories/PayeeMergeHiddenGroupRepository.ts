import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import { logger } from '../logger.js';

type HiddenGroupRow = {
  budget_id: string;
  group_hash: string;
  hidden_at: string;
};

export class PayeeMergeHiddenGroupRepository {
  constructor(private db: DatabaseAdapter) {}

  listByBudgetId(budgetId: string): { groupHash: string; hiddenAt: string }[] {
    const rows = this.db.query<HiddenGroupRow>(
      `SELECT group_hash, hidden_at FROM payee_merge_hidden_groups WHERE budget_id = ?`,
      [budgetId]
    );
    return rows.map((row) => ({ groupHash: row.group_hash, hiddenAt: row.hidden_at }));
  }

  hideGroup(params: { budgetId: string; groupHash: string }): void {
    const sql = `
      INSERT INTO payee_merge_hidden_groups (budget_id, group_hash, hidden_at)
      VALUES (?, ?, ?)
      ON CONFLICT(budget_id, group_hash) DO UPDATE SET
        hidden_at = excluded.hidden_at
    `;
    this.db.execute(sql, [params.budgetId, params.groupHash, new Date().toISOString()]);
    logger.info('Payee merge group hidden', {
      budgetId: params.budgetId,
      groupHash: params.groupHash,
    });
  }

  unhideGroup(params: { budgetId: string; groupHash: string }): void {
    this.db.execute(
      `DELETE FROM payee_merge_hidden_groups WHERE budget_id = ? AND group_hash = ?`,
      [params.budgetId, params.groupHash]
    );
    logger.info('Payee merge group unhidden', {
      budgetId: params.budgetId,
      groupHash: params.groupHash,
    });
  }

  clearByBudgetId(budgetId: string): void {
    this.db.execute(`DELETE FROM payee_merge_hidden_groups WHERE budget_id = ?`, [budgetId]);
    logger.info('Payee merge hidden groups cleared', { budgetId });
  }
}
