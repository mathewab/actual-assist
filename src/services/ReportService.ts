import { createHash, randomUUID } from 'node:crypto';
import {
  calculateReport,
  monthRange,
  validateCurrency,
  ReportError,
  type ReportCapture,
  type SavedReport,
} from '../domain/reports/Report.js';
import type { ReportRepository } from '../infra/repositories/ReportRepository.js';
import type { ReportFileStore } from '../infra/reports/ReportFileStore.js';
import { localNarrative, renderReportPdf } from '../infra/reports/ReportPdfRenderer.js';
import type { JobService } from './JobService.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import { SerialQueue } from '../infra/SerialQueue.js';
export interface GenerateReport {
  month: string;
  currency: string;
  requestKey: string;
  supersedesId?: string;
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export class ReportService {
  private queue = new SerialQueue();
  private pending = 0;
  private stopping = false;
  constructor(
    private budgetId: string,
    private capture: (month: string) => Promise<ReportCapture>,
    private repo: ReportRepository,
    private files: ReportFileStore,
    private jobs: JobService,
    private audit: AuditRepository,
    private render = renderReportPdf
  ) {}
  async recover(): Promise<void> {
    for (const status of ['queued', 'running'] as const) {
      for (const job of this.jobs.listJobs({
        budgetId: this.budgetId,
        type: 'report_generate',
        status,
        limit: 10000,
      })) {
        this.jobs.markJobFailedIfActive(job.id, 'REPORT_INTERRUPTED');
      }
    }
    await this.files.cleanupOrphans((id) => this.repo.hasFile(id));
  }
  list(limit: number, offset: number) {
    return this.repo.list(this.budgetId, limit, offset);
  }
  get(id: string) {
    const report = this.repo.get(this.budgetId, id);
    if (!report) throw new ReportError('NOT_FOUND', 404);
    return report;
  }
  async pdf(id: string): Promise<Buffer> {
    const report = this.get(id);
    let bytes: Buffer;
    try {
      bytes = await this.files.read(id);
    } catch {
      throw new ReportError('REPORT_FILE_UNAVAILABLE', 503);
    }
    if (hash(bytes) !== report.pdfHash) throw new ReportError('REPORT_FILE_CORRUPT', 503);
    this.audit.log({ eventType: 'report_downloaded', entityType: 'report', entityId: id });
    return bytes;
  }
  async generate(input: GenerateReport): Promise<SavedReport> {
    monthRange(input.month);
    validateCurrency(input.currency);
    if (this.stopping || this.pending >= 4) throw new ReportError('REPORT_BUSY', 503);
    this.pending++;
    try {
      return await this.queue.run(() => this.generateOne(input));
    } finally {
      this.pending--;
    }
  }
  stop() {
    this.stopping = true;
  }
  drain() {
    return this.queue.close(async () => undefined);
  }
  private async generateOne(input: GenerateReport): Promise<SavedReport> {
    const request = JSON.stringify({
      month: input.month,
      currency: input.currency,
      supersedesId: input.supersedesId ?? null,
    });
    const prior = this.repo.byKey(this.budgetId, input.requestKey);
    if (prior) {
      if (prior.request !== request) throw new ReportError('IDEMPOTENCY_CONFLICT', 409);
      return prior.report;
    }
    if (input.supersedesId && this.get(input.supersedesId).month !== input.month)
      throw new ReportError('INVALID_PREDECESSOR', 400);
    const id = randomUUID();
    const job = this.jobs.createJob({
      budgetId: this.budgetId,
      type: 'report_generate',
      metadata: { reportId: id },
    });
    this.jobs.markJobRunning(job.id);
    this.audit.log({
      eventType: 'report_started',
      entityType: 'report',
      entityId: id,
      metadata: { jobId: job.id },
    });
    let saved = false;
    try {
      const capture = await this.capture(input.month);
      const facts = calculateReport(capture, input.month, input.currency);
      const version = this.repo.nextVersion(this.budgetId, input.month);
      const narrative = localNarrative(facts);
      const bytes = await this.render(facts, version, narrative);
      if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || bytes.length > 10 * 1024 * 1024)
        throw new ReportError('INVALID_PDF');
      const report: SavedReport = {
        rendererVersion: 1,
        id,
        budgetId: this.budgetId,
        month: input.month,
        version,
        createdAt: new Date().toISOString(),
        jobId: job.id,
        supersedesId: input.supersedesId ?? null,
        sourceHash: hash(
          JSON.stringify({ accounts: capture.accounts, categories: capture.categories })
        ),
        pdfHash: hash(bytes),
        facts,
        narrative,
      };
      await this.files.save(id, bytes);
      if (this.jobs.getJob(job.id).status !== 'running')
        throw new ReportError('REPORT_JOB_INACTIVE');
      this.repo.save(report, input.requestKey, request);
      saved = true;
      this.jobs.markJobSucceeded(job.id);
      this.audit.log({
        eventType: 'report_saved',
        entityType: 'report',
        entityId: id,
        metadata: { jobId: job.id, version, bytes: bytes.length },
      });
      return report;
    } catch (error) {
      if (!saved) await this.files.remove(id);
      const code = error instanceof ReportError ? error.code : 'REPORT_GENERATION_FAILED';
      this.jobs.markJobFailedIfActive(job.id, code);
      this.audit.log({
        eventType: 'report_failed',
        entityType: 'report',
        entityId: id,
        metadata: { jobId: job.id, code },
      });
      throw new ReportError(code, 503);
    }
  }
}
