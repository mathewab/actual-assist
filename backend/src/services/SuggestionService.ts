import type { OpenAIAdapter } from '../infra/OpenAIAdapter.js';
import type { SuggestionRepository } from '../infra/repositories/SuggestionRepository.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { Transaction, Category } from '../domain/entities/BudgetSnapshot.js';
import { createSuggestion, type Suggestion } from '../domain/entities/Suggestion.js';
import { logger } from '../infra/logger.js';

/**
 * SuggestionService - generates AI category suggestions
 * P1 (Single Responsibility): Focused on suggestion generation
 * P3 (Testability): Dependencies injected for easy mocking
 */
export class SuggestionService {
  constructor(
    private actualBudget: ActualBudgetAdapter,
    private openai: OpenAIAdapter,
    private suggestionRepo: SuggestionRepository,
    private auditRepo: AuditRepository
  ) {}

  /**
   * Generate suggestions for uncategorized transactions
   * P4 (Explicitness): Returns array of Suggestion entities
   */
  async generateSuggestions(budgetId: string): Promise<Suggestion[]> {
    logger.info('Generating suggestions', { budgetId });

    // Fetch current budget state from Actual
    const [transactions, categories] = await Promise.all([
      this.actualBudget.getTransactions(),
      this.actualBudget.getCategories(),
    ]);

    // Filter uncategorized transactions
    const uncategorized = transactions.filter(
      (txn) => txn.categoryId === null
    );

    if (uncategorized.length === 0) {
      logger.info('No uncategorized transactions found');
      return [];
    }

    logger.info(`Found ${uncategorized.length} uncategorized transactions`);

    // Generate suggestions for each transaction
    const suggestions: Suggestion[] = [];
    
    for (const transaction of uncategorized) {
      try {
        const suggestion = await this.generateSuggestionForTransaction(
          budgetId,
          transaction,
          transactions,
          categories
        );
        
        // Save to database
        this.suggestionRepo.save(suggestion);
        suggestions.push(suggestion);
      } catch (error) {
        logger.error('Failed to generate suggestion for transaction', {
          transactionId: transaction.id,
          error,
        });
        // Continue with next transaction instead of failing entire batch
      }
    }

    // Log audit event
    this.auditRepo.log({
      eventType: 'suggestions_generated',
      entityType: 'BudgetSnapshot',
      entityId: budgetId,
      metadata: {
        suggestionsCount: suggestions.length,
        uncategorizedCount: uncategorized.length,
      },
    });

    logger.info('Suggestions generated', {
      count: suggestions.length,
      budgetId,
    });

    return suggestions;
  }

  /**
   * Generate suggestion for a single transaction
   * P2 (Zero duplication): Single place for suggestion logic
   */
  private async generateSuggestionForTransaction(
    budgetId: string,
    transaction: Transaction,
    allTransactions: Transaction[],
    categories: Category[]
  ): Promise<Suggestion> {
    // Get recent transactions from same payee for context
    const recentTransactions = allTransactions
      .filter((txn) => txn.payeeId === transaction.payeeId && txn.id !== transaction.id)
      .slice(0, 10);

    // Call OpenAI for suggestion
    const aiResult = await this.openai.suggestCategory(
      transaction,
      categories,
      recentTransactions
    );

    // Create suggestion entity
    return createSuggestion({
      budgetId,
      transactionId: transaction.id,
      transactionPayee: transaction.payeeName,
      transactionAmount: transaction.amount,
      transactionDate: transaction.date,
      currentCategoryId: transaction.categoryId,
      proposedCategoryId: aiResult.categoryId || 'unknown',
      proposedCategoryName: aiResult.categoryName || 'Unknown',
      confidence: aiResult.confidence,
      rationale: aiResult.reasoning,
    });
  }

  /**
   * Get all suggestions for a budget
   */
  getSuggestionsByBudgetId(budgetId: string): Suggestion[] {
    return this.suggestionRepo.findByBudgetId(budgetId);
  }

  /**
   * Get pending suggestions
   */
  getPendingSuggestions(): Suggestion[] {
    return this.suggestionRepo.findByStatus('pending');
  }

  /**
   * Approve a suggestion
   * P7 (Explicit error handling): Throws NotFoundError if suggestion doesn't exist
   */
  approveSuggestion(suggestionId: string): void {
    this.suggestionRepo.updateStatus(suggestionId, 'approved');

    this.auditRepo.log({
      eventType: 'suggestion_approved',
      entityType: 'Suggestion',
      entityId: suggestionId,
    });

    logger.info('Suggestion approved', { suggestionId });
  }

  /**
   * Reject a suggestion
   */
  rejectSuggestion(suggestionId: string): void {
    this.suggestionRepo.updateStatus(suggestionId, 'rejected');

    this.auditRepo.log({
      eventType: 'suggestion_rejected',
      entityType: 'Suggestion',
      entityId: suggestionId,
    });

    logger.info('Suggestion rejected', { suggestionId });
  }

  /**
   * Sync with Actual Budget and generate suggestions for changed transactions only
   * T068: Diff-based generation - only processes new/changed uncategorized transactions
   * P9 (Minimalism): Process only what changed, not entire budget
   */
  async syncAndGenerateSuggestions(
    budgetId: string,
    fullSnapshot = false
  ): Promise<Suggestion[]> {
    logger.info('Syncing and generating suggestions', { budgetId, fullSnapshot });

    // Sync latest data from Actual Budget server
    await this.actualBudget.sync();

    // If full snapshot mode (e.g., after redownload), use full generation
    if (fullSnapshot) {
      logger.info('Full snapshot mode enabled, generating all suggestions');
      return this.generateSuggestions(budgetId);
    }

    // Fetch current budget state
    const [transactions, categories] = await Promise.all([
      this.actualBudget.getTransactions(),
      this.actualBudget.getCategories(),
    ]);

    // Get existing suggestions to determine which transactions already have suggestions
    const existingSuggestions = this.suggestionRepo.findByBudgetId(budgetId);
    const existingTransactionIds = new Set(
      existingSuggestions.map((s) => s.transactionId)
    );

    // Filter to only new uncategorized transactions without suggestions
    const uncategorized = transactions.filter(
      (txn) => txn.categoryId === null && !existingTransactionIds.has(txn.id)
    );

    if (uncategorized.length === 0) {
      logger.info('No new uncategorized transactions found');
      return [];
    }

    logger.info(`Found ${uncategorized.length} new uncategorized transactions`);

    // Generate suggestions only for new transactions
    const suggestions: Suggestion[] = [];

    for (const transaction of uncategorized) {
      try {
        const suggestion = await this.generateSuggestionForTransaction(
          budgetId,
          transaction,
          transactions,
          categories
        );

        this.suggestionRepo.save(suggestion);
        suggestions.push(suggestion);
      } catch (error) {
        logger.error('Failed to generate suggestion for transaction', {
          transactionId: transaction.id,
          error,
        });
      }
    }

    // Log audit event
    this.auditRepo.log({
      eventType: 'suggestions_generated_diff',
      entityType: 'BudgetSnapshot',
      entityId: budgetId,
      metadata: {
        suggestionsCount: suggestions.length,
        newUncategorizedCount: uncategorized.length,
        mode: 'diff',
      },
    });

    logger.info('Diff-based suggestions generated', {
      count: suggestions.length,
      budgetId,
    });

    return suggestions;
  }
}
