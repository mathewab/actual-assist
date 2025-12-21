import { Router } from 'express';
import type { SuggestionService } from '../services/SuggestionService.js';
import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../domain/errors.js';

/**
 * Suggestion route handler
 * P5 (Separation of concerns): HTTP layer delegates to service layer
 */
export function createSuggestionRouter(suggestionService: SuggestionService): Router {
  const router = Router();

  /**
   * GET /api/suggestions?snapshotId=xxx - Get suggestions by snapshot
   */
  router.get('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { snapshotId } = req.query;

      if (!snapshotId || typeof snapshotId !== 'string') {
        throw new ValidationError('snapshotId query parameter is required');
      }

      const suggestions = suggestionService.getSuggestionsBySnapshot(snapshotId);

      res.json({
        suggestions: suggestions.map((s) => ({
          id: s.id,
          transactionId: s.transactionId,
          suggestedCategoryId: s.suggestedCategoryId,
          suggestedCategoryName: s.suggestedCategoryName,
          confidence: s.confidence,
          reasoning: s.reasoning,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/suggestions/pending - Get all pending suggestions
   */
  router.get('/pending', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const suggestions = suggestionService.getPendingSuggestions();

      res.json({
        suggestions: suggestions.map((s) => ({
          id: s.id,
          transactionId: s.transactionId,
          suggestedCategoryId: s.suggestedCategoryId,
          suggestedCategoryName: s.suggestedCategoryName,
          confidence: s.confidence,
          reasoning: s.reasoning,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/suggestions/:id/approve - Approve a suggestion
   */
  router.post('/:id/approve', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      suggestionService.approveSuggestion(id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/suggestions/:id/reject - Reject a suggestion
   */
  router.post('/:id/reject', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      suggestionService.rejectSuggestion(id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
