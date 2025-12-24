import { Router } from 'express';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { Request, Response, NextFunction } from 'express';

/**
 * Audit route handler
 * P5 (Separation of concerns): HTTP layer delegates to repository
 */
export function createAuditRouter(auditRepo: AuditRepository): Router {
  const router = Router();

  /**
   * GET /api/audit - Get recent audit events
   */
  router.get('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const events = auditRepo.getRecent(limit);

      res.json({
        events: events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          entityType: e.entityType,
          entityId: e.entityId,
          metadata: e.metadata,
          timestamp: e.timestamp.toISOString(),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/audit/:entityType/:entityId - Get audit events for specific entity
   */
  router.get('/:entityType/:entityId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityType, entityId } = req.params;
      const events = auditRepo.getByEntity(entityType, entityId);

      res.json({
        events: events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          entityType: e.entityType,
          entityId: e.entityId,
          metadata: e.metadata,
          timestamp: e.timestamp.toISOString(),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
