import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import type { Job, JobStatus, JobType } from '../../domain/entities/Job.js';
import { logger } from '../logger.js';

type JobRow = {
  id: string;
  budget_id: string;
  type: JobType;
  status: JobStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  parent_job_id: string | null;
  metadata: string | null;
};

export class JobRepository {
  constructor(private db: DatabaseAdapter) {}

  create(job: Job): void {
    const sql = `
      INSERT INTO jobs (
        id, budget_id, type, status, created_at, started_at, completed_at, failure_reason, parent_job_id, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.execute(sql, [
      job.id,
      job.budgetId,
      job.type,
      job.status,
      job.createdAt.toISOString(),
      job.startedAt ? job.startedAt.toISOString() : null,
      job.completedAt ? job.completedAt.toISOString() : null,
      job.failureReason,
      job.parentJobId,
      job.metadata ? JSON.stringify(job.metadata) : null,
    ]);

    logger.debug('Job created', { jobId: job.id, type: job.type, status: job.status });
  }

  updateStatus(params: {
    jobId: string;
    status: JobStatus;
    startedAt?: Date | null;
    completedAt?: Date | null;
    failureReason?: string | null;
  }): void {
    const sql = `
      UPDATE jobs
      SET status = ?, started_at = ?, completed_at = ?, failure_reason = ?
      WHERE id = ?
    `;

    this.db.execute(sql, [
      params.status,
      params.startedAt ? params.startedAt.toISOString() : null,
      params.completedAt ? params.completedAt.toISOString() : null,
      params.failureReason ?? null,
      params.jobId,
    ]);

    logger.debug('Job status updated', { jobId: params.jobId, status: params.status });
  }

  updateMetadata(jobId: string, metadata: Record<string, unknown> | null): void {
    const sql = `
      UPDATE jobs
      SET metadata = ?
      WHERE id = ?
    `;

    this.db.execute(sql, [metadata ? JSON.stringify(metadata) : null, jobId]);
  }

  getById(jobId: string): Job | null {
    const sql = `
      SELECT * FROM jobs
      WHERE id = ?
    `;

    const row = this.db.queryOne<JobRow>(sql, [jobId]);
    return row ? this.mapRowToJob(row) : null;
  }

  listByBudget(params: {
    budgetId: string;
    type?: JobType;
    status?: JobStatus;
    limit?: number;
  }): Job[] {
    const conditions: string[] = ['budget_id = ?'];
    const values: unknown[] = [params.budgetId];

    if (params.type) {
      conditions.push('type = ?');
      values.push(params.type);
    }

    if (params.status) {
      conditions.push('status = ?');
      values.push(params.status);
    }

    const limit = Math.min(params.limit ?? 20, 100);

    const sql = `
      SELECT * FROM jobs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const rows = this.db.query<JobRow>(sql, [...values, limit]);
    return rows.map((row) => this.mapRowToJob(row));
  }

  listIdsOlderThan(cutoff: Date): string[] {
    const sql = `
      SELECT id FROM jobs
      WHERE created_at < ?
    `;
    const rows = this.db.query<{ id: string }>(sql, [cutoff.toISOString()]);
    return rows.map((row) => row.id);
  }

  listTimedOutJobs(cutoff: Date): Job[] {
    const sql = `
      SELECT * FROM jobs
      WHERE (status = 'running' AND started_at IS NOT NULL AND started_at < ?)
         OR (status = 'queued' AND created_at < ?)
      ORDER BY created_at ASC
    `;

    const rows = this.db.query<JobRow>(sql, [cutoff.toISOString(), cutoff.toISOString()]);
    return rows.map((row) => this.mapRowToJob(row));
  }

  deleteByIds(jobIds: string[]): void {
    if (jobIds.length === 0) return;
    const placeholders = jobIds.map(() => '?').join(', ');
    const sql = `DELETE FROM jobs WHERE id IN (${placeholders})`;
    this.db.execute(sql, jobIds);
  }

  private mapRowToJob(row: JobRow): Job {
    return {
      id: row.id,
      budgetId: row.budget_id,
      type: row.type,
      status: row.status,
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      failureReason: row.failure_reason,
      parentJobId: row.parent_job_id,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    };
  }
}
