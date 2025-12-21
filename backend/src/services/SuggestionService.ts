import type { OpenAIAdapter } from '../infra/OpenAIAdapter.js';
import type { SuggestionRepository } from '../infra/repositories/SuggestionRepository.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { BudgetSnapshot, Transaction } from '../domain/entities/BudgetSnapshot.js';
import { createSuggestion, type Suggestion } from '../domain/entities/Suggestion.js';
import { logger } from '../infra/logger.js';

/**
 * SuggestionService - generates AI category suggestions
 * P1 (Single Responsibility): Focused on suggestion generation
 * P3 (Testability): Dependencies injected for easy mocking
 */
export class SuggestionService {
  constructor(
    private openai: OpenAIAdapter,
    private suggestionRepo: SuggestionRepository,
    private auditRepo: AuditRepository
  ) {}

  /**
   * Generate suggestions for uncategorized transactions
   * P4 (Explicitness): Returns array of Suggestion entities
   */
  async generateSuggestions(snapshot: BudgetSnapshot): Promise<Suggestion[]> {
    logger.info('Generating suggestions', { snapshotId: snapshot.id });

    // Filter uncategorized transactions
    const uncategorized = snapshot.transactions.filter(
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
          snapshot,
          transaction
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
      entityId: snapshot.id,
      metadata: {
        suggestionsCount: suggestions.length,
        uncategorizedCount: uncategorized.length,
      },
    });

    logger.info('Suggestions generated', {
      count: suggestions.length,
      snapshotId: snapshot.id,
    });

    return suggestions;
  }

  /**
   * Generate suggestion for a single transaction
   * P2 (Zero duplication): Single place for suggestion logic
   */
  private async generateSuggestionForTransaction(
    snapshot: BudgetSnapshot,
    transaction: Transaction
  ): Promise<Suggestion> {
    // Get recent transactions from same payee for context
    const recentTransactions = snapshot.transactions
      .filter((txn) => txn.payeeId === transaction.payeeId && txn.id !== transaction.id)
      .slice(0, 10);

    // Call OpenAI for suggestion
    const aiResult = await this.openai.suggestCategory(
      transaction,
      snapshot.categories,
      recentTransactions
    );

    // Create suggestion entity
    return createSuggestion({
      budgetSnapshotId: snapshot.id,
      transactionId: transaction.id,
      suggestedCategoryId: aiResult.categoryId,
      suggestedCategoryName: aiResult.categoryName,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
    });
  }

  /**
   * Get all suggestions for a snapshot
   */
  getSuggestionsBySnapshot(snapshotId: string): Suggestion[] {
    return this.suggestionRepo.findBySnapshotId(snapshotId);
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
}
