import cron, { type ScheduledTask } from 'node-cron';
import { createHash } from 'node:crypto';
import type { ReportService } from '../services/ReportService.js';
import { logger } from '../infra/logger.js';
export function previousReportMonth(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')!.value),
    month = Number(parts.find((p) => p.type === 'month')!.value);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}
export function scheduledReportKey(budgetId: string, month: string): string {
  const h = createHash('sha256').update(`monthly-report-v1:${budgetId}:${month}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export class ReportScheduler {
  private task: ScheduledTask | null = null;
  constructor(
    private service: Pick<ReportService, 'generate'>,
    private options: {
      enabled: boolean;
      day: number;
      hour: number;
      timezone: string;
      currency: string;
      budgetId: string;
    }
  ) {}
  async run(now = new Date()): Promise<void> {
    if (!this.options.enabled) return;
    const month = previousReportMonth(now, this.options.timezone);
    await this.service.generate({
      month,
      trigger: 'scheduled',
      currency: this.options.currency,
      requestKey: scheduledReportKey(this.options.budgetId, month),
    });
  }
  start() {
    if (!this.options.enabled || this.task) return;
    this.task = cron.schedule(
      `0 ${this.options.hour} ${this.options.day} * *`,
      () => this.run().catch(() => logger.error('Monthly report schedule failed')),
      { timezone: this.options.timezone, noOverlap: true }
    );
  }
  stop() {
    this.task?.stop();
    this.task?.destroy();
    this.task = null;
  }
}
