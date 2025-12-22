import type { OpenAIAdapter } from '../infra/OpenAIAdapter.js';
import type { SuggestionRepository } from '../infra/repositories/SuggestionRepository.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { PayeeCacheRepository } from '../infra/repositories/PayeeCacheRepository.js';
import type { Transaction, Category } from '../domain/entities/BudgetSnapshot.js';
import { createSuggestion, type Suggestion } from '../domain/entities/Suggestion.js';
import { logger } from '../infra/logger.js';

/** Threshold for caching high-confidence AI suggestions */
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

/** Result of category suggestion for a payee */
interface PayeeCategorySuggestion {
  payeeName: string;
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
  reasoning: string;
}

/**
 * SuggestionService - generates AI category suggestions
 * P1 (Single Responsibility): Focused on suggestion generation
 * P3 (Testability): Dependencies injected for easy mocking
 * 
 * Optimizations:
 * - Groups uncategorized transactions by payee before LLM call
 * - Uses payee→category cache to avoid redundant LLM calls
 * - Caches high-confidence results and user-approved mappings
 */
export class SuggestionService {
  constructor(
    private actualBudget: ActualBudgetAdapter,
    private openai: OpenAIAdapter,
    private suggestionRepo: SuggestionRepository,
    private auditRepo: AuditRepository,
    private payeeCache?: PayeeCacheRepository // Optional for backward compatibility
  ) {}

  /**
   * Generate suggestions for uncategorized transactions
   * Optimized: Groups by payee and uses cache
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

    // Group transactions by payee for batch processing
    const byPayee = this.groupByPayee(uncategorized);
    const uniquePayees = Array.from(byPayee.keys());

    logger.info(`Grouped into ${uniquePayees.length} unique payees`);

    // Check cache for known payee→category mappings
    const { cached, uncached } = await this.checkPayeeCache(budgetId, uniquePayees);

    logger.info(`Cache lookup: ${cached.size} hits, ${uncached.length} misses`);

    // Generate suggestions from cache hits (no LLM call needed)
    const suggestions: Suggestion[] = [];
    
    for (const [payeeName, cacheEntry] of cached) {
      const txns = byPayee.get(payeeName) || [];
      for (const txn of txns) {
        const suggestion = createSuggestion({
          budgetId,
          transactionId: txn.id,
          transactionPayee: txn.payeeName,
          transactionAmount: txn.amount,
          transactionDate: txn.date,
          currentCategoryId: txn.categoryId,
          proposedCategoryId: cacheEntry.categoryId,
          proposedCategoryName: cacheEntry.categoryName,
          confidence: cacheEntry.confidence,
          rationale: `Cached: ${cacheEntry.source === 'user_approved' ? 'Previously approved by user' : 'High-confidence AI suggestion'}`,
        });
        this.suggestionRepo.save(suggestion);
        suggestions.push(suggestion);
      }
    }

    // Call LLM only for uncached payees
    if (uncached.length > 0) {
      const aiSuggestions = await this.generateBatchSuggestions(
        budgetId,
        uncached,
        byPayee,
        categories
      );
      suggestions.push(...aiSuggestions);
    }

    // Log audit event
    this.auditRepo.log({
      eventType: 'suggestions_generated',
      entityType: 'BudgetSnapshot',
      entityId: budgetId,
      metadata: {
        suggestionsCount: suggestions.length,
        uncategorizedCount: uncategorized.length,
        cacheHits: cached.size,
        llmCalls: uncached.length > 0 ? 1 : 0,
      },
    });

    logger.info('Suggestions generated', {
      count: suggestions.length,
      cacheHits: cached.size,
      llmPayees: uncached.length,
      budgetId,
    });

    return suggestions;
  }

  /**
   * Group transactions by normalized payee name
   * Uses fuzzy matching via normalization
   */
  private groupByPayee(transactions: Transaction[]): Map<string, Transaction[]> {
    const groups = new Map<string, Transaction[]>();
    
    for (const txn of transactions) {
      const payee = txn.payeeName || 'Unknown';
      const existing = groups.get(payee) || [];
      existing.push(txn);
      groups.set(payee, existing);
    }

    return groups;
  }

