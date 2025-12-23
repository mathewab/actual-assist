import { OpenAIAdapter } from '../infra/OpenAIAdapter.js';
import type { SuggestionRepository } from '../infra/repositories/SuggestionRepository.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { PayeeCacheRepository } from '../infra/repositories/PayeeCacheRepository.js';
import type { Transaction, Category } from '../domain/entities/BudgetSnapshot.js';
import { createSuggestion, type Suggestion } from '../domain/entities/Suggestion.js';
import { logger } from '../infra/logger.js';
import {
  payeeMatcher,
  type FuzzyMatchResult,
  type PayeeCandidate,
} from '../infra/PayeeMatcher.js';

/** Threshold for caching high-confidence AI suggestions */
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

/** Result of category suggestion for a payee */
interface PayeeCategorySuggestion {
  payeeName: string;
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
  reasoning: string;
  /** Suggested canonical payee name from fuzzy match or LLM */
  suggestedPayeeName?: string;
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
   * Identify transactions that need an LLM retry because the previous attempt failed
   */
  private getRetryableTransactionIds(suggestions: Suggestion[]): string[] {
    const retryable = suggestions.filter((s) =>
      s.status === 'pending' &&
      (s.proposedCategoryId === 'unknown' || s.confidence === 0 || s.rationale.toLowerCase().includes('llm'))
    );

    return Array.from(new Set(retryable.map((s) => s.transactionId)));
  }

