import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import type { JobStep, JobStepStatus, JobStepType } from '../../domain/entities/JobStep.js';
import { logger } from '../logger.js';

type JobStepRow = {
  id: string;
  job_id: string;
  step_type: JobStepType;
  status: JobStepStatus;
  position: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
};

export class JobStepRepository {
  constructor(private db: DatabaseAdapter) {}

  create(step: JobStep): void {
    const sql = `
      INSERT INTO job_steps (
        id, job_id, step_type, status, position, created_at, started_at, completed_at, failure_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.execute(sql, [
      step.id,
      step.jobId,
      step.stepType,
      step.status,
      step.position,
      step.createdAt.toISOString(),
      step.startedAt ? step.startedAt.toISOString() : null,
      step.completedAt ? step.completedAt.toISOString() : null,
      step.failureReason,
    ]);

    logger.debug('Job step created', {
      stepId: step.id,
      jobId: step.jobId,
      position: step.position,
    });
  }

  updateStatus(params: {
    stepId: string;
    status: JobStepStatus;
    startedAt?: Date | null;
    completedAt?: Date | null;
    failureReason?: string | null;
  }): void {
    const sql = `
      UPDATE job_steps
      SET status = ?, started_at = ?, completed_at = ?, failure_reason = ?
      WHERE id = ?
    `;

    this.db.execute(sql, [
      params.status,
      params.startedAt ? params.startedAt.toISOString() : null,
      params.completedAt ? params.completedAt.toISOString() : null,
      params.failureReason ?? null,
      params.stepId,
    ]);

    logger.debug('Job step status updated', { stepId: params.stepId, status: params.status });
  }

  listByJob(jobId: string): JobStep[] {
    const sql = `
      SELECT * FROM job_steps
      WHERE job_id = ?
      ORDER BY position ASC
    `;

    const rows = this.db.query<JobStepRow>(sql, [jobId]);
    return rows.map((row) => this.mapRowToJobStep(row));
  }

  deleteByJobIds(jobIds: string[]): void {
    if (jobIds.length === 0) return;
    const placeholders = jobIds.map(() => '?').join(', ');
    const sql = `DELETE FROM job_steps WHERE job_id IN (${placeholders})`;
    this.db.execute(sql, jobIds);
  }

  getById(stepId: string): JobStep | null {
    const sql = `
      SELECT * FROM job_steps
      WHERE id = ?
    `;

    const row = this.db.queryOne<JobStepRow>(sql, [stepId]);
    return row ? this.mapRowToJobStep(row) : null;
  }

  private mapRowToJobStep(row: JobStepRow): JobStep {
    return {
      id: row.id,
      jobId: row.job_id,
      stepType: row.step_type,
      status: row.status,
      position: row.position,
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      failureReason: row.failure_reason,
    };
  }
}
