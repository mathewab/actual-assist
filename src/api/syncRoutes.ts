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
   * GET /api/sync/pending - Get all approved suggestions ready to apply
   */
  router.get('/pending', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId } = req.query;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId query parameter is required');
      }

      const changes = syncService.getApprovedChanges(budgetId);
      res.json({ changes });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/sync/apply - Apply specific suggestion IDs
   */
  router.post('/apply', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId, suggestionIds } = req.body;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId is required in request body');
      }

      if (!Array.isArray(suggestionIds) || suggestionIds.length === 0) {
        throw new ValidationError('suggestionIds array is required');
      }

      const result = await syncService.applySpecificSuggestions(budgetId, suggestionIds);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
