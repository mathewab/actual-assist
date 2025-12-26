import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { JobService } from '../services/JobService.js';
import type { JobOrchestrator } from '../services/JobOrchestrator.js';
import type { Job } from '../domain/entities/Job.js';
import type { JobStep } from '../domain/entities/JobStep.js';
import { ValidationError } from '../domain/errors.js';

function mapJobToResponse(job: Job) {
  return {
    id: job.id,
    budgetId: job.budgetId,
    type: job.type,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failureReason: job.failureReason,
    parentJobId: job.parentJobId,
    metadata: job.metadata,
  };
}

function mapStepToResponse(step: JobStep) {
  return {
    id: step.id,
    jobId: step.jobId,
    stepType: step.stepType,
    status: step.status,
    position: step.position,
    createdAt: step.createdAt,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    failureReason: step.failureReason,
  };
}

/**
 * Jobs route handler
 * P5 (Separation of concerns): HTTP layer delegates to services
 */
export function createJobRouter(jobService: JobService, jobOrchestrator: JobOrchestrator): Router {
  const router = Router();

  /**
   * GET /api/jobs?budgetId=xxx&status=...&type=...&limit=...
   */
  router.get('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId, status, type, limit } = req.query;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId query parameter is required');
      }

      const parsedLimit = limit ? Number(limit) : undefined;
      const jobs = jobService.listJobs({
        budgetId,
        status: typeof status === 'string' ? (status as Job['status']) : undefined,
        type: typeof type === 'string' ? (type as Job['type']) : undefined,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      });

      res.json({ jobs: jobs.map(mapJobToResponse) });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/jobs/:jobId
   */
  router.get('/:jobId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const job = jobService.getJob(jobId);
      const steps = jobService.listJobSteps(jobId);
      res.json({ job: mapJobToResponse(job), steps: steps.map(mapStepToResponse) });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/jobs/sync
   */
  router.post('/sync', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId } = req.body;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId is required in request body');
      }

      const result = jobOrchestrator.startSyncJob(budgetId);
      res.status(201).json({ job: mapJobToResponse(result.job), steps: [] });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/jobs/suggestions
   */
  router.post('/suggestions', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId } = req.body;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId is required in request body');
      }

      const result = jobOrchestrator.startSuggestionsJob(budgetId);
      res.status(201).json({ job: mapJobToResponse(result.job), steps: [] });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/jobs/sync-and-generate
   */
  router.post('/sync-and-generate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId, fullResync } = req.body;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId is required in request body');
      }

      const result = jobOrchestrator.startSyncAndGenerateJob({
        budgetId,
        fullResync: fullResync === true,
      });
      res.status(201).json({
        job: mapJobToResponse(result.job),
        steps: result.steps.map(mapStepToResponse),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
