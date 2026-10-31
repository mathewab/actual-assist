import { analyzeReport } from '../domain/reports/ReportAnalysis.js';
import { ReportNarrativeService } from './ReportNarrativeService.js';
import type { ReportDeliveryService } from './ReportDeliveryService.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  monthRange,
  addMinorUnits,
  validateCurrency,
  ReportError,
  type ReportCapture,
  type SavedReport,
} from '../domain/reports/Report.js';
import type { ReportRepository } from '../infra/repositories/ReportRepository.js';
import type { ReportFileStore } from '../infra/reports/ReportFileStore.js';
import { renderReportPdf } from '../infra/reports/ReportPdfRenderer.js';
import type { JobService } from './JobService.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import { SerialQueue } from '../infra/SerialQueue.js';
export interface GenerateReport {
  month: string;
  currency: string;
  requestKey: string;
  supersedesId?: string;
  trigger?: 'manual' | 'scheduled';
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
    private render = renderReportPdf,
    private options: { narrative?: ReportNarrativeService; delivery?: ReportDeliveryService } = {}
  ) {}
  async recover(): Promise<void> {
    this.options.delivery?.recover();
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
  detail(id: string) {
    const report = this.get(id);
    return {
      ...report,
      ...(report.analysis ? { analysis: { ...report.analysis, evidence: [] } } : {}),
      deliveryStatus: this.options.delivery?.status(id) ?? 'disabled',
    };
  }
  async notify(id: string, retry = false) {
    this.get(id);
    await this.pdf(id, false); // Never advertise a missing/corrupt artifact.
    return this.options.delivery?.notify(id, retry) ?? 'disabled';
  }
  explore(id: string) {
    const report = this.get(id);
    if (!report.analysis) throw new ReportError('DETAIL_UNAVAILABLE', 409);
    const merchants = new Map<string, { id: string; name: string; net: number; count: number }>();
    for (const row of report.analysis.evidence.filter(
      (e) => e.month === report.month && e.role === 'spending'
    )) {
      const key = row.payeeId ?? 'unknown';
      const item = merchants.get(key) ?? { id: key, name: row.payeeName, net: 0, count: 0 };
      item.net = addMinorUnits(item.net, -row.amount);
      item.count++;
      merchants.set(key, item);
    }
    return {
      observations: report.analysis.observations,
      history: report.analysis.history,
      observedStart: report.analysis.observedStart,
      observedEnd: report.analysis.observedEnd,
      merchants: [...merchants.values()],
    };
  }
  transactions(
    id: string,
    query: {
      limit: number;
      offset: number;
      observationId?: string;
      categoryId?: string;
      payeeId?: string;
      month?: string;
    }
  ) {
    const report = this.get(id);
    if (!report.analysis) throw new ReportError('DETAIL_UNAVAILABLE', 409);
    let rows = report.analysis.evidence;
    if (query.observationId) {
      const observation = report.analysis.observations.find((o) => o.id === query.observationId);
      if (!observation) throw new ReportError('NOT_FOUND', 404);
      const ids = new Set(observation.evidenceIds);
      rows = rows.filter((e) => ids.has(e.id));
    } else rows = rows.filter((e) => e.month === (query.month ?? report.month));
    if (query.categoryId)
      rows = rows.filter(
        (e) => e.role === 'spending' && (e.categoryId ?? 'uncategorized') === query.categoryId
      );
    if (query.payeeId)
      rows = rows.filter(
        (e) => e.role === 'spending' && (e.payeeId ?? 'unknown') === query.payeeId
      );
    rows = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const spendingRows = rows.filter((e) => e.role === 'spending');
    const gross = spendingRows
      .filter((e) => e.amount < 0)
      .reduce((sum, e) => sum - BigInt(e.amount), 0n);
    const refunds = spendingRows
      .filter((e) => e.amount > 0)
      .reduce((sum, e) => sum + BigInt(e.amount), 0n);
    if (!Number.isSafeInteger(Number(gross)) || !Number.isSafeInteger(Number(refunds)))
      throw new ReportError('AMOUNT_OVERFLOW');
    const periodTotals = [...new Set(spendingRows.map((e) => e.month))].sort().map((month) => ({
      month,
      netSpending: Number(
        spendingRows.filter((e) => e.month === month).reduce((sum, e) => sum - BigInt(e.amount), 0n)
      ),
    }));
    if (periodTotals.some((p) => !Number.isSafeInteger(p.netSpending)))
      throw new ReportError('AMOUNT_OVERFLOW');
    const total = gross - refunds;
    if (!Number.isSafeInteger(Number(total))) throw new ReportError('AMOUNT_OVERFLOW');
    this.audit.log({
      eventType: 'report_evidence_read',
      entityType: 'report',
      entityId: id,
      metadata: { count: Math.min(rows.length, query.limit) },
    });
    return {
      rows: rows.slice(query.offset, query.offset + query.limit),
      total: rows.length,
      netSpending: Number(total),
      grossSpending: Number(gross),
      refunds: Number(refunds),
      periodTotals,
    };
  }
  async pdf(id: string, auditRead = true): Promise<Buffer> {
    const report = this.get(id);
    let bytes: Buffer;
    try {
      bytes = await this.files.read(id);
    } catch {
      throw new ReportError('REPORT_FILE_UNAVAILABLE', 503);
    }
    if (hash(bytes) !== report.pdfHash) throw new ReportError('REPORT_FILE_CORRUPT', 503);
    if (auditRead)
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
      metadata: { reportId: id, trigger: input.trigger ?? 'manual' },
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
      const { facts, analysis } = analyzeReport(capture, input.month, input.currency);
      const version = this.repo.nextVersion(this.budgetId, input.month);
      const summary = await (this.options.narrative ?? new ReportNarrativeService()).summarize(
        facts,
        analysis.observations
      );
      const narrative = summary.text;
      const bytes = await this.render(facts, version, narrative, {
        observations: analysis.observations,
        source: summary.source,
      });
      if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || bytes.length > 10 * 1024 * 1024)
        throw new ReportError('INVALID_PDF');
      const report: SavedReport = {
        rendererVersion: 2,
        analysis,
        narrativeSource: summary.source,
        id,
        budgetId: this.budgetId,
        month: input.month,
        version,
        createdAt: new Date().toISOString(),
        jobId: job.id,
        supersedesId: input.supersedesId ?? null,
        sourceHash: hash(
          JSON.stringify({
            accounts: capture.accounts,
            categories: capture.categories,
            payees: capture.payees,
          })
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
      // Delivery failures must never invalidate an already saved report.
      try {
        await this.options.delivery?.notify(id);
      } catch {
        /* Delivery state/audit is separate. */
      }
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
      throw new ReportError(code, error instanceof ReportError ? error.status : 503);
    }
  }
}
