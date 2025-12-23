import { Router } from 'express';
import type { SuggestionService } from '../services/SuggestionService.js';
import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../domain/errors.js';

/**
 * Map suggestion to API response format
 */
function mapSuggestionToResponse(s: any) {
  return {
    id: s.id,
    budgetId: s.budgetId,
    transactionId: s.transactionId,
    transactionAccountId: s.transactionAccountId,
    transactionAccountName: s.transactionAccountName,
    transactionPayee: s.transactionPayee,
    transactionAmount: s.transactionAmount,
    transactionDate: s.transactionDate,
    currentCategoryId: s.currentCategoryId,
    currentPayeeId: s.currentPayeeId,
    
    // Payee suggestion
    payeeSuggestion: {
      proposedPayeeId: s.payeeSuggestion?.proposedPayeeId ?? null,
      proposedPayeeName: s.payeeSuggestion?.proposedPayeeName ?? s.suggestedPayeeName ?? null,
      confidence: s.payeeSuggestion?.confidence ?? 0,
      rationale: s.payeeSuggestion?.rationale ?? '',
      status: s.payeeSuggestion?.status ?? 'skipped',
    },
    
    // Category suggestion
    categorySuggestion: {
      proposedCategoryId: s.categorySuggestion?.proposedCategoryId ?? s.proposedCategoryId,
      proposedCategoryName: s.categorySuggestion?.proposedCategoryName ?? s.proposedCategoryName,
      confidence: s.categorySuggestion?.confidence ?? s.confidence,
      rationale: s.categorySuggestion?.rationale ?? s.rationale,
      status: s.categorySuggestion?.status ?? 'pending',
    },
    
    // Corrections (if any)
    correction: s.correction ?? {
      correctedPayeeId: null,
      correctedPayeeName: null,
      correctedCategoryId: null,
      correctedCategoryName: null,
    },
    
    // Legacy fields for backward compatibility
    proposedCategoryId: s.proposedCategoryId,
    proposedCategoryName: s.proposedCategoryName,
    suggestedPayeeName: s.suggestedPayeeName,
    confidence: s.confidence,
    rationale: s.rationale,
    status: s.status,
    createdAt: s.createdAt,
  };
}

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
        suggestions: suggestions.map(mapSuggestionToResponse),
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
        suggestions: suggestions.map(mapSuggestionToResponse),
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
        suggestions: suggestions.map(mapSuggestionToResponse),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/suggestions/:id/approve - Approve a suggestion (both payee and category)
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
   * POST /api/suggestions/:id/approve-payee - Approve only payee suggestion
   */
  router.post('/:id/approve-payee', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      suggestionService.approvePayeeSuggestion(id);
      res.json({ success: true, type: 'payee' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/suggestions/:id/approve-category - Approve only category suggestion
   */
  router.post('/:id/approve-category', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      suggestionService.approveCategorySuggestion(id);
      res.json({ success: true, type: 'category' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/suggestions/:id/reject - Reject a suggestion (both payee and category)
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

  /**
   * POST /api/suggestions/:id/reject-payee - Reject payee suggestion with optional correction
   */
  router.post('/:id/reject-payee', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { payeeId, payeeName } = req.body;
      
      const correction = (payeeId || payeeName) 
        ? { payeeId: payeeId as string | undefined, payeeName: payeeName as string | undefined }
        : undefined;
      
      suggestionService.rejectPayeeSuggestion(id, correction);
      res.json({ success: true, type: 'payee', withCorrection: !!correction });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/suggestions/:id/reject-category - Reject category suggestion with optional correction
   */
  router.post('/:id/reject-category', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { categoryId, categoryName } = req.body;
      
      const correction = (categoryId || categoryName)
        ? { categoryId: categoryId as string | undefined, categoryName: categoryName as string | undefined }
        : undefined;
      
      suggestionService.rejectCategorySuggestion(id, correction);
      res.json({ success: true, type: 'category', withCorrection: !!correction });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/suggestions/sync-and-generate - Sync and generate suggestions (diff-based)
   * T074: Calls diff-based generation
   */
  router.post('/sync-and-generate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { budgetId, fullSnapshot } = req.body;

      if (!budgetId || typeof budgetId !== 'string') {
        throw new ValidationError('budgetId is required in request body');
      }

      const suggestions = await suggestionService.syncAndGenerateSuggestions(
        budgetId,
        fullSnapshot === true
      );

      res.json({
        suggestions: suggestions.map(mapSuggestionToResponse),
        total: suggestions.length,
        mode: fullSnapshot ? 'full' : 'diff',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/suggestions/bulk-approve - Bulk approve multiple suggestions
   */
  router.post('/bulk-approve', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { suggestionIds } = req.body;

      if (!Array.isArray(suggestionIds) || suggestionIds.length === 0) {
        throw new ValidationError('suggestionIds array is required');
      }

      let approved = 0;
      for (const id of suggestionIds) {
        try {
          suggestionService.approveSuggestion(id);
          approved++;
        } catch {
          // Skip suggestions that can't be approved (e.g., not found)
        }
      }

      res.json({ approved });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/suggestions/bulk-reject - Bulk reject multiple suggestions
   */
  router.post('/bulk-reject', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { suggestionIds } = req.body;

      if (!Array.isArray(suggestionIds) || suggestionIds.length === 0) {
        throw new ValidationError('suggestionIds array is required');
      }

      let rejected = 0;
      for (const id of suggestionIds) {
        try {
          suggestionService.rejectSuggestion(id);
          rejected++;
        } catch {
          // Skip suggestions that can't be rejected (e.g., not found)
        }
      }

      res.json({ rejected });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
