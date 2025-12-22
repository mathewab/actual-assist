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
   * T072: Create/download snapshot
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

  /**
   * POST /api/snapshots/redownload - Force redownload budget snapshot
   * T073: Force redownload and respond with fresh snapshot
   */
  router.post('/redownload', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId } = req.body;

      // Force redownload by creating a new snapshot (replaces existing)
      const snapshot = await snapshotService.createSnapshot(budgetId);

      res.json({
        budgetId: snapshot.budgetId,
        filepath: snapshot.filepath,
        downloadedAt: snapshot.downloadedAt,
        transactionCount: snapshot.transactionCount,
        categoryCount: snapshot.categoryCount,
        redownloaded: true,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
