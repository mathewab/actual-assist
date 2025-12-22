import { Router } from 'express';
import type { SyncService } from '../services/SyncService.js';
import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../domain/errors.js';

/**
 * Sync route handler
 * P5 (Separation of concerns): HTTP layer delegates to service layer
 */
export function createSyncRouter(syncService: SyncService): Router {
  const router = Router();

  /**
   * POST /api/sync/plan - Create a sync plan from approved suggestions
   */
  router.post('/plan', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId } = req.body;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId is required in request body');
      }

      const syncPlan = syncService.createSyncPlan(budgetId);

      res.status(201).json({
        id: syncPlan.id,
        budgetId: syncPlan.budgetId,
        changes: syncPlan.changes,
        dryRunSummary: syncPlan.dryRunSummary,
        createdAt: syncPlan.createdAt,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/sync/execute - Execute a sync plan
   */
  router.post('/execute', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId } = req.body;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId is required in request body');
      }

      // Create sync plan
      const syncPlan = syncService.createSyncPlan(budgetId);

      // Execute it
      await syncService.executeSyncPlan(syncPlan);

      res.json({
        success: true,
        planId: syncPlan.id,
        changesApplied: syncPlan.changes.length,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
