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
   * POST /api/suggestions/generate - Generate suggestions for uncategorized transactions
   */
  router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId } = req.body;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId is required in request body');
      }

      const suggestions = await suggestionService.generateSuggestions(budgetId);

      res.json({
        suggestions: suggestions.map((s) => ({
          id: s.id,
          budgetId: s.budgetId,
          transactionId: s.transactionId,
          transactionPayee: s.transactionPayee,
          transactionAmount: s.transactionAmount,
          transactionDate: s.transactionDate,
          currentCategoryId: s.currentCategoryId,
          proposedCategoryId: s.proposedCategoryId,
          proposedCategoryName: s.proposedCategoryName,
          confidence: s.confidence,
          rationale: s.rationale,
          status: s.status,
          createdAt: s.createdAt,
        })),
        total: suggestions.length,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/suggestions?budgetId=xxx - Get suggestions by budget
   */
  router.get('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId } = req.query;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId query parameter is required');
      }

      const suggestions = suggestionService.getSuggestionsByBudgetId(budgetId);

      res.json({
        suggestions: suggestions.map((s) => ({
          id: s.id,
          budgetId: s.budgetId,
          transactionId: s.transactionId,
          transactionPayee: s.transactionPayee,
          transactionAmount: s.transactionAmount,
          transactionDate: s.transactionDate,
          currentCategoryId: s.currentCategoryId,
          proposedCategoryId: s.proposedCategoryId,
          proposedCategoryName: s.proposedCategoryName,
          confidence: s.confidence,
          rationale: s.rationale,
          status: s.status,
          createdAt: s.createdAt,
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
          budgetId: s.budgetId,
          transactionId: s.transactionId,
          transactionPayee: s.transactionPayee,
          transactionAmount: s.transactionAmount,
          transactionDate: s.transactionDate,
          currentCategoryId: s.currentCategoryId,
          proposedCategoryId: s.proposedCategoryId,
          proposedCategoryName: s.proposedCategoryName,
          confidence: s.confidence,
          rationale: s.rationale,
          status: s.status,
          createdAt: s.createdAt,
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
