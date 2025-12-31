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

  /**
   * GET /api/budgets/categories - Get all categories from the current budget
   */
  router.get('/categories', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await actualBudget.getCategories();

      res.json({
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          groupName: c.groupName || null,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/budgets/templates - List categories with goal templates
   */
  router.get('/templates', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const templates = await actualBudget.listCategoryTemplates();

      res.json({
        templates: templates.map((template) => ({
          id: template.id,
          name: template.name,
          groupName: template.groupName,
          templates: template.templates,
          renderedNote: template.renderedNote,
          note: template.note,
          source: template.source,
          parseError: template.parseError,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/budgets/schedules - List schedule names for template suggestions
   */
  router.get('/schedules', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const schedules = await actualBudget.getSchedules();

      res.json({
        schedules: schedules.map((schedule) => ({
          id: schedule.id,
          name: schedule.name,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/budgets/templates/render - Render template objects into note lines
   */
  router.post('/templates/render', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { templates } = req.body ?? {};
      if (!Array.isArray(templates)) {
        res.status(400).json({ error: 'templates must be an array' });
        return;
      }

      const rendered = await actualBudget.renderNoteTemplates(templates);
      res.json({ rendered });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/budgets/templates/apply - Update category notes and optionally sync
   */
  router.post('/templates/apply', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { categoryId, note, sync } = req.body ?? {};
      if (typeof categoryId !== 'string' || !categoryId) {
        res.status(400).json({ error: 'categoryId is required' });
        return;
      }

      if (note !== null && note !== undefined && typeof note !== 'string') {
        res.status(400).json({ error: 'note must be a string or null' });
        return;
      }

      const previousNote = await actualBudget.getCategoryNote(categoryId);
      await actualBudget.updateCategoryNote(categoryId, note ?? null);
      const check = await actualBudget.checkTemplates();

      let synced = false;
      let rolledBack = false;

      if (check.pre) {
        await actualBudget.updateCategoryNote(categoryId, previousNote);
        rolledBack = true;
      } else if (sync) {
        await actualBudget.sync();
        synced = true;
      }

      res.json({ check, synced, rolledBack });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
