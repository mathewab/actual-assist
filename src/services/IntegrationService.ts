import { z } from 'zod';
import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { JobService } from './JobService.js';

export const collectionSchema = z.enum([
  'accounts',
  'categories',
  'payees',
  'schedules',
  'transactions',
]);
export type Collection = z.infer<typeof collectionSchema>;
const date = z.iso.date();
export const readInputSchema = z.strictObject({
  accountId: z.string().uuid().optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export class IntegrationError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function integrationError(error: unknown): IntegrationError {
  if (error instanceof IntegrationError) return error;
  if (error instanceof z.ZodError)
    return new IntegrationError('INVALID_ARGUMENT', 400, 'Invalid request parameters');
  return new IntegrationError('UNAVAILABLE', 503, 'Budget service unavailable');
}

type BudgetReader = Pick<
  ActualBudgetAdapter,
  | 'isInitialized'
  | 'getAccounts'
  | 'getCategories'
  | 'getPayees'
  | 'getSchedules'
  | 'getAccountTransactions'
>;
type Jobs = Pick<JobService, 'createJob' | 'markJobRunning' | 'markJobSucceeded' | 'markJobFailed'>;

/** Both transports use this fixed-budget read contract; no imports, writes, or implicit sync. */
export class IntegrationService {
  private stopping = false;
  private active = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private budget: BudgetReader,
    private audit: Pick<AuditRepository, 'log'>,
    private jobs: Jobs,
    private budgetId: string
  ) {}

  isReady(): boolean {
    return !this.stopping && this.budget.isInitialized();
  }
  stop(): void {
    this.stopping = true;
  }

  drain(): Promise<void> {
    if (this.active === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  async read(
    collection: Collection,
    input: unknown,
    transport: 'rest' | 'mcp',
    principalId?: string
  ) {
    const query = readInputSchema.parse(input);
    if (collection === 'transactions') {
      if (
        !query.accountId ||
        !query.startDate ||
        !query.endDate ||
        query.endDate < query.startDate ||
        Date.parse(query.endDate) - Date.parse(query.startDate) > 93 * 86400000
      ) {
        throw new IntegrationError(
          'INVALID_ARGUMENT',
          400,
          'Transactions require accountId and a date range of at most 93 days'
        );
      }
    } else if (query.accountId || query.startDate || query.endDate) {
      throw new IntegrationError(
        'INVALID_ARGUMENT',
        400,
        'Date and account filters are only valid for transactions'
      );
    }
    if (!this.isReady())
      throw new IntegrationError('UNAVAILABLE', 503, 'Budget service unavailable');
    if (this.active >= 16)
      throw new IntegrationError('BUSY', 503, 'Too many pending budget requests');
    this.active++;
    let jobId: string | undefined;
    const started = performance.now();
    try {
      const job = this.jobs.createJob({
        budgetId: this.budgetId,
        type: 'integration_read',
        metadata: { collection, transport, principalId },
      });
      jobId = job.id;
      this.jobs.markJobRunning(job.id);
      let rows: unknown[];
      switch (collection) {
        case 'accounts':
          rows = await this.budget.getAccounts();
          break;
        case 'categories':
          rows = await this.budget.getCategories();
          break;
        case 'payees':
          rows = await this.budget.getPayees();
          break;
        case 'schedules':
          rows = await this.budget.getSchedules();
          break;
        case 'transactions':
          rows = await this.budget.getAccountTransactions(
            query.accountId!,
            query.startDate!,
            query.endDate!
          );
          break;
      }
      const data = rows.slice(query.offset, query.offset + query.limit);
      this.jobs.markJobSucceeded(job.id);
      this.audit.log({
        eventType: 'integration_read',
        entityType: 'Integration',
        entityId: job.id,
        metadata: {
          collection,
          transport,
          principalId,
          count: data.length,
          durationMs: Math.round(performance.now() - started),
        },
      });
      return {
        data,
        pagination: { offset: query.offset, limit: query.limit, total: rows.length },
        jobId: job.id,
      };
    } catch (error) {
      const safe = integrationError(error);
      if (jobId) this.jobs.markJobFailed(jobId, safe.message);
      this.audit.log({
        eventType: 'integration_read_failed',
        entityType: 'Integration',
        entityId: jobId ?? 'unavailable',
        metadata: {
          collection,
          transport,
          principalId,
          code: safe.code,
          durationMs: Math.round(performance.now() - started),
        },
      });
      throw safe;
    } finally {
      this.active--;
      if (this.active === 0) this.idleWaiters.splice(0).forEach((resolve) => resolve());
    }
  }
}
