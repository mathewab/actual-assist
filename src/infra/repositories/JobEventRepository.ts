import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import type { JobEvent, JobEventStatus } from '../../domain/entities/JobEvent.js';
import { createJobEvent } from '../../domain/entities/JobEvent.js';
import { logger } from '../logger.js';

type JobEventRow = {
  id: string;
  job_id: string;
  job_step_id: string | null;
  status: JobEventStatus;
  message: string | null;
  created_at: string;
};

export class JobEventRepository {
  constructor(private db: DatabaseAdapter) {}

  record(params: {
    id: string;
    jobId: string;
    jobStepId?: string | null;
    status: JobEventStatus;
    message?: string | null;
  }): void {
    const event = createJobEvent({
      id: params.id,
      jobId: params.jobId,
      jobStepId: params.jobStepId,
      status: params.status,
      message: params.message,
    });

    const sql = `
      INSERT INTO job_events (id, job_id, job_step_id, status, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    this.db.execute(sql, [
      event.id,
      event.jobId,
      event.jobStepId,
      event.status,
      event.message,
      event.createdAt.toISOString(),
    ]);

    logger.debug('Job event recorded', { jobId: event.jobId, status: event.status });
  }

  listByJob(jobId: string): JobEvent[] {
    const sql = `
      SELECT * FROM job_events
      WHERE job_id = ?
      ORDER BY created_at ASC
    `;

    const rows = this.db.query<JobEventRow>(sql, [jobId]);
    return rows.map((row) => this.mapRowToJobEvent(row));
  }

  deleteByJobIds(jobIds: string[]): void {
    if (jobIds.length === 0) return;
    const placeholders = jobIds.map(() => '?').join(', ');
    const sql = `DELETE FROM job_events WHERE job_id IN (${placeholders})`;
    this.db.execute(sql, jobIds);
  }

  private mapRowToJobEvent(row: JobEventRow): JobEvent {
    return {
      id: row.id,
      jobId: row.job_id,
      jobStepId: row.job_step_id,
      status: row.status,
      message: row.message,
      createdAt: new Date(row.created_at),
    };
  }
}
