import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import { logger } from '../logger.js';

type PayeeMergePayeeSnapshotRow = {
  budget_id: string;
  payee_id: string;
  payee_name: string;
};

export class PayeeMergePayeeSnapshotRepository {
  constructor(private db: DatabaseAdapter) {}

  listByBudgetId(budgetId: string): Array<{ payeeId: string; payeeName: string }> {
    const rows = this.db.query<PayeeMergePayeeSnapshotRow>(
      `SELECT budget_id, payee_id, payee_name FROM payee_merge_payee_snapshot WHERE budget_id = ?`,
      [budgetId]
    );

    return rows.map((row) => ({
      payeeId: row.payee_id,
      payeeName: row.payee_name,
    }));
  }

  replaceForBudget(budgetId: string, payees: Array<{ id: string; name: string }>): void {
    this.db.transaction(() => {
      this.db.execute(`DELETE FROM payee_merge_payee_snapshot WHERE budget_id = ?`, [budgetId]);
      for (const payee of payees) {
        this.db.execute(
          `INSERT INTO payee_merge_payee_snapshot (budget_id, payee_id, payee_name)
           VALUES (?, ?, ?)`,
          [budgetId, payee.id, payee.name]
        );
      }
    });

    logger.info('Payee merge payee snapshot saved', {
      budgetId,
      count: payees.length,
    });
  }

  clearByBudgetId(budgetId: string): void {
    this.db.execute(`DELETE FROM payee_merge_payee_snapshot WHERE budget_id = ?`, [budgetId]);
    logger.info('Payee merge payee snapshot cleared', { budgetId });
  }
}
