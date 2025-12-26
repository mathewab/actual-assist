import { Router } from 'express';
import type { JobOrchestrator } from '../services/JobOrchestrator.js';
import type { Request, Response, NextFunction } from 'express';

/**
 * Snapshot route handler
 * P5 (Separation of concerns): HTTP layer delegates to service layer
 */
export function createSnapshotRouter(jobOrchestrator: JobOrchestrator): Router {
  const router = Router();

  /**
   * POST /api/snapshots - Create a new budget snapshot
   * T072: Create/download snapshot
   */
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId } = req.body;

      const result = jobOrchestrator.startSnapshotCreateJob(budgetId);
      res.status(201).json({ job: result.job, steps: [] });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/snapshots/redownload - Force redownload budget snapshot
   * T073: Force redownload and respond with fresh snapshot
   */
  router.post('/redownload', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId } = req.body;

      const result = jobOrchestrator.startSnapshotRedownloadJob(budgetId);
      res.status(201).json({ job: result.job, steps: [] });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
