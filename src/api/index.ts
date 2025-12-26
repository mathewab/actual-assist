import { Router } from 'express';
import { createSnapshotRouter } from './snapshotRoutes.js';
import { createSuggestionRouter } from './suggestionRoutes.js';
import { createSyncRouter } from './syncRoutes.js';
import { createAuditRouter } from './auditRoutes.js';
import { createBudgetRouter } from './budgetRoutes.js';
import { createJobRouter } from './jobRoutes.js';
import type { SuggestionService } from '../services/SuggestionService.js';
import type { SyncService } from '../services/SyncService.js';
import type { JobService } from '../services/JobService.js';
import type { JobOrchestrator } from '../services/JobOrchestrator.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';

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
  auditRepo: AuditRepository;
  actualBudget: ActualBudgetAdapter;
}): Router {
  const router = Router();

  // Mount sub-routers
  router.use('/budgets', createBudgetRouter(deps.actualBudget));
  router.use('/snapshots', createSnapshotRouter(deps.jobOrchestrator));
  router.use('/suggestions', createSuggestionRouter(deps.suggestionService, deps.jobOrchestrator));
  router.use('/sync', createSyncRouter(deps.syncService, deps.jobOrchestrator));
  router.use('/jobs', createJobRouter(deps.jobService, deps.jobOrchestrator));
  router.use('/audit', createAuditRouter(deps.auditRepo));

  return router;
}
