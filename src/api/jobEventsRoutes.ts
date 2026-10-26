import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { JobEventBus, JobEventPayload } from '../services/JobEventBus.js';
import { ValidationError } from '../domain/errors.js';
import { mapJobToResponse } from './jobMapper.js';

const HEARTBEAT_MS = 30_000;

export function createJobEventsRouter(jobEventBus: JobEventBus): Router {
  const router = Router();

  router.get('/stream', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (jobEventBus.isStopping()) {
        res.status(503).json({ error: 'UNAVAILABLE' });
        return;
      }
      const { budgetId } = req.query;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId query parameter is required');
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      res.write('event: ready\n');
      res.write('data: {}\n\n');

      const onJob = (payload: JobEventPayload) => {
        if (payload.job.budgetId !== budgetId) return;
        const data = {
          event: payload.event,
          status: payload.status,
          timestamp: payload.timestamp,
          job: mapJobToResponse(payload.job),
        };
        res.write('event: job\n');
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const heartbeat = setInterval(() => {
        res.write(': keep-alive\n\n');
      }, HEARTBEAT_MS);

      jobEventBus.onJob(onJob);

      const cleanup = () => {
        clearInterval(heartbeat);
        jobEventBus.offJob(onJob);
        jobEventBus.offShutdown(onShutdown);
      };
      const onShutdown = () => {
        cleanup();
        res.end();
      };
      jobEventBus.onShutdown(onShutdown);
      req.on('close', cleanup);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
