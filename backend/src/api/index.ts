import { Router } from 'express';
import { createSnapshotRouter } from './snapshotRoutes.js';
import { createSuggestionRouter } from './suggestionRoutes.js';
import { createSyncRouter } from './syncRoutes.js';
import { createAuditRouter } from './auditRoutes.js';
import { createBudgetRouter } from './budgetRoutes.js';
import type { SnapshotService } from '../services/SnapshotService.js';
import type { SuggestionService } from '../services/SuggestionService.js';
import type { SyncService } from '../services/SyncService.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';

/**
 * Main API router - composes all route handlers
 * P1 (Modularity): Each route group in separate file
 * P6 (Dependency discipline): Dependencies injected from server.ts
 */
export function createApiRouter(deps: {
  snapshotService: SnapshotService;
  suggestionService: SuggestionService;
  syncService: SyncService;
  auditRepo: AuditRepository;
  actualBudget: ActualBudgetAdapter;
}): Router {
  const router = Router();

  // Mount sub-routers
  router.use('/budgets', createBudgetRouter(deps.actualBudget));
  router.use('/snapshots', createSnapshotRouter(deps.snapshotService));
  router.use('/suggestions', createSuggestionRouter(deps.suggestionService));
  router.use('/sync', createSyncRouter(deps.syncService));
  router.use('/audit', createAuditRouter(deps.auditRepo));

  return router;
}
