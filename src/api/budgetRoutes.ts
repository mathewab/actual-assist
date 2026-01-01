import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { JobService } from '../services/JobService.js';

/**
 * Budget route handler
 * T071: GET /api/budgets - list available budgets
 * P5 (Separation of concerns): HTTP layer delegates to adapter
 */
export function createBudgetRouter(deps: {
  actualBudget: ActualBudgetAdapter;
  auditRepo: AuditRepository;
  jobService: JobService;
  defaultBudgetId: string | null;
}): Router {
  const { actualBudget, auditRepo, jobService, defaultBudgetId } = deps;
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
    let jobId: string | null = null;
    try {
      const { categoryId, note, sync, budgetId } = req.body ?? {};
      if (typeof categoryId !== 'string' || !categoryId) {
        res.status(400).json({ error: 'categoryId is required' });
        return;
      }

      if (note !== null && note !== undefined && typeof note !== 'string') {
        res.status(400).json({ error: 'note must be a string or null' });
        return;
      }

      const resolvedBudgetId =
        typeof budgetId === 'string' && budgetId.length > 0 ? budgetId : defaultBudgetId;

      const job = resolvedBudgetId
        ? jobService.createJob({
            budgetId: resolvedBudgetId,
            type: 'templates_apply',
            metadata: { categoryId, sync: Boolean(sync) },
          })
        : null;

      if (job) {
        jobId = job.id;
        jobService.markJobRunning(job.id);
      }

      const previousNote = await actualBudget.getCategoryNote(categoryId);
      await actualBudget.updateCategoryNote(categoryId, note ?? null);
      const check = await actualBudget.checkTemplates();

      let synced = false;
      let rolledBack = false;

      if (check.pre) {
        await actualBudget.updateCategoryNote(categoryId, previousNote);
        rolledBack = true;
        auditRepo.log({
          eventType: 'templates_apply_rolled_back',
          entityType: 'BudgetTemplates',
          entityId: categoryId,
          metadata: {
            budgetId: resolvedBudgetId,
            message: check.message,
            pre: check.pre,
          },
        });
      } else if (sync) {
        await actualBudget.sync();
        synced = true;
      }

      if (!rolledBack) {
        auditRepo.log({
          eventType: 'templates_applied',
          entityType: 'BudgetTemplates',
          entityId: categoryId,
          metadata: {
            budgetId: resolvedBudgetId,
            synced,
          },
        });
      }

      let responseJob = null;
      if (jobId) {
        if (rolledBack) {
          jobService.markJobFailed(jobId, check.message || 'Template check failed');
        } else {
          jobService.markJobSucceeded(jobId);
        }
        responseJob = jobService.getJob(jobId);
      }

      res.json({ check, synced, rolledBack, job: responseJob });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      if (jobId) {
        try {
          jobService.markJobFailed(jobId, reason);
        } catch {
          // ignore job status update errors
        }
      }
      try {
        auditRepo.log({
          eventType: 'templates_apply_failed',
          entityType: 'BudgetTemplates',
          entityId: typeof req.body?.categoryId === 'string' ? req.body.categoryId : 'unknown',
          metadata: {
            budgetId:
              typeof req.body?.budgetId === 'string' && req.body.budgetId.length > 0
                ? req.body.budgetId
                : defaultBudgetId,
            error: reason,
          },
        });
      } catch {
        // ignore audit logging errors
      }
      next(error);
    }
  });

  return router;
}
