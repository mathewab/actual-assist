import type { DatabaseAdapter } from '../infra/DatabaseAdapter.js';
import type { ReportNotificationAdapter } from '../infra/reports/ReportNotificationAdapter.js';
import { NotificationFailure } from '../infra/reports/PushoverTransport.js';
import type { JobService } from './JobService.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
export type DeliveryStatus = 'disabled' | 'not-sent' | 'pending' | 'sent' | 'failed' | 'uncertain';
export class ReportDeliveryService {
  constructor(
    private db: DatabaseAdapter,
    private adapter: ReportNotificationAdapter,
    private origin: string,
    private enabled: boolean,
    private jobs: JobService,
    private audit: AuditRepository,
    private budgetId: string
  ) {}
  status(id: string): DeliveryStatus {
    if (!this.enabled) return 'disabled';
    return (
      this.db.queryOne<{ status: DeliveryStatus }>(
        'SELECT status FROM report_delivery WHERE report_id = ?',
        [id]
      )?.status ?? 'not-sent'
    );
  }
  recover() {
    this.db.execute("UPDATE report_delivery SET status = 'uncertain' WHERE status = 'pending'");
  }
  async notify(id: string, retry = false): Promise<DeliveryStatus> {
    if (!this.enabled) return 'disabled';
    const claimed = this.db.transaction(() => {
      const state = this.status(id);
      if (state === 'not-sent') {
        this.db.execute(
          "INSERT INTO report_delivery (report_id,status,updated_at) VALUES (?,'pending',?)",
          [id, new Date().toISOString()]
        );
        return true;
      }
      if (state === 'failed' && retry) {
        this.db.execute(
          "UPDATE report_delivery SET status='pending', updated_at=? WHERE report_id=?",
          [new Date().toISOString(), id]
        );
        return true;
      }
      return false;
    });
    if (!claimed) return this.status(id);
    let jobId: string | undefined;
    let status: DeliveryStatus;
    try {
      const job = this.jobs.createJob({
        budgetId: this.budgetId,
        type: 'report_notify',
        metadata: { reportId: id },
      });
      jobId = job.id;
      this.jobs.markJobRunning(job.id);
      await this.adapter.notify(id, this.origin);
      status = 'sent';
      this.jobs.markJobSucceeded(job.id);
    } catch (error) {
      status = error instanceof NotificationFailure ? error.outcome : 'uncertain';
      if (jobId) this.jobs.markJobFailedIfActive(jobId, 'NOTIFICATION_UNAVAILABLE');
    }
    this.db.execute('UPDATE report_delivery SET status=?,updated_at=? WHERE report_id=?', [
      status,
      new Date().toISOString(),
      id,
    ]);
    this.audit.log({
      eventType: 'report_notification',
      entityType: 'report',
      entityId: id,
      metadata: { status, jobId },
    });
    return status;
  }
}
