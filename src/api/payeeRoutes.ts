import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../domain/errors.js';
import type { PayeeMergeService } from '../services/PayeeMergeService.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { JobService } from '../services/JobService.js';

export function createPayeeRouter(deps: {
  payeeMergeService: PayeeMergeService;
  auditRepo: AuditRepository;
  jobService: JobService;
  defaultBudgetId: string | null;
}): Router {
  const { payeeMergeService, auditRepo, jobService, defaultBudgetId } = deps;
  const router = Router();

  /**
   * GET /api/payees/merge-suggestions
   */
  router.get('/merge-suggestions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { minScore, budgetId } = req.query;

      const resolvedBudgetId =
        typeof budgetId === 'string' && budgetId.length > 0 ? budgetId : defaultBudgetId;
      if (!resolvedBudgetId) {
        throw new ValidationError('budgetId query parameter is required');
      }

      if (minScore !== undefined) {
        const parsedMinScore =
          typeof minScore === 'string' && minScore.length > 0 ? Number(minScore) : undefined;
        if (parsedMinScore !== undefined && (Number.isNaN(parsedMinScore) || parsedMinScore < 0)) {
          throw new ValidationError('minScore must be a number >= 0');
        }
      }

      const result = await payeeMergeService.getCachedClusters({
        budgetId: resolvedBudgetId,
      });

      res.json({ clusters: result.clusters, cache: result.cache });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/payees/merge-clusters/hide
   */
  router.post('/merge-clusters/hide', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId, groupHash } = req.body;
      const resolvedBudgetId =
        typeof budgetId === 'string' && budgetId.length > 0 ? budgetId : defaultBudgetId;
      if (!resolvedBudgetId) {
        throw new ValidationError('budgetId is required');
      }
      if (!groupHash || typeof groupHash !== 'string') {
        throw new ValidationError('groupHash is required');
      }

      payeeMergeService.hideCluster({ budgetId: resolvedBudgetId, groupHash });
      res.json({ hidden: true, groupHash });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/payees/merge-clusters/unhide
   */
  router.post('/merge-clusters/unhide', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId, groupHash } = req.body;
      const resolvedBudgetId =
        typeof budgetId === 'string' && budgetId.length > 0 ? budgetId : defaultBudgetId;
      if (!resolvedBudgetId) {
        throw new ValidationError('budgetId is required');
      }
      if (!groupHash || typeof groupHash !== 'string') {
        throw new ValidationError('groupHash is required');
      }

      payeeMergeService.unhideCluster({ budgetId: resolvedBudgetId, groupHash });
      res.json({ hidden: false, groupHash });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/payees/merge
   */
  router.post('/merge', async (req: Request, res: Response, next: NextFunction) => {
    let jobId: string | null = null;
    try {
      const { targetPayeeId, mergePayeeIds, budgetId } = req.body;

      if (!targetPayeeId || typeof targetPayeeId !== 'string') {
        throw new ValidationError('targetPayeeId is required');
      }
      if (!Array.isArray(mergePayeeIds) || mergePayeeIds.length === 0) {
        throw new ValidationError('mergePayeeIds must be a non-empty array');
      }
      const invalidId = mergePayeeIds.find((id) => typeof id !== 'string' || id.length === 0);
      if (invalidId) {
        throw new ValidationError('mergePayeeIds must be an array of strings');
      }
      if (mergePayeeIds.includes(targetPayeeId)) {
        throw new ValidationError('mergePayeeIds must not include targetPayeeId');
      }

      const resolvedBudgetId =
        typeof budgetId === 'string' && budgetId.length > 0 ? budgetId : defaultBudgetId;
      if (!resolvedBudgetId) {
        throw new ValidationError('budgetId is required');
      }

      const uniqueMergeIds = Array.from(new Set(mergePayeeIds));

      const job = jobService.createJob({
        budgetId: resolvedBudgetId,
        type: 'payees_merge',
        metadata: { targetPayeeId, mergePayeeIds: uniqueMergeIds },
      });
      jobId = job.id;
      jobService.markJobRunning(job.id);

      await payeeMergeService.mergePayees(targetPayeeId, uniqueMergeIds);
      await payeeMergeService.sync();
      payeeMergeService.clearCachedSuggestions(resolvedBudgetId);

      auditRepo.log({
        eventType: 'payees_merged',
        entityType: 'Payee',
        entityId: targetPayeeId,
        metadata: {
          budgetId: resolvedBudgetId,
          mergePayeeIds: uniqueMergeIds,
          mergeCount: uniqueMergeIds.length,
          synced: true,
        },
      });

      jobService.markJobSucceeded(job.id);

      res.json({
        merged: {
          targetPayeeId,
          mergePayeeIds: uniqueMergeIds,
          mergeCount: uniqueMergeIds.length,
        },
        job: jobService.getJob(job.id),
      });
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
          eventType: 'payees_merge_failed',
          entityType: 'Payee',
          entityId:
            typeof req.body?.targetPayeeId === 'string' ? req.body.targetPayeeId : 'unknown',
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