  /**
   * Check payee cache and split into cached/uncached payees
   */
  private async checkPayeeCache(
    budgetId: string,
    payeeNames: string[]
  ): Promise<{
    cached: Map<string, { categoryId: string; categoryName: string; confidence: number; source: string }>;
    uncached: string[];
  }> {
    const cached = new Map<string, { categoryId: string; categoryName: string; confidence: number; source: string }>();
    const uncached: string[] = [];

    if (!this.payeeCache) {
      // No cache configured, all payees need LLM
      return { cached, uncached: payeeNames };
    }

    const cacheEntries = this.payeeCache.findByPayees(budgetId, payeeNames);
    
    for (const payeeName of payeeNames) {
      const normalized = payeeName.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
      const entry = cacheEntries.get(normalized);
      
      if (entry) {
        cached.set(payeeName, {
          categoryId: entry.categoryId,
          categoryName: entry.categoryName,
          confidence: entry.confidence,
          source: entry.source,
        });
      } else {
        uncached.push(payeeName);
      }
    }

    return { cached, uncached };
  }

  /**
   * Build prompt for batch category suggestion
   * Only includes essential info: payee names and category list
   * No dates, amounts, or notes to minimize tokens and protect privacy
   */
  private buildCategoryPrompt(payeeNames: string[], categories: Category[]): string {
    // Compact category list: just name and group
    const categoryList = categories
      .filter(cat => !cat.hidden && !cat.isIncome)
      .map(cat => `${cat.id}|${cat.name}|${cat.groupName}`)
      .join('\n');

    const payeeList = payeeNames.join('\n');

    return `Categorize these transaction payees for a personal budget.

Payees:
${payeeList}

Categories (id|name|group):
${categoryList}

For each payee:
1. Use web search to identify what business/merchant it is
2. Match to the most appropriate category from the list
3. If uncertain, set categoryId and categoryName to null

Respond with JSON array:
[{"payeeName":"...","categoryId":"...","categoryName":"...","confidence":0.0-1.0,"reasoning":"..."}]`;
  }

  /**
   * Parse LLM response into PayeeCategorySuggestion array
   */
  private parseCategoryResponse(content: string): PayeeCategorySuggestion[] {
    // Handle markdown code blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || 
                      content.match(/```\s*([\s\S]*?)```/) ||
                      [null, content];
    const jsonStr = jsonMatch[1]?.trim() || content.trim();
    
    const result = JSON.parse(jsonStr);
    const suggestions: unknown[] = Array.isArray(result) ? result : result.suggestions || [];

    return suggestions.map((s: unknown) => {
      const item = s as { payeeName?: string; payee?: string; categoryId?: string | null; categoryName?: string | null; confidence?: number; reasoning?: string };
      return {
        payeeName: item.payeeName || item.payee || '',
        categoryId: item.categoryId || null,
        categoryName: item.categoryName || null,
        confidence: item.confidence ?? 0.5,
        reasoning: item.reasoning || 'No reasoning provided',
      };
    });
  }

