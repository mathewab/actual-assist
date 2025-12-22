import { Router } from 'express';
import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { Request, Response, NextFunction } from 'express';

/**
 * Budget route handler
 * T071: GET /api/budgets - list available budgets
 * P5 (Separation of concerns): HTTP layer delegates to adapter
 */
export function createBudgetRouter(actualBudget: ActualBudgetAdapter): Router {
  const router = Router();

  /**
   * GET /api/budgets - List all available budgets
   */
  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const budgets = await actualBudget.listBudgets();

      res.json({
        budgets: budgets.map((b) => ({
          id: b.id,
          name: b.name,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