  /**
   * Generate suggestions for uncategorized transactions
   * Optimized: Groups by payee and uses cache
   * P4 (Explicitness): Returns array of Suggestion entities
   * 
   * Deduplication: Skips transactions that already have pending suggestions
   * Cleanup: Removes suggestions for deleted transactions
   */
  async generateSuggestions(budgetId: string): Promise<Suggestion[]> {
    logger.info('Generating suggestions', { budgetId });

    // Get existing suggestions and filter out failed ones so they can be retried
    const existingSuggestions = this.suggestionRepo.findByBudgetId(budgetId);
    const retryableTxIds = this.getRetryableTransactionIds(existingSuggestions);
    if (retryableTxIds.length > 0) {
      logger.info('Found retryable suggestions (will be regenerated)', {
        budgetId,
        retryableTransactions: retryableTxIds.length,
      });
    }

    // Fetch current budget state from Actual
    const [transactions, categories] = await Promise.all([
      this.actualBudget.getTransactions(),
      this.actualBudget.getCategories(),
    ]);

    // Cleanup orphaned suggestions (transactions that no longer exist in budget)
    const validTransactionIds = new Set(transactions.map(t => t.id));
    const cleanedUp = this.suggestionRepo.cleanupOrphanedSuggestions(budgetId, validTransactionIds);
    if (cleanedUp > 0) {
      logger.info('Cleaned up orphaned suggestions for deleted transactions', { count: cleanedUp });
    }

    // Get existing pending suggestion transaction IDs for deduplication
    // (excluding retryable ones which will be regenerated)
    const existingPendingTxIds = this.suggestionRepo.getExistingPendingTransactionIds(budgetId);
    const skipTxIds = new Set(
      [...existingPendingTxIds].filter(id => !retryableTxIds.includes(id))
    );

    logger.info('Deduplication check', {
      existingPendingCount: existingPendingTxIds.size,
      retryableCount: retryableTxIds.length,
      skippingCount: skipTxIds.size,
    });

    // Filter uncategorized transactions, excluding those with existing pending suggestions
    const uncategorized = transactions.filter(
      (txn) => txn.categoryId === null && !txn.isTransfer && !skipTxIds.has(txn.id)
    );

    const transferSkipped = transactions.filter((txn) => txn.isTransfer).length;
    if (transferSkipped > 0) {
      logger.info('Skipped transfer transactions from suggestion generation', { count: transferSkipped });
    }

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
   * Build prompt for single payee category suggestion
   * Simpler prompt = more reliable JSON response
   */
  private buildSinglePayeePrompt(payeeName: string, categories: Category[]): string {
    // Compact category list: just name and group
    const categoryList = categories
      .filter(cat => !cat.hidden && !cat.isIncome)
      .map(cat => `${cat.id}|${cat.name}|${cat.groupName}`)
      .join('\n');

    return `Categorize this transaction payee for a personal budget.

Payee: ${payeeName}

Categories (id|name|group):
${categoryList}

Instructions:
1. Use web search to identify what business/merchant "${payeeName}" is
2. Match to the most appropriate category from the list
3. If uncertain, set categoryId and categoryName to null

Respond with a single JSON object (no markdown, no explanation):
{"categoryId":"...","categoryName":"...","confidence":0.0-1.0,"reasoning":"..."}`;
  }

  /**
   * Parse LLM response for a single payee into PayeeCategorySuggestion
   */
  private parseSinglePayeeResponse(payeeName: string, content: string): PayeeCategorySuggestion {
    try {
      // Use robust parser from OpenAIAdapter (handles code fences + fallbacks)
      const result = OpenAIAdapter.parseJsonResponse<Record<string, unknown>>(content);
      
      return {
        payeeName,
        categoryId: (result.categoryId as string) || null,
        categoryName: (result.categoryName as string) || null,
        confidence: (result.confidence as number) ?? 0.5,
        reasoning: (result.reasoning as string) || 'No reasoning provided',
      };
    } catch (error) {
      logger.warn('Failed to parse single payee response', {
        payeeName,
        error: error instanceof Error ? error.message : String(error),
        contentPreview: content.slice(0, 200),
      });
      return {
        payeeName,
        categoryId: null,
        categoryName: null,
        confidence: 0,
        reasoning: 'Failed to parse LLM response',
      };
    }
  }

  /**
   * Categorize a single payee via LLM
   * Returns null if LLM call fails (caller handles fallback)
   */
  private async categorizePayee(
    payeeName: string,
    categories: Category[]
  ): Promise<PayeeCategorySuggestion> {
    try {
      const prompt = this.buildSinglePayeePrompt(payeeName, categories);

      logger.debug('Calling OpenAI for single payee', { payeeName });

      const responseContent = await this.openai.webSearchCompletion({ prompt });

      logger.info('OpenAI response for payee', {
        payeeName,
        responseLength: responseContent.length,
        response: responseContent,
      });

      return this.parseSinglePayeeResponse(payeeName, responseContent);
    } catch (error) {
      logger.error('LLM call failed for payee', {
        payeeName,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        payeeName,
        categoryId: null,
        categoryName: null,
        confidence: 0,
        reasoning: 'LLM call failed',
      };
    }
  }

  /**
   * Build candidates pool for fuzzy matching from cache and categorized payees
   */
  private async buildFuzzyMatchCandidates(budgetId: string): Promise<PayeeCandidate[]> {
    const candidates: PayeeCandidate[] = [];
    const seenPayees = new Set<string>();

    // Add cached payees (user-approved and high-confidence AI)
    if (this.payeeCache) {
      const cachedPayees = this.payeeCache.getAllCachedPayees(budgetId);
      for (const entry of cachedPayees) {
        const normalized = payeeMatcher.normalize(entry.payeeName);
        if (!seenPayees.has(normalized)) {
          seenPayees.add(normalized);
          candidates.push({
            payeeName: entry.payeeName,
            payeeNameOriginal: entry.payeeNameOriginal,
            categoryId: entry.categoryId,
            categoryName: entry.categoryName,
          });
        }
      }
    }

    // Add categorized payees from Actual Budget (those with historical categorized transactions)
    const categorizedPayees = await this.actualBudget.getCategorizedPayees();
    for (const payee of categorizedPayees) {
      const normalized = payeeMatcher.normalize(payee.payeeName);
      if (!seenPayees.has(normalized)) {
        seenPayees.add(normalized);
        candidates.push({
          payeeName: payee.payeeName,
          payeeNameOriginal: payee.payeeName,
          categoryId: payee.categoryId,
          categoryName: payee.categoryName,
        });
      }
    }

    logger.debug('Built fuzzy match candidates', {
      budgetId,
      fromCache: this.payeeCache ? this.payeeCache.getAllCachedPayees(budgetId).length : 0,
      fromBudget: categorizedPayees.length,
      totalUnique: candidates.length,
    });

    return candidates;
  }

  /**
   * Verify a high-confidence fuzzy match with LLM
   * Asks LLM if the matched payee is correct and what category to use
   */
  private async verifyFuzzyMatch(
    newPayee: string,
    matchedPayee: string,
    matchedCategory: string,
    matchScore: number,
    categories: Category[]
  ): Promise<PayeeCategorySuggestion> {
    const categoryList = categories
      .filter(cat => !cat.hidden && !cat.isIncome)
      .map(cat => `${cat.id}|${cat.name}|${cat.groupName}`)
      .join('\n');

    const prompt = `You are a personal finance assistant. A transaction has payee "${newPayee}".

I found a similar payee "${matchedPayee}" (similarity score: ${matchScore}%) that is usually categorized as "${matchedCategory}".

Tasks:
1. Determine if "${newPayee}" and "${matchedPayee}" refer to the same merchant/entity
2. If they match, suggest the appropriate category (could be the same or different)
3. Suggest a canonical/clean payee name if the names are variants of the same merchant

Categories (id|name|group):
${categoryList}

Respond with JSON only (no markdown):
{
  "isSameMerchant": true/false,
  "categoryId": "...", 
  "categoryName": "...",
  "confidence": 0.0-1.0,
  "suggestedPayeeName": "...",
  "reasoning": "..."
}`;

    try {
      const response = await this.openai.chatCompletion({
        userPrompt: prompt,
        jsonResponse: true,
        temperature: 0.3,
      });

      logger.info('OpenAI response for fuzzy match verification', {
        newPayee,
        matchedPayee,
        responseLength: response.length,
        response,
      });

      const result = OpenAIAdapter.parseJsonResponse<Record<string, unknown>>(response);

      if (result.isSameMerchant === true) {
        return {
          payeeName: newPayee,
          categoryId: (result.categoryId as string) || null,
          categoryName: (result.categoryName as string) || null,
          confidence: (result.confidence as number) ?? 0.8,
          reasoning: `Fuzzy match verified: "${matchedPayee}" (${matchScore}% similar). ${result.reasoning || ''}`,
          suggestedPayeeName: (result.suggestedPayeeName as string) || undefined,
        };
      } else {
        logger.info('Fuzzy match rejected by LLM', {
          newPayee,
          matchedPayee,
          reasoning: result.reasoning,
        });
        return {
          payeeName: newPayee,
          categoryId: null,
          categoryName: null,
          confidence: 0,
          reasoning: `Fuzzy match rejected: "${matchedPayee}" is not the same as "${newPayee}". ${result.reasoning || ''}`,
        };
      }
    } catch (error) {
      logger.error('Failed to verify fuzzy match', {
        newPayee,
        matchedPayee,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fall back to using the fuzzy match anyway with lower confidence
      return {
        payeeName: newPayee,
        categoryId: null,
        categoryName: null,
        confidence: 0,
        reasoning: 'Fuzzy match verification failed',
      };
    }
  }

  /**
   * Disambiguate between multiple potential fuzzy matches using LLM
   * Sends candidate list to LLM to determine best match
   */
  private async disambiguateFuzzyMatches(
    newPayee: string,
    candidates: FuzzyMatchResult[],
    categories: Category[]
  ): Promise<PayeeCategorySuggestion> {
    if (candidates.length === 0) {
      return {
        payeeName: newPayee,
        categoryId: null,
        categoryName: null,
        confidence: 0,
        reasoning: 'No fuzzy match candidates available',
      };
    }

    const candidateList = candidates
      .map((c, i) => `${i + 1}. "${c.payeeName}" (${c.score}% similar) → ${c.categoryName}`)
      .join('\n');

    const categoryList = categories
      .filter(cat => !cat.hidden && !cat.isIncome)
      .map(cat => `${cat.id}|${cat.name}|${cat.groupName}`)
      .join('\n');

    const prompt = `You are a personal finance assistant. A transaction has payee "${newPayee}".

I found these similar payees in the user's budget:
${candidateList}

Tasks:
1. Determine if any of these payees match "${newPayee}" (same merchant/entity)
2. If a match is found, return its index and suggest the appropriate category
3. If no match, return matchIndex: null and suggest a new category

Categories (id|name|group):
${categoryList}

Respond with JSON only (no markdown):
{
  "matchIndex": 1-${candidates.length} or null,
  "categoryId": "...",
  "categoryName": "...",
  "confidence": 0.0-1.0,
  "suggestedPayeeName": "...",
  "reasoning": "..."
}`;

    try {
      const response = await this.openai.chatCompletion({
        userPrompt: prompt,
        jsonResponse: true,
        temperature: 0.3,
      });

      logger.info('OpenAI response for fuzzy match disambiguation', {
        newPayee,
        candidateCount: candidates.length,
        responseLength: response.length,
        response,
      });

      const result = OpenAIAdapter.parseJsonResponse<Record<string, unknown>>(response);

      const matchIndex = result.matchIndex as number | null;
      if (matchIndex !== null && matchIndex >= 1 && matchIndex <= candidates.length) {
        const matchedCandidate = candidates[matchIndex - 1];
        return {
          payeeName: newPayee,
          categoryId: (result.categoryId as string) || matchedCandidate.categoryId,
          categoryName: (result.categoryName as string) || matchedCandidate.categoryName,
          confidence: (result.confidence as number) ?? 0.7,
          reasoning: `Disambiguated: Matched "${matchedCandidate.payeeName}" (${matchedCandidate.score}%). ${result.reasoning || ''}`,
          suggestedPayeeName: (result.suggestedPayeeName as string) || undefined,
        };
      } else {
        // No match found among candidates, but LLM may have suggested a category
        if (result.categoryId) {
          return {
            payeeName: newPayee,
            categoryId: result.categoryId as string,
            categoryName: (result.categoryName as string) || null,
            confidence: (result.confidence as number) ?? 0.5,
            reasoning: `No fuzzy match found. ${result.reasoning || ''}`,
            suggestedPayeeName: (result.suggestedPayeeName as string) || undefined,
          };
        }
        return {
          payeeName: newPayee,
          categoryId: null,
          categoryName: null,
          confidence: 0,
          reasoning: `No matching payee found among candidates. ${result.reasoning || ''}`,
        };
      }
    } catch (error) {
      logger.error('Failed to disambiguate fuzzy matches', {
        newPayee,
        candidateCount: candidates.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        payeeName: newPayee,
        categoryId: null,
        categoryName: null,
        confidence: 0,
        reasoning: 'Fuzzy match disambiguation failed',
      };
    }
  }

  /**
   * Categorize a payee using fuzzy matching first, then falling back to LLM
   * This reduces LLM calls by leveraging existing payee→category mappings
   */
  private async categorizePayeeWithFuzzyMatch(
    payeeName: string,
    categories: Category[],
    fuzzyMatchCandidates: PayeeCandidate[]
  ): Promise<PayeeCategorySuggestion> {
    // Step 1: Check for high-confidence fuzzy match (score >= 85)
    const highConfidenceMatch = payeeMatcher.findHighConfidenceMatch(payeeName, fuzzyMatchCandidates);
    
    if (highConfidenceMatch) {
      logger.info('Found high-confidence fuzzy match', {
        payeeName,
        matchedPayee: highConfidenceMatch.payeeName,
        score: highConfidenceMatch.score,
        category: highConfidenceMatch.categoryName,
      });

      // Verify with LLM to determine if match is correct and get category
      const verified = await this.verifyFuzzyMatch(
        payeeName,
        highConfidenceMatch.payeeName,
        highConfidenceMatch.categoryName,
        highConfidenceMatch.score,
        categories
      );

      if (verified.categoryId) {
        return verified;
      }
      // If verification failed, fall through to regular LLM categorization
    }

    // Step 2: Check for potential matches to disambiguate (score 50-84)
    const disambiguationCandidates = payeeMatcher.getCandidatesForDisambiguation(
      payeeName,
      fuzzyMatchCandidates
    );

    if (disambiguationCandidates.length > 0) {
      logger.info('Found candidates for disambiguation', {
        payeeName,
        candidateCount: disambiguationCandidates.length,
        topCandidate: disambiguationCandidates[0]?.payeeName,
        topScore: disambiguationCandidates[0]?.score,
      });

      // Ask LLM to disambiguate
      const disambiguated = await this.disambiguateFuzzyMatches(
        payeeName,
        disambiguationCandidates,
        categories
      );

      if (disambiguated.categoryId) {
        return disambiguated;
      }
      // If disambiguation didn't find a match, fall through to web search
    }

    // Step 3: No fuzzy match found, use regular LLM categorization with web search
    logger.info('No fuzzy match found, using web search categorization', { payeeName });
    return this.categorizePayee(payeeName, categories);
  }

  /**
   * Generate suggestions for payees - one LLM call per unique payee
   * Uses fuzzy matching to reduce LLM calls by leveraging known payee→category mappings
   */
  private async generateBatchSuggestions(
    budgetId: string,
    payeeNames: string[],
    transactionsByPayee: Map<string, Transaction[]>,
    categories: Category[]
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const toCache: Array<{
      budgetId: string;
      payeeName: string;
      categoryId: string;
      categoryName: string;
      confidence: number;
      source: 'user_approved' | 'high_confidence_ai';
    }> = [];

    logger.info('Processing payees with fuzzy matching', { payeeCount: payeeNames.length });

    // Build fuzzy match candidates pool (from cache + categorized payees)
    const fuzzyMatchCandidates = await this.buildFuzzyMatchCandidates(budgetId);
    logger.info('Fuzzy match candidates loaded', { candidateCount: fuzzyMatchCandidates.length });

    // Track stats
    let fuzzyMatchHits = 0;
    let webSearchCalls = 0;

    // Process each payee sequentially
    for (let i = 0; i < payeeNames.length; i++) {
      const payeeName = payeeNames[i];
      const txns = transactionsByPayee.get(payeeName) || [];

      logger.info(`Processing payee ${i + 1}/${payeeNames.length}`, {
        payeeName,
        transactionCount: txns.length,
      });

      // Use fuzzy matching first, then fall back to LLM web search
      const result = await this.categorizePayeeWithFuzzyMatch(
        payeeName,
        categories,
        fuzzyMatchCandidates
      );

      // Track whether this was a fuzzy match or web search
      if (result.reasoning.includes('Fuzzy match') || result.reasoning.includes('Disambiguated')) {
        fuzzyMatchHits++;
      } else {
        webSearchCalls++;
      }

      // Create suggestions for all transactions with this payee
      for (const txn of txns) {
        const suggestion = createSuggestion({
          budgetId,
          transactionId: txn.id,
          transactionAccountId: txn.accountId,
          transactionAccountName: txn.accountName,
          transactionPayee: txn.payeeName,
          transactionAmount: txn.amount,
          transactionDate: txn.date,
          currentCategoryId: txn.categoryId,
          proposedCategoryId: result.categoryId || 'unknown',
          proposedCategoryName: result.categoryName || 'Unknown',
          suggestedPayeeName: result.suggestedPayeeName || null,
          confidence: result.confidence,
          rationale: result.reasoning,
        });
        this.suggestionRepo.save(suggestion);
        suggestions.push(suggestion);
      }

      // Cache high-confidence results
      if (result.categoryId && result.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
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

    logger.info('Finished processing all payees', {
      payeeCount: payeeNames.length,
      suggestionsCount: suggestions.length,
      cachedCount: toCache.length,
      fuzzyMatchHits,
      webSearchCalls,
      fuzzyMatchCandidatesAvailable: fuzzyMatchCandidates.length,
    });

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
   * Cleanup: Removes suggestions for deleted transactions
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

    // Cleanup orphaned suggestions (transactions that no longer exist in budget)
    const validTransactionIds = new Set(transactions.map(t => t.id));
    const cleanedUp = this.suggestionRepo.cleanupOrphanedSuggestions(budgetId, validTransactionIds);
    if (cleanedUp > 0) {
      logger.info('Cleaned up orphaned suggestions for deleted transactions', { count: cleanedUp });
    }

    // Get existing suggestions to determine which transactions already have suggestions
    const existingSuggestions = this.suggestionRepo.findByBudgetId(budgetId);
    const retryableTxIds = this.getRetryableTransactionIds(existingSuggestions);

    if (retryableTxIds.length > 0) {
      logger.info('Found retryable suggestions (will be regenerated)', {
        budgetId,
        retryableTransactions: retryableTxIds.length,
      });
    }

    // Only consider non-failed suggestions as "already processed"
    const successfulSuggestions = existingSuggestions.filter(
      (s) => !retryableTxIds.includes(s.transactionId)
    );

    const existingTransactionIds = new Set(
      successfulSuggestions.map((s) => s.transactionId)
    );

    // Filter to only new uncategorized transactions without suggestions
    const uncategorized = transactions.filter(
      (txn) => txn.categoryId === null && !existingTransactionIds.has(txn.id) && !txn.isTransfer
    );

    const transferSkipped = transactions.filter((txn) => txn.isTransfer).length;
    if (transferSkipped > 0) {
      logger.info('Skipped transfer transactions during diff-based generation', { count: transferSkipped });
    }

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
          transactionAccountId: txn.accountId,
          transactionAccountName: txn.accountName,
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