  /**
   * Generate suggestions for multiple payees in a single LLM call
   */
  private async generateBatchSuggestions(
    budgetId: string,
    payeeNames: string[],
    transactionsByPayee: Map<string, Transaction[]>,
    categories: Category[]
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    try {
      // Build prompt for category suggestions
      const prompt = this.buildCategoryPrompt(payeeNames, categories);
      
      // Single LLM call with web search for merchant identification
      const responseContent = await this.openai.webSearchCompletion({ prompt });
      
      // Parse response into structured suggestions
      const aiResults = this.parseCategoryResponse(responseContent);

      logger.debug('AI category suggestions received', {
        payeeCount: payeeNames.length,
        suggestionsCount: aiResults.length,
      });

      // Create lookup map from AI results
      const resultsByPayee = new Map<string, PayeeCategorySuggestion>();
      for (const result of aiResults) {
        resultsByPayee.set(result.payeeName, result);
      }

      // Cache high-confidence results for future use
      const toCache: Array<{
        budgetId: string;
        payeeName: string;
        categoryId: string;
        categoryName: string;
        confidence: number;
        source: 'user_approved' | 'high_confidence_ai';
      }> = [];

      // Create suggestions for each transaction
      for (const payeeName of payeeNames) {
        const result = resultsByPayee.get(payeeName);
        const txns = transactionsByPayee.get(payeeName) || [];

        for (const txn of txns) {
          const suggestion = createSuggestion({
            budgetId,
            transactionId: txn.id,
            transactionPayee: txn.payeeName,
            transactionAmount: txn.amount,
            transactionDate: txn.date,
            currentCategoryId: txn.categoryId,
            proposedCategoryId: result?.categoryId || 'unknown',
            proposedCategoryName: result?.categoryName || 'Unknown',
            confidence: result?.confidence || 0,
            rationale: result?.reasoning || 'No AI response for this payee',
          });
          this.suggestionRepo.save(suggestion);
          suggestions.push(suggestion);
        }

        // Cache high-confidence results
        if (result && result.categoryId && result.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
          toCache.push({
            budgetId,
            payeeName,
            categoryId: result.categoryId,
            categoryName: result.categoryName || 'Unknown',
            confidence: result.confidence,
            source: 'high_confidence_ai',
          });
        }
      }

      // Batch save to cache
      if (this.payeeCache && toCache.length > 0) {
        this.payeeCache.saveBatch(toCache);
        logger.info('Cached high-confidence suggestions', { count: toCache.length });
      }

    } catch (error) {
      logger.error('Failed to generate batch suggestions', { error, payeeNames });
      // Create unknown suggestions for all transactions on failure
      for (const payeeName of payeeNames) {
        const txns = transactionsByPayee.get(payeeName) || [];
        for (const txn of txns) {
          const suggestion = createSuggestion({
            budgetId,
            transactionId: txn.id,
            transactionPayee: txn.payeeName,
            transactionAmount: txn.amount,
            transactionDate: txn.date,
            currentCategoryId: txn.categoryId,
            proposedCategoryId: 'unknown',
            proposedCategoryName: 'Unknown',
            confidence: 0,
            rationale: 'LLM call failed',
          });
          this.suggestionRepo.save(suggestion);
          suggestions.push(suggestion);
        }
      }
    }

    return suggestions;
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
   * Approve a suggestion and cache the payee→category mapping
   * P7 (Explicit error handling): Throws NotFoundError if suggestion doesn't exist
   */
  approveSuggestion(suggestionId: string): void {
    // Get the suggestion to cache its payee→category mapping
    const suggestion = this.suggestionRepo.findById(suggestionId);
    
    this.suggestionRepo.updateStatus(suggestionId, 'approved');

    // Cache the user-approved mapping for future use
    if (this.payeeCache && suggestion && suggestion.transactionPayee && suggestion.proposedCategoryId !== 'unknown') {
      this.payeeCache.save({
        budgetId: suggestion.budgetId,
        payeeName: suggestion.transactionPayee,
        categoryId: suggestion.proposedCategoryId,
        categoryName: suggestion.proposedCategoryName,
        confidence: 1.0, // User approval = 100% confidence
        source: 'user_approved',
      });
      logger.debug('Cached user-approved mapping', {
        payee: suggestion.transactionPayee,
        category: suggestion.proposedCategoryName,
      });
    }

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
   * 
   * Optimized: Uses batch LLM calls and payee caching
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

    // Group by payee for batch processing
    const byPayee = this.groupByPayee(uncategorized);
    const uniquePayees = Array.from(byPayee.keys());

    // Check cache for known payees
    const { cached, uncached } = await this.checkPayeeCache(budgetId, uniquePayees);

    logger.info(`Diff sync: ${cached.size} cached, ${uncached.length} need LLM`);

    // Create suggestions from cache
    const suggestions: Suggestion[] = [];
    
    for (const [payeeName, cacheEntry] of cached) {
      const txns = byPayee.get(payeeName) || [];
      for (const txn of txns) {
        const suggestion = createSuggestion({
          budgetId,
          transactionId: txn.id,
          transactionPayee: txn.payeeName,
          transactionAmount: txn.amount,
          transactionDate: txn.date,
          currentCategoryId: txn.categoryId,
          proposedCategoryId: cacheEntry.categoryId,
          proposedCategoryName: cacheEntry.categoryName,
          confidence: cacheEntry.confidence,
          rationale: `Cached: ${cacheEntry.source === 'user_approved' ? 'Previously approved by user' : 'High-confidence AI suggestion'}`,
        });
        this.suggestionRepo.save(suggestion);
        suggestions.push(suggestion);
      }
    }

    // Batch LLM call for uncached payees
    if (uncached.length > 0) {
      const aiSuggestions = await this.generateBatchSuggestions(
        budgetId,
        uncached,
        byPayee,
        categories
      );
      suggestions.push(...aiSuggestions);
    }

    // Log audit event
    this.auditRepo.log({
      eventType: 'suggestions_generated',
      entityType: 'BudgetSnapshot',
      entityId: budgetId,
      metadata: {
        suggestionsCount: suggestions.length,
        newUncategorizedCount: uncategorized.length,
        cacheHits: cached.size,
        llmCalls: uncached.length > 0 ? 1 : 0,
        mode: 'diff',
      },
    });

    logger.info('Diff-based suggestions generated', {
      count: suggestions.length,
      cacheHits: cached.size,
      llmPayees: uncached.length,
      budgetId,
    });

    return suggestions;
  }
}
