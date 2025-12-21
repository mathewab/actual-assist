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
      const { budgetId, syncId } = req.body;

      const snapshot = await snapshotService.createSnapshot(budgetId, syncId || null);

      res.status(201).json({
        id: snapshot.id,
        budgetId: snapshot.budgetId,
        syncId: snapshot.syncId,
        transactionCount: snapshot.transactions.length,
        categoryCount: snapshot.categories.length,
        createdAt: snapshot.createdAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
