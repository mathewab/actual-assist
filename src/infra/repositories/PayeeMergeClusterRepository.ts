import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import type {
  PayeeMergeCluster,
  PayeeMergeClusterPayee,
} from '../../domain/entities/PayeeMergeCluster.js';
import { logger } from '../logger.js';

type PayeeMergeClusterRow = {
  id: string;
  cluster_id: string;
  group_hash: string;
  budget_id: string;
  payee_id: string;
  payee_name: string;
  normalized_name: string;
  token_set: string;
  created_at: string;
};

export class PayeeMergeClusterRepository {
  constructor(private db: DatabaseAdapter) {}

  listByBudgetId(budgetId: string): PayeeMergeCluster[] {
    const sql = `
      SELECT * FROM payee_merge_clusters
      WHERE budget_id = ?
      ORDER BY cluster_id ASC
    `;
    const rows = this.db.query<PayeeMergeClusterRow>(sql, [budgetId]);
    const clusters = new Map<string, PayeeMergeCluster>();

    for (const row of rows) {
      const existing = clusters.get(row.cluster_id);
      const payee: PayeeMergeClusterPayee = {
        id: row.payee_id,
        name: row.payee_name,
        normalizedName: row.normalized_name,
        tokenSet: row.token_set,
      };

      if (existing) {
        existing.payees.push(payee);
        if (row.created_at > existing.createdAt) {
          existing.createdAt = row.created_at;
        }
      } else {
        clusters.set(row.cluster_id, {
          clusterId: row.cluster_id,
          groupHash: row.group_hash || '',
          budgetId: row.budget_id,
          payees: [payee],
          createdAt: row.created_at,
        });
      }
    }

    return Array.from(clusters.values()).map((cluster) => ({
      ...cluster,
      groupHash: cluster.groupHash || '',
      payees: [...cluster.payees].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }

  replaceForBudget(budgetId: string, clusters: PayeeMergeCluster[]): void {
    this.db.transaction(() => {
      this.db.execute(`DELETE FROM payee_merge_clusters WHERE budget_id = ?`, [budgetId]);

      const insertSql = `
        INSERT INTO payee_merge_clusters (
          id, cluster_id, group_hash, budget_id, payee_id, payee_name,
          normalized_name, token_set, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const cluster of clusters) {
        for (const payee of cluster.payees) {
          this.db.execute(insertSql, [
            `${cluster.clusterId}:${payee.id}`,
            cluster.clusterId,
            cluster.groupHash,
            cluster.budgetId,
            payee.id,
            payee.name,
            payee.normalizedName,
            payee.tokenSet,
            cluster.createdAt,
          ]);
        }
      }
    });

    logger.info('Payee merge clusters cached', { budgetId, count: clusters.length });
  }

  clearByBudgetId(budgetId: string): void {
    this.db.execute(`DELETE FROM payee_merge_clusters WHERE budget_id = ?`, [budgetId]);
    logger.info('Payee merge clusters cleared', { budgetId });
  }
}
