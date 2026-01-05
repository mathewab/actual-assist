import { Router } from 'express';
import { createSnapshotRouter } from './snapshotRoutes.js';
import { createSuggestionRouter } from './suggestionRoutes.js';
import { createSyncRouter } from './syncRoutes.js';
import { createAuditRouter } from './auditRoutes.js';
import { createBudgetRouter } from './budgetRoutes.js';
import { createJobRouter } from './jobRoutes.js';
import { createJobEventsRouter } from './jobEventsRoutes.js';
import { createPayeeRouter } from './payeeRoutes.js';
import { createConfigRouter } from './configRoutes.js';
import type { SuggestionService } from '../services/SuggestionService.js';
import type { SyncService } from '../services/SyncService.js';
import type { JobService } from '../services/JobService.js';
import type { JobOrchestrator } from '../services/JobOrchestrator.js';
import type { JobEventBus } from '../services/JobEventBus.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { PayeeMergeService } from '../services/PayeeMergeService.js';
import type { LLMConfigService } from '../services/LLMConfigService.js';

/**
 * Main API router - composes all route handlers
 * P1 (Modularity): Each route group in separate file
 * P6 (Dependency discipline): Dependencies injected from server.ts
 */
export function createApiRouter(deps: {
  suggestionService: SuggestionService;
  syncService: SyncService;
  jobService: JobService;
  jobOrchestrator: JobOrchestrator;
  jobEventBus: JobEventBus;
  auditRepo: AuditRepository;
  actualBudget: ActualBudgetAdapter;
  payeeMergeService: PayeeMergeService;
  defaultBudgetId: string | null;
  llmConfigService: LLMConfigService;
}): Router {
  const router = Router();

  // Mount sub-routers
  router.use(
    '/budgets',
    createBudgetRouter({
      actualBudget: deps.actualBudget,
      auditRepo: deps.auditRepo,
      jobService: deps.jobService,
      defaultBudgetId: deps.defaultBudgetId,
    })
  );
  router.use('/snapshots', createSnapshotRouter(deps.jobOrchestrator));
  router.use('/suggestions', createSuggestionRouter(deps.suggestionService, deps.jobOrchestrator));
  router.use('/sync', createSyncRouter(deps.syncService, deps.jobOrchestrator));
  router.use('/jobs', createJobRouter(deps.jobService, deps.jobOrchestrator));
  router.use('/job-events', createJobEventsRouter(deps.jobEventBus));
  router.use(
    '/payees',
    createPayeeRouter({
      payeeMergeService: deps.payeeMergeService,
      auditRepo: deps.auditRepo,
      jobService: deps.jobService,
      defaultBudgetId: deps.defaultBudgetId,
    })
  );
  router.use('/audit', createAuditRouter(deps.auditRepo));
  router.use('/config', createConfigRouter({ llmConfigService: deps.llmConfigService }));

  return router;
}
