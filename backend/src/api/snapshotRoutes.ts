import { Router } from 'express';
import type { SnapshotService } from '../services/SnapshotService.js';
import type { Request, Response, NextFunction } from 'express';

/**
 * Snapshot route handler
 * P5 (Separation of concerns): HTTP layer delegates to service layer
 */
export function createSnapshotRouter(snapshotService: SnapshotService): Router {
  const router = Router();

  /**
   * POST /api/snapshots - Create a new budget snapshot
   */
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId } = req.body;

      const snapshot = await snapshotService.createSnapshot(budgetId);

      res.status(201).json({
        budgetId: snapshot.budgetId,
        filepath: snapshot.filepath,
        downloadedAt: snapshot.downloadedAt,
        transactionCount: snapshot.transactionCount,
        categoryCount: snapshot.categoryCount,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
