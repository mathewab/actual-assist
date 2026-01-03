import { OpenAIAdapter } from '../infra/OpenAIAdapter.js';
import type { SuggestionRepository } from '../infra/repositories/SuggestionRepository.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { PayeeCacheRepository } from '../infra/repositories/PayeeCacheRepository.js';
import type { PayeeMatchCacheRepository } from '../infra/repositories/PayeeMatchCacheRepository.js';
import type { Transaction, Category } from '../domain/entities/BudgetSnapshot.js';
import {
  createSuggestion,
  type Suggestion,
  type SuggestionComponentStatus,
} from '../domain/entities/Suggestion.js';
import { logger } from '../infra/logger.js';
import { payeeMatcher, type FuzzyMatchResult, type PayeeCandidate } from '../infra/PayeeMatcher.js';

/** Threshold for caching high-confidence AI suggestions */
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

const PAYEE_IDENTIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['canonicalPayeeName', 'confidence', 'reasoning'],
  properties: {
    canonicalPayeeName: { type: 'string' },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
  },
} as const;

const CATEGORY_SUGGESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['categoryId', 'categoryName', 'confidence', 'reasoning'],
  properties: {
    categoryId: { type: ['string', 'null'] },
    categoryName: { type: ['string', 'null'] },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
  },
} as const;

const FUZZY_MATCH_VERIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'isSameMerchant',
    'canonicalPayeeName',
    'payeeConfidence',
    'payeeReasoning',
    'categoryId',
    'categoryName',
    'categoryConfidence',
    'categoryReasoning',
  ],
  properties: {
    isSameMerchant: { type: 'boolean' },
    canonicalPayeeName: { type: ['string', 'null'] },
    payeeConfidence: { type: 'number' },
    payeeReasoning: { type: 'string' },
    categoryId: { type: ['string', 'null'] },
    categoryName: { type: ['string', 'null'] },
    categoryConfidence: { type: 'number' },
    categoryReasoning: { type: 'string' },
  },
} as const;

const FUZZY_MATCH_DISAMBIGUATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'matchIndex',
    'canonicalPayeeName',
    'payeeConfidence',
    'payeeReasoning',
    'categoryId',
    'categoryName',
    'categoryConfidence',
    'categoryReasoning',
  ],
  properties: {
    matchIndex: { type: ['integer', 'null'] },
    canonicalPayeeName: { type: ['string', 'null'] },
    payeeConfidence: { type: 'number' },
    payeeReasoning: { type: 'string' },
    categoryId: { type: ['string', 'null'] },
    categoryName: { type: ['string', 'null'] },
    categoryConfidence: { type: 'number' },
    categoryReasoning: { type: 'string' },
  },
} as const;

/** Result of payee suggestion for a transaction */
interface PayeeSuggestionResult {
  payeeName: string;
  canonicalPayeeId: string | null;
  canonicalPayeeName: string | null;
  confidence: number;
  rationale: string;
  source: 'cache' | 'fuzzy_match' | 'ai';
}

/** Result of category suggestion for a payee */
interface CategorySuggestionResult {
  payeeName: string;
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
  rationale: string;
  source: 'cache' | 'fuzzy_match' | 'ai_with_context' | 'ai_web_search';
}

/** Combined suggestion result for a payee */
interface CombinedSuggestionResult {
  payee: PayeeSuggestionResult;
  category: CategorySuggestionResult;
}

/**
 * SuggestionService - generates AI suggestions for payees and categories
 * P1 (Single Responsibility): Focused on suggestion generation
 * P3 (Testability): Dependencies injected for easy mocking
 *
 * Architecture:
 * - Payee and Category suggestions are independent with separate confidence/rationale
 * - Payee matches are cached in payee_match_cache
 * - Payee->Category mappings are cached in payee_category_cache
 * - Web search is used for unknown payees when no cache/fuzzy match exists
 */
export class SuggestionService {
  constructor(
    private actualBudget: ActualBudgetAdapter,
    private openai: OpenAIAdapter,
    private suggestionRepo: SuggestionRepository,
    private auditRepo: AuditRepository,
    private payeeCache?: PayeeCacheRepository,
    private payeeMatchCache?: PayeeMatchCacheRepository
  ) {}

  /**
   * Identify transactions that need an LLM retry because the previous attempt failed
   * Retry on actual LLM/API errors (empty rationale) or placeholders without a category suggestion
   * Do NOT retry valid responses from the LLM (even "unknown" ones)
   */
  private getRetryableTransactionIds(suggestions: Suggestion[]): string[] {
    const retryable = suggestions.filter((s) => {
      if (s.status !== 'pending') return false;

      const hasCategoryProposal =
        s.categorySuggestion?.proposedCategoryId !== null &&
        s.categorySuggestion?.proposedCategoryId !== undefined;

      // Retry if LLM error (empty rationale) or no category suggestion yet
      return s.rationale === '' || !hasCategoryProposal;
    });

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
  async generateSuggestions(budgetId: string, useAI = true): Promise<Suggestion[]> {
    logger.info('Generating suggestions', { budgetId, useAI });

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
    const validTransactionIds = new Set(transactions.map((t) => t.id));
    const cleanedUp = this.suggestionRepo.cleanupOrphanedSuggestions(budgetId, validTransactionIds);
    if (cleanedUp > 0) {
      logger.info('Cleaned up orphaned suggestions for deleted transactions', { count: cleanedUp });
    }

    const uncategorizedTransactionIds = new Set(
      transactions.filter((txn) => txn.categoryId === null && !txn.isTransfer).map((txn) => txn.id)
    );
    const resolvedCleaned = this.suggestionRepo.cleanupResolvedSuggestions(
      budgetId,
      uncategorizedTransactionIds
    );
    if (resolvedCleaned > 0) {
      logger.info('Cleaned up resolved suggestions for categorized transactions', {
        count: resolvedCleaned,
      });
    }

    // Get existing pending suggestion transaction IDs for deduplication
    // (excluding retryable ones which will be regenerated)
    const existingPendingTxIds = this.suggestionRepo.getExistingPendingTransactionIds(budgetId);
    const skipTxIds = new Set(
      [...existingPendingTxIds].filter((id) => !retryableTxIds.includes(id))
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
      logger.info('Skipped transfer transactions from suggestion generation', {
        count: transferSkipped,
      });
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

    // Check cache for known payee→category mappings (combined lookup)
    const { cached: cachedCategories, uncached } = await this.checkPayeeCategoryCache(
      budgetId,
      uniquePayees
    );

    logger.info(`Cache lookup: ${cachedCategories.size} category hits, ${uncached.length} misses`);

    // Generate suggestions from cache hits (no LLM call needed)
    const suggestions: Suggestion[] = [];

    for (const [payeeName, cacheEntry] of cachedCategories) {
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
          currentPayeeId: null,

          // Payee - skip for cached (already known)
          payeeStatus: 'skipped',

          // Category from cache
          proposedCategoryId: cacheEntry.categoryId,
          proposedCategoryName: cacheEntry.categoryName,
          categoryConfidence: cacheEntry.confidence,
          categoryRationale: `Cached: ${cacheEntry.source === 'user_approved' ? 'Previously approved by user' : 'High-confidence AI suggestion'}`,
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
        categories,
        useAI
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
        cacheHits: cachedCategories.size,
        llmCalls: useAI && uncached.length > 0 ? 1 : 0,
      },
    });

    logger.info('Suggestions generated', {
      count: suggestions.length,
      cacheHits: cachedCategories.size,
      llmPayees: useAI ? uncached.length : 0,
      useAI,
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
   * Check payee category cache for known payee→category mappings
   */
  private async checkPayeeCategoryCache(
    budgetId: string,
    payeeNames: string[]
  ): Promise<{
    cached: Map<
      string,
      { categoryId: string; categoryName: string; confidence: number; source: string }
    >;
    uncached: string[];
  }> {
    const cached = new Map<
      string,
      { categoryId: string; categoryName: string; confidence: number; source: string }
    >();
    const uncached: string[] = [];

    if (!this.payeeCache) {
      return { cached, uncached: payeeNames };
    }

    const cacheEntries = this.payeeCache.findByPayees(budgetId, payeeNames);

    for (const payeeName of payeeNames) {
      const normalized = payeeName
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '');
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

  /** System instructions for payee identification */
  private readonly PAYEE_IDENTIFICATION_INSTRUCTIONS = `You are a personal finance assistant helping identify transaction payees.

Your task:
1. Use web search to identify what business/merchant this is
2. Determine the canonical/clean name of this merchant
3. If it's a well-known business, provide the standard name (e.g., "AMZN MKTP" → "Amazon")
4. If uncertain, return the cleaned-up version of the input

Respond with a single JSON object (no markdown, no explanation):
{"canonicalPayeeName":"...","confidence":0.0-1.0,"reasoning":"..."}`;

  /**
   * Build input for payee identification
   */
  private buildPayeeIdentificationInput(rawPayeeName: string): string {
    return `Raw payee name from bank: "${rawPayeeName}"`;
  }

  /** System instructions for category suggestion */
  private readonly CATEGORY_SUGGESTION_INSTRUCTIONS = `You are a personal finance assistant helping categorize transactions.

Your task:
1. Consider any similar payees provided as hints
2. Use web search if needed to identify merchant type
3. Match to the most appropriate category from the provided list
4. If uncertain, set categoryId and categoryName to null

Respond with a single JSON object (no markdown, no explanation):
{"categoryId":"...","categoryName":"...","confidence":0.0-1.0,"reasoning":"..."}`;

  /**
   * Build input for category suggestion with context from matched payees
   */
  private buildCategorySuggestionInput(
    payeeName: string,
    canonicalPayeeName: string | null,
    categories: Category[],
    matchedPayeeCategories: Array<{ payeeName: string; categoryName: string; categoryId: string }>
  ): string {
    const categoryList = categories
      .filter((cat) => !cat.hidden && !cat.isIncome)
      .map((cat) => `${cat.id}|${cat.name}|${cat.groupName}`)
      .join('\n');

    const contextSection =
      matchedPayeeCategories.length > 0
        ? `\nSimilar payees in this budget:\n${matchedPayeeCategories.map((p) => `- "${p.payeeName}" → ${p.categoryName}`).join('\n')}\n`
        : '';

    return `Payee: ${canonicalPayeeName || payeeName}
${canonicalPayeeName && canonicalPayeeName !== payeeName ? `(Original: ${payeeName})` : ''}
${contextSection}
Categories (id|name|group):
${categoryList}`;
  }

  /**
   * Identify canonical payee name via LLM with web search
   */
  private async identifyPayee(rawPayeeName: string): Promise<PayeeSuggestionResult> {
    try {
      const input = this.buildPayeeIdentificationInput(rawPayeeName);
      logger.debug('Calling OpenAI for payee identification', { rawPayeeName });

      const response = await this.openai.completion({
        instructions: this.PAYEE_IDENTIFICATION_INSTRUCTIONS,
        input,
        webSearch: true,
        jsonSchema: {
          name: 'payee_identification',
          schema: PAYEE_IDENTIFICATION_SCHEMA,
        },
      });
      const result = OpenAIAdapter.parseJsonResponse<Record<string, unknown>>(response);

      return {
        payeeName: rawPayeeName,
        canonicalPayeeId: null, // Will be matched later if payee exists in budget
        canonicalPayeeName: (result.canonicalPayeeName as string) || rawPayeeName,
        confidence: (result.confidence as number) ?? 0.7,
        rationale: (result.reasoning as string) || 'AI-identified payee',
        source: 'ai',
      };
    } catch (error) {
      logger.warn('Payee identification failed', {
        rawPayeeName,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        payeeName: rawPayeeName,
        canonicalPayeeId: null,
        canonicalPayeeName: rawPayeeName,
        confidence: 0,
        rationale: '',
        source: 'ai',
      };
    }
  }

  /**
   * Suggest category for a payee via LLM with web search
   * Always uses web search to properly identify merchant type
   */
  private async suggestCategory(
    payeeName: string,
    canonicalPayeeName: string | null,
    categories: Category[],
    matchedPayeeCategories: Array<{ payeeName: string; categoryName: string; categoryId: string }>
  ): Promise<CategorySuggestionResult> {
    try {
      const input = this.buildCategorySuggestionInput(
        payeeName,
        canonicalPayeeName,
        categories,
        matchedPayeeCategories
      );

      logger.debug('Calling OpenAI for category suggestion with web search', {
        payeeName,
        canonicalPayeeName,
        matchedPayeesCount: matchedPayeeCategories.length,
      });

      const response = await this.openai.completion({
        instructions: this.CATEGORY_SUGGESTION_INSTRUCTIONS,
        input,
        webSearch: true,
        jsonSchema: {
          name: 'category_suggestion',
          schema: CATEGORY_SUGGESTION_SCHEMA,
        },
      });

      const result = OpenAIAdapter.parseJsonResponse<Record<string, unknown>>(response);

      return {
        payeeName,
        categoryId: (result.categoryId as string) || null,
        categoryName: (result.categoryName as string) || null,
        confidence: (result.confidence as number) ?? 0.5,
        rationale: (result.reasoning as string) || 'AI-suggested category',
        source: 'ai_web_search',
      };
    } catch (error) {
      logger.warn('Category suggestion failed', {
        payeeName,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        payeeName,
        categoryId: null,
        categoryName: null,
        confidence: 0,
        rationale: '',
        source: 'ai_web_search',
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

  /** System instructions for fuzzy match verification */
  private readonly FUZZY_MATCH_INSTRUCTIONS = `You are a personal finance assistant verifying if two payee names refer to the same merchant.

Your task:
1. Determine if the two payee names refer to the same merchant/entity
2. If they match, suggest the appropriate category (could be same or different)
3. Suggest a canonical/clean payee name if the names are variants of the same merchant

Respond with JSON only (no markdown):
{
  "isSameMerchant": true/false,
  "canonicalPayeeName": "...",
  "payeeConfidence": 0.0-1.0,
  "payeeReasoning": "...",
  "categoryId": "...", 
  "categoryName": "...",
  "categoryConfidence": 0.0-1.0,
  "categoryReasoning": "..."
}`;

  /**
   * Verify a high-confidence fuzzy match with LLM
   * Returns separate payee and category suggestions
   */
  private async verifyFuzzyMatch(
    rawPayee: string,
    matchedPayee: string,
    matchedCategory: string,
    matchedCategoryId: string,
    matchScore: number,
    categories: Category[]
  ): Promise<CombinedSuggestionResult> {
    const categoryList = categories
      .filter((cat) => !cat.hidden && !cat.isIncome)
      .map((cat) => `${cat.id}|${cat.name}|${cat.groupName}`)
      .join('\n');

    const input = `Transaction payee: "${rawPayee}"
Similar payee found: "${matchedPayee}" (similarity score: ${matchScore}%)
Usually categorized as: "${matchedCategory}"

Categories (id|name|group):
${categoryList}`;

    try {
      const response = await this.openai.completion({
        instructions: this.FUZZY_MATCH_INSTRUCTIONS,
        input,
        webSearch: false,
        jsonSchema: {
          name: 'fuzzy_match_verification',
          schema: FUZZY_MATCH_VERIFICATION_SCHEMA,
        },
      });

      logger.info('OpenAI response for fuzzy match verification', {
        rawPayee,
        matchedPayee,
        responseLength: response.length,
      });

      const result = OpenAIAdapter.parseJsonResponse<Record<string, unknown>>(response);

      if (result.isSameMerchant === true) {
        return {
          payee: {
            payeeName: rawPayee,
            canonicalPayeeId: null,
            canonicalPayeeName: (result.canonicalPayeeName as string) || matchedPayee,
            confidence: (result.payeeConfidence as number) ?? 0.8,
            rationale: `Matched "${matchedPayee}" (${matchScore}%). ${result.payeeReasoning || ''}`,
            source: 'fuzzy_match',
          },
          category: {
            payeeName: rawPayee,
            categoryId: (result.categoryId as string) || matchedCategoryId,
            categoryName: (result.categoryName as string) || matchedCategory,
            confidence: (result.categoryConfidence as number) ?? 0.8,
            rationale: `Matched payee "${matchedPayee}". ${result.categoryReasoning || ''}`,
            source: 'fuzzy_match',
          },
        };
      } else {
        logger.info('Fuzzy match rejected by LLM', {
          rawPayee,
          matchedPayee,
          reasoning: result.payeeReasoning,
        });
        return {
          payee: {
            payeeName: rawPayee,
            canonicalPayeeId: null,
            canonicalPayeeName: null,
            confidence: 0,
            rationale: `Not same as "${matchedPayee}". ${result.payeeReasoning || ''}`,
            source: 'fuzzy_match',
          },
          category: {
            payeeName: rawPayee,
            categoryId: null,
            categoryName: null,
            confidence: 0,
            rationale: 'Fuzzy match rejected',
            source: 'fuzzy_match',
          },
        };
      }
    } catch (error) {
      logger.error('Failed to verify fuzzy match', {
        rawPayee,
        matchedPayee,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        payee: {
          payeeName: rawPayee,
          canonicalPayeeId: null,
          canonicalPayeeName: null,
          confidence: 0,
          rationale: '',
          source: 'fuzzy_match',
        },
        category: {
          payeeName: rawPayee,
          categoryId: null,
          categoryName: null,
          confidence: 0,
          rationale: '',
          source: 'fuzzy_match',
        },
      };
    }
  }

  /**
   * Disambiguate between multiple potential fuzzy matches using LLM
   * Returns separate payee and category suggestions
   */
  private async disambiguateFuzzyMatches(
    rawPayee: string,
    candidates: FuzzyMatchResult[],
    categories: Category[]
  ): Promise<CombinedSuggestionResult> {
    if (candidates.length === 0) {
      return {
        payee: {
          payeeName: rawPayee,
          canonicalPayeeId: null,
          canonicalPayeeName: null,
          confidence: 0,
          rationale: 'No fuzzy match candidates available',
          source: 'fuzzy_match',
        },
        category: {
          payeeName: rawPayee,
          categoryId: null,
          categoryName: null,
          confidence: 0,
          rationale: 'No fuzzy match candidates available',
          source: 'fuzzy_match',
        },
      };
    }

    const candidateList = candidates
      .map((c, i) => `${i + 1}. "${c.payeeName}" (${c.score}% similar) → ${c.categoryName}`)
      .join('\n');

    const categoryList = categories
      .filter((cat) => !cat.hidden && !cat.isIncome)
      .map((cat) => `${cat.id}|${cat.name}|${cat.groupName}`)
      .join('\n');

    const instructions = `You are a personal finance assistant helping match payees from transaction data.

Your task:
1. Determine if any of the candidate payees match the transaction payee (same merchant/entity)
2. If a match is found, return its index and suggest the appropriate category
3. If no match, return matchIndex: null and suggest a category based on your knowledge

Respond with JSON only (no markdown):
{
  "matchIndex": 1-${candidates.length} or null,
  "canonicalPayeeName": "...",
  "payeeConfidence": 0.0-1.0,
  "payeeReasoning": "...",
  "categoryId": "...",
  "categoryName": "...",
  "categoryConfidence": 0.0-1.0,
  "categoryReasoning": "..."
}`;

    const input = `Transaction payee: "${rawPayee}"

Similar payees found in budget:
${candidateList}

Categories (id|name|group):
${categoryList}`;

    try {
      const response = await this.openai.completion({
        instructions,
        input,
        webSearch: false,
        jsonSchema: {
          name: 'fuzzy_match_disambiguation',
          schema: FUZZY_MATCH_DISAMBIGUATION_SCHEMA,
        },
      });

      logger.info('OpenAI response for fuzzy match disambiguation', {
        rawPayee,
        candidateCount: candidates.length,
        responseLength: response.length,
      });

      const result = OpenAIAdapter.parseJsonResponse<Record<string, unknown>>(response);

      const matchIndex = result.matchIndex as number | null;
      if (matchIndex !== null && matchIndex >= 1 && matchIndex <= candidates.length) {
        const matchedCandidate = candidates[matchIndex - 1];
        return {
          payee: {
            payeeName: rawPayee,
            canonicalPayeeId: null,
            canonicalPayeeName: (result.canonicalPayeeName as string) || matchedCandidate.payeeName,
            confidence: (result.payeeConfidence as number) ?? 0.7,
            rationale: `Matched "${matchedCandidate.payeeName}" (${matchedCandidate.score}%). ${result.payeeReasoning || ''}`,
            source: 'fuzzy_match',
          },
          category: {
            payeeName: rawPayee,
            categoryId: (result.categoryId as string) || matchedCandidate.categoryId,
            categoryName: (result.categoryName as string) || matchedCandidate.categoryName,
            confidence: (result.categoryConfidence as number) ?? 0.7,
            rationale: `Matched payee category. ${result.categoryReasoning || ''}`,
            source: 'fuzzy_match',
          },
        };
      } else {
        // No match found, but LLM may have suggested a category
        return {
          payee: {
            payeeName: rawPayee,
            canonicalPayeeId: null,
            canonicalPayeeName: (result.canonicalPayeeName as string) || null,
            confidence: (result.payeeConfidence as number) ?? 0,
            rationale: `No match found. ${result.payeeReasoning || ''}`,
            source: 'fuzzy_match',
          },
          category: {
            payeeName: rawPayee,
            categoryId: (result.categoryId as string) || null,
            categoryName: (result.categoryName as string) || null,
            confidence: (result.categoryConfidence as number) ?? 0.5,
            rationale: (result.categoryReasoning as string) || 'No matching payee',
            source: 'fuzzy_match',
          },
        };
      }
    } catch (error) {
      logger.error('Failed to disambiguate fuzzy matches', {
        rawPayee,
        candidateCount: candidates.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        payee: {
          payeeName: rawPayee,
          canonicalPayeeId: null,
          canonicalPayeeName: null,
          confidence: 0,
          rationale: '',
          source: 'fuzzy_match',
        },
        category: {
          payeeName: rawPayee,
          categoryId: null,
          categoryName: null,
          confidence: 0,
          rationale: '',
          source: 'fuzzy_match',
        },
      };
    }
  }

  /**
   * Generate combined payee and category suggestions for a payee
   * Uses fuzzy matching first, then falls back to AI with web search
   */
  private async generateCombinedSuggestion(
    rawPayeeName: string,
    categories: Category[],
    fuzzyMatchCandidates: PayeeCandidate[],
    budgetId: string,
    useAI = true
  ): Promise<CombinedSuggestionResult> {
    if (!useAI) {
      return this.generateHeuristicSuggestion(rawPayeeName, fuzzyMatchCandidates, budgetId);
    }

    // Step 1: Check payee match cache
    if (this.payeeMatchCache) {
      const cachedPayee = this.payeeMatchCache.findByPayee(budgetId, rawPayeeName);
      if (cachedPayee) {
        logger.debug('Payee match cache hit', {
          rawPayeeName,
          canonicalPayeeName: cachedPayee.canonicalPayeeName,
        });

        // Use cached payee, but still need to get category
        const categoryResult = await this.getCategorySuggestionForPayee(
          rawPayeeName,
          cachedPayee.canonicalPayeeName,
          categories,
          budgetId,
          fuzzyMatchCandidates
        );

        return {
          payee: {
            payeeName: rawPayeeName,
            canonicalPayeeId: cachedPayee.canonicalPayeeId,
            canonicalPayeeName: cachedPayee.canonicalPayeeName,
            confidence: cachedPayee.confidence,
            rationale: `Cached: ${cachedPayee.source === 'user_approved' ? 'Previously approved' : 'High-confidence match'}`,
            source: 'cache',
          },
          category: categoryResult,
        };
      }
    }

    // Step 2: Try high-confidence fuzzy match
    const highConfidenceMatch = payeeMatcher.findHighConfidenceMatch(
      rawPayeeName,
      fuzzyMatchCandidates
    );

    if (highConfidenceMatch) {
      logger.info('Found high-confidence fuzzy match', {
        rawPayeeName,
        matchedPayee: highConfidenceMatch.payeeName,
        score: highConfidenceMatch.score,
      });

      const verified = await this.verifyFuzzyMatch(
        rawPayeeName,
        highConfidenceMatch.payeeName,
        highConfidenceMatch.categoryName,
        highConfidenceMatch.categoryId,
        highConfidenceMatch.score,
        categories
      );

      if (verified.payee.confidence > 0 || verified.category.confidence > 0) {
        return verified;
      }
    }

    // Step 3: Try disambiguation with multiple candidates
    const disambiguationCandidates = payeeMatcher.getCandidatesForDisambiguation(
      rawPayeeName,
      fuzzyMatchCandidates
    );

    if (disambiguationCandidates.length > 0) {
      logger.info('Found candidates for disambiguation', {
        rawPayeeName,
        candidateCount: disambiguationCandidates.length,
      });

      const disambiguated = await this.disambiguateFuzzyMatches(
        rawPayeeName,
        disambiguationCandidates,
        categories
      );

      if (disambiguated.payee.confidence > 0 || disambiguated.category.confidence > 0) {
        return disambiguated;
      }
    }

    // Step 4: No fuzzy match - use AI with web search
    logger.info('No fuzzy match, using AI with web search', { rawPayeeName });

    // First identify the payee
    const payeeResult = await this.identifyPayee(rawPayeeName);

    // Then suggest category with web search
    const categoryResult = await this.suggestCategory(
      rawPayeeName,
      payeeResult.canonicalPayeeName,
      categories,
      [] // No matched payees
    );

    return {
      payee: payeeResult,
      category: categoryResult,
    };
  }

  private generateHeuristicSuggestion(
    rawPayeeName: string,
    fuzzyMatchCandidates: PayeeCandidate[],
    budgetId: string
  ): CombinedSuggestionResult {
    const emptyPayee: PayeeSuggestionResult = {
      payeeName: rawPayeeName,
      canonicalPayeeId: null,
      canonicalPayeeName: null,
      confidence: 0,
      rationale: 'No heuristic match',
      source: 'fuzzy_match',
    };
    const emptyCategory: CategorySuggestionResult = {
      payeeName: rawPayeeName,
      categoryId: null,
      categoryName: null,
      confidence: 0,
      rationale: 'No heuristic match',
      source: 'fuzzy_match',
    };

    const bestMatch = payeeMatcher.findBestMatch(rawPayeeName, fuzzyMatchCandidates);

    if (this.payeeMatchCache) {
      const cachedPayee = this.payeeMatchCache.findByPayee(budgetId, rawPayeeName);
      if (cachedPayee) {
        const payeeResult: PayeeSuggestionResult = {
          payeeName: rawPayeeName,
          canonicalPayeeId: cachedPayee.canonicalPayeeId,
          canonicalPayeeName: cachedPayee.canonicalPayeeName,
          confidence: cachedPayee.confidence,
          rationale: `Cached: ${cachedPayee.source === 'user_approved' ? 'Previously approved' : 'High-confidence match'}`,
          source: 'cache',
        };

        if (this.payeeCache) {
          const cachedCategory = this.payeeCache.findByPayee(
            budgetId,
            cachedPayee.canonicalPayeeName
          );
          if (cachedCategory) {
            return {
              payee: payeeResult,
              category: {
                payeeName: rawPayeeName,
                categoryId: cachedCategory.categoryId,
                categoryName: cachedCategory.categoryName,
                confidence: cachedCategory.confidence,
                rationale: `Cached: ${cachedCategory.source === 'user_approved' ? 'Previously approved' : 'High-confidence AI'}`,
                source: 'cache',
              },
            };
          }
        }

        if (bestMatch) {
          return {
            payee: payeeResult,
            category: {
              payeeName: rawPayeeName,
              categoryId: bestMatch.categoryId,
              categoryName: bestMatch.categoryName,
              confidence: bestMatch.score / 100,
              rationale: `Heuristic match: "${bestMatch.payeeName}" (${bestMatch.score}%)`,
              source: 'fuzzy_match',
            },
          };
        }

        return {
          payee: payeeResult,
          category: {
            ...emptyCategory,
            rationale: 'No heuristic category match',
          },
        };
      }
    }

    if (bestMatch) {
      return {
        payee: {
          payeeName: rawPayeeName,
          canonicalPayeeId: bestMatch.payeeId ?? null,
          canonicalPayeeName: bestMatch.payeeName,
          confidence: bestMatch.score / 100,
          rationale: `Heuristic match: "${bestMatch.payeeName}" (${bestMatch.score}%)`,
          source: 'fuzzy_match',
        },
        category: {
          payeeName: rawPayeeName,
          categoryId: bestMatch.categoryId,
          categoryName: bestMatch.categoryName,
          confidence: bestMatch.score / 100,
          rationale: `Heuristic match: "${bestMatch.payeeName}" (${bestMatch.score}%)`,
          source: 'fuzzy_match',
        },
      };
    }

    return { payee: emptyPayee, category: emptyCategory };
  }

  /**
   * Get category suggestion for a known payee (from cache or fuzzy match)
   */
  private async getCategorySuggestionForPayee(
    rawPayeeName: string,
    canonicalPayeeName: string,
    categories: Category[],
    budgetId: string,
    fuzzyMatchCandidates: PayeeCandidate[]
  ): Promise<CategorySuggestionResult> {
    // Check payee->category cache
    if (this.payeeCache) {
      const cachedCategory = this.payeeCache.findByPayee(budgetId, canonicalPayeeName);
      if (cachedCategory) {
        return {
          payeeName: rawPayeeName,
          categoryId: cachedCategory.categoryId,
          categoryName: cachedCategory.categoryName,
          confidence: cachedCategory.confidence,
          rationale: `Cached: ${cachedCategory.source === 'user_approved' ? 'Previously approved' : 'High-confidence AI'}`,
          source: 'cache',
        };
      }
    }

    // Find similar payees to provide context
    const similarPayees = payeeMatcher
      .findMatches(canonicalPayeeName, fuzzyMatchCandidates, 60)
      .slice(0, 3)
      .map((m) => ({
        payeeName: m.payeeName,
        categoryName: m.categoryName,
        categoryId: m.categoryId,
      }));

    // Similar payees provide context hints in the prompt
    return this.suggestCategory(rawPayeeName, canonicalPayeeName, categories, similarPayees);
  }

  /**
   * Generate suggestions for payees - one set of LLM calls per unique payee
   * Creates independent payee and category suggestions
   */
  private async generateBatchSuggestions(
    budgetId: string,
    payeeNames: string[],
    transactionsByPayee: Map<string, Transaction[]>,
    categories: Category[],
    useAI = true
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const payeeMatchesToCache: Array<{
      budgetId: string;
      rawPayeeName: string;
      canonicalPayeeId?: string | null;
      canonicalPayeeName: string;
      confidence: number;
      source: 'user_approved' | 'high_confidence_ai' | 'fuzzy_match';
    }> = [];
    const categoryMappingsToCache: Array<{
      budgetId: string;
      payeeName: string;
      categoryId: string;
      categoryName: string;
      confidence: number;
      source: 'user_approved' | 'high_confidence_ai';
    }> = [];

    logger.info('Processing payees with independent payee/category suggestions', {
      payeeCount: payeeNames.length,
      useAI,
    });

    // Build fuzzy match candidates pool
    const fuzzyMatchCandidates = await this.buildFuzzyMatchCandidates(budgetId);
    logger.info('Fuzzy match candidates loaded', { candidateCount: fuzzyMatchCandidates.length });

    // Track stats
    let cacheHits = 0;
    let fuzzyMatchHits = 0;
    let aiCalls = 0;

    // Process each payee sequentially
    for (let i = 0; i < payeeNames.length; i++) {
      const payeeName = payeeNames[i];
      const txns = transactionsByPayee.get(payeeName) || [];

      logger.info(`Processing payee ${i + 1}/${payeeNames.length}`, {
        payeeName,
        transactionCount: txns.length,
      });

      // Generate combined suggestion
      const result = await this.generateCombinedSuggestion(
        payeeName,
        categories,
        fuzzyMatchCandidates,
        budgetId,
        useAI
      );

      // Track source
      if (result.payee.source === 'cache') {
        cacheHits++;
      } else if (result.payee.source === 'fuzzy_match') {
        fuzzyMatchHits++;
      } else if (useAI) {
        aiCalls++;
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
          currentPayeeId: null, // Would need to look up from actual budget

          // Payee suggestion
          proposedPayeeId: result.payee.canonicalPayeeId,
          proposedPayeeName: result.payee.canonicalPayeeName,
          payeeConfidence: result.payee.confidence,
          payeeRationale: result.payee.rationale,
          payeeStatus: result.payee.canonicalPayeeName ? 'pending' : 'skipped',

          // Category suggestion
          proposedCategoryId: result.category.categoryId,
          proposedCategoryName: result.category.categoryName,
          categoryConfidence: result.category.confidence,
          categoryRationale: result.category.rationale,
          categoryStatus: 'pending',
        });
        this.suggestionRepo.save(suggestion);
        suggestions.push(suggestion);
      }

      // Cache high-confidence payee matches
      if (
        result.payee.canonicalPayeeName &&
        result.payee.confidence >= HIGH_CONFIDENCE_THRESHOLD &&
        result.payee.source !== 'cache'
      ) {
        payeeMatchesToCache.push({
          budgetId,
          rawPayeeName: payeeName,
          canonicalPayeeId: result.payee.canonicalPayeeId,
          canonicalPayeeName: result.payee.canonicalPayeeName,
          confidence: result.payee.confidence,
          source: result.payee.source === 'fuzzy_match' ? 'fuzzy_match' : 'high_confidence_ai',
        });
      }

      // Cache high-confidence category mappings
      if (
        useAI &&
        result.category.categoryId &&
        result.category.confidence >= HIGH_CONFIDENCE_THRESHOLD &&
        result.category.source !== 'cache'
      ) {
        categoryMappingsToCache.push({
          budgetId,
          payeeName: result.payee.canonicalPayeeName || payeeName,
          categoryId: result.category.categoryId,
          categoryName: result.category.categoryName || 'Unknown',
          confidence: result.category.confidence,
          source: 'high_confidence_ai',
        });
      }
    }

    // Batch save to caches
    if (this.payeeMatchCache && payeeMatchesToCache.length > 0) {
      this.payeeMatchCache.saveBatch(payeeMatchesToCache);
      logger.info('Cached high-confidence payee matches', { count: payeeMatchesToCache.length });
    }

    if (this.payeeCache && categoryMappingsToCache.length > 0) {
      this.payeeCache.saveBatch(categoryMappingsToCache);
      logger.info('Cached high-confidence category mappings', {
        count: categoryMappingsToCache.length,
      });
    }

    logger.info('Finished processing all payees', {
      payeeCount: payeeNames.length,
      suggestionsCount: suggestions.length,
      cacheHits,
      fuzzyMatchHits,
      aiCalls,
      payeeMatchesCached: payeeMatchesToCache.length,
      categoryMappingsCached: categoryMappingsToCache.length,
    });

    return suggestions;
  }

  /**
   * Get all suggestions for a budget
   */
  async getSuggestionsByBudgetId(budgetId: string): Promise<Suggestion[]> {
    const transactions = await this.actualBudget.getTransactions();
    const uncategorizedTransactionIds = new Set(
      transactions.filter((txn) => txn.categoryId === null && !txn.isTransfer).map((txn) => txn.id)
    );
    const resolvedCleaned = this.suggestionRepo.cleanupResolvedSuggestions(
      budgetId,
      uncategorizedTransactionIds
    );
    if (resolvedCleaned > 0) {
      logger.info('Cleaned up resolved suggestions for categorized transactions', {
        count: resolvedCleaned,
      });
    }

    const suggestions = this.suggestionRepo.findByBudgetId(budgetId);
    const existingTxIds = new Set(suggestions.map((s) => s.transactionId));

    const uncategorized = transactions.filter(
      (txn) => txn.categoryId === null && !txn.isTransfer && !existingTxIds.has(txn.id)
    );

    if (uncategorized.length > 0) {
      logger.info('Creating placeholder suggestions for uncategorized transactions', {
        budgetId,
        count: uncategorized.length,
      });
    }

    const placeholders: Suggestion[] = [];
    for (const txn of uncategorized) {
      const placeholder = createSuggestion({
        budgetId,
        transactionId: txn.id,
        transactionAccountId: txn.accountId,
        transactionAccountName: txn.accountName,
        transactionPayee: txn.payeeName,
        transactionAmount: txn.amount,
        transactionDate: txn.date,
        currentCategoryId: txn.categoryId,
        currentPayeeId: txn.payeeId,
        proposedCategoryId: null,
        proposedCategoryName: null,
        categoryConfidence: 0,
        categoryRationale: 'Not generated yet',
        categoryStatus: 'pending',
        payeeStatus: 'skipped',
        payeeConfidence: 0,
        payeeRationale: '',
      });
      this.suggestionRepo.save(placeholder);
      placeholders.push(placeholder);
    }

    return suggestions.concat(placeholders);
  }

  /**
   * Get pending suggestions
   */
  getPendingSuggestions(): Suggestion[] {
    return this.suggestionRepo.findByStatus('pending');
  }

  /**
   * Get uncategorized transactions from the current budget
   */
  async getUncategorizedTransactions(budgetId: string): Promise<Transaction[]> {
    logger.info('Fetching uncategorized transactions', { budgetId });
    const transactions = await this.actualBudget.getTransactions();

    const uncategorized = transactions.filter((txn) => txn.categoryId === null && !txn.isTransfer);

    logger.info('Uncategorized transactions fetched', {
      budgetId,
      count: uncategorized.length,
    });

    return uncategorized;
  }

  /**
   * Approve a suggestion (legacy - approves both payee and category)
   * P7 (Explicit error handling): Throws NotFoundError if suggestion doesn't exist
   */
  approveSuggestion(suggestionId: string): void {
    const suggestion = this.suggestionRepo.findById(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    const hasCategoryProposal =
      Boolean(suggestion.categorySuggestion?.proposedCategoryId) &&
      suggestion.categorySuggestion?.proposedCategoryId !== 'unknown';
    const hasPayeeProposal = Boolean(
      suggestion.payeeSuggestion?.proposedPayeeName &&
      suggestion.payeeSuggestion.proposedPayeeName !== suggestion.transactionPayee
    );

    if (!hasCategoryProposal && !hasPayeeProposal) {
      throw new Error(`Suggestion has no actionable proposal: ${suggestionId}`);
    }

    this.suggestionRepo.updateStatus(suggestionId, 'approved');

    // Cache both payee and category mappings
    this.cacheApprovedPayeeMatch(suggestion);
    this.cacheApprovedCategoryMapping(suggestion);

    this.auditRepo.log({
      eventType: 'suggestion_approved',
      entityType: 'Suggestion',
      entityId: suggestionId,
    });

    logger.info('Suggestion approved (full)', { suggestionId });
  }

  /**
   * Approve only the payee suggestion
   */
  approvePayeeSuggestion(suggestionId: string): void {
    const suggestion = this.suggestionRepo.findById(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    const hasPayeeProposal = Boolean(
      suggestion.payeeSuggestion?.proposedPayeeName &&
      suggestion.payeeSuggestion.proposedPayeeName !== suggestion.transactionPayee
    );
    if (!hasPayeeProposal) {
      throw new Error(`Suggestion has no payee proposal: ${suggestionId}`);
    }

    this.suggestionRepo.updatePayeeStatus(suggestionId, 'approved');
    this.cacheApprovedPayeeMatch(suggestion);

    this.auditRepo.log({
      eventType: 'suggestion_approved',
      entityType: 'Suggestion',
      entityId: suggestionId,
      metadata: { type: 'payee' },
    });

    logger.info('Payee suggestion approved', { suggestionId });
  }

  /**
   * Approve only the category suggestion
   */
  approveCategorySuggestion(suggestionId: string): void {
    const suggestion = this.suggestionRepo.findById(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    const hasCategoryProposal =
      Boolean(suggestion.categorySuggestion?.proposedCategoryId) &&
      suggestion.categorySuggestion?.proposedCategoryId !== 'unknown';
    if (!hasCategoryProposal) {
      throw new Error(`Suggestion has no category proposal: ${suggestionId}`);
    }

    this.suggestionRepo.updateCategoryStatus(suggestionId, 'approved');
    this.cacheApprovedCategoryMapping(suggestion);

    this.auditRepo.log({
      eventType: 'suggestion_approved',
      entityType: 'Suggestion',
      entityId: suggestionId,
      metadata: { type: 'category' },
    });

    logger.info('Category suggestion approved', { suggestionId });
  }

  /**
   * Reject a suggestion (legacy - rejects both payee and category)
   */
  rejectSuggestion(suggestionId: string): void {
    this.suggestionRepo.updateStatus(suggestionId, 'rejected');

    this.auditRepo.log({
      eventType: 'suggestion_rejected',
      entityType: 'Suggestion',
      entityId: suggestionId,
    });

    logger.info('Suggestion rejected (full)', { suggestionId });
  }

  /**
   * Reject payee suggestion with optional correction
   */
  rejectPayeeSuggestion(
    suggestionId: string,
    correction?: { payeeId?: string; payeeName?: string }
  ): void {
    const suggestion = this.suggestionRepo.findById(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    this.suggestionRepo.updatePayeeStatus(suggestionId, 'rejected', correction);

    // If user provided correction, cache it
    if (correction?.payeeName && this.payeeMatchCache) {
      this.payeeMatchCache.save({
        budgetId: suggestion.budgetId,
        rawPayeeName: suggestion.transactionPayee || '',
        canonicalPayeeId: correction.payeeId || null,
        canonicalPayeeName: correction.payeeName,
        confidence: 1.0,
        source: 'user_approved',
      });
      logger.debug('Cached user-corrected payee mapping', {
        rawPayee: suggestion.transactionPayee,
        correctedPayee: correction.payeeName,
      });
    }

    this.auditRepo.log({
      eventType: 'suggestion_rejected',
      entityType: 'Suggestion',
      entityId: suggestionId,
      metadata: { type: 'payee', correction },
    });

    logger.info('Payee suggestion rejected', { suggestionId, withCorrection: !!correction });
  }

  /**
   * Reject category suggestion with optional correction
   */
  rejectCategorySuggestion(
    suggestionId: string,
    correction?: { categoryId?: string; categoryName?: string }
  ): void {
    const suggestion = this.suggestionRepo.findById(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    this.suggestionRepo.updateCategoryStatus(suggestionId, 'rejected', correction);

    // If user provided correction, cache it
    if (correction?.categoryId && this.payeeCache) {
      const payeeName = suggestion.payeeSuggestion.proposedPayeeName || suggestion.transactionPayee;
      if (payeeName) {
        this.payeeCache.save({
          budgetId: suggestion.budgetId,
          payeeName,
          categoryId: correction.categoryId,
          categoryName: correction.categoryName || 'Unknown',
          confidence: 1.0,
          source: 'user_approved',
        });
        logger.debug('Cached user-corrected category mapping', {
          payee: payeeName,
          correctedCategory: correction.categoryName,
        });
      }
    }

    this.auditRepo.log({
      eventType: 'suggestion_rejected',
      entityType: 'Suggestion',
      entityId: suggestionId,
      metadata: { type: 'category', correction },
    });

    logger.info('Category suggestion rejected', { suggestionId, withCorrection: !!correction });
  }

  /**
   * Correct category suggestions and approve the corrected category
   */
  correctCategorySuggestions(
    suggestionIds: string[],
    correction: { categoryId: string; categoryName?: string }
  ): { corrected: number } {
    let corrected = 0;

    for (const suggestionId of suggestionIds) {
      try {
        const suggestion = this.suggestionRepo.findById(suggestionId);
        if (!suggestion) {
          continue;
        }

        this.suggestionRepo.updateCategoryProposal(suggestionId, {
          categoryId: correction.categoryId,
          categoryName: correction.categoryName ?? 'Unknown',
          categoryStatus: 'approved',
          correction,
        });

        if (correction.categoryId && this.payeeCache) {
          const payeeName =
            suggestion.payeeSuggestion.proposedPayeeName || suggestion.transactionPayee;
          if (payeeName) {
            this.payeeCache.save({
              budgetId: suggestion.budgetId,
              payeeName,
              categoryId: correction.categoryId,
              categoryName: correction.categoryName || 'Unknown',
              confidence: 1.0,
              source: 'user_approved',
            });
          }
        }

        this.auditRepo.log({
          eventType: 'suggestion_approved',
          entityType: 'Suggestion',
          entityId: suggestionId,
          metadata: { type: 'category', corrected: true, correction },
        });

        corrected++;
      } catch {
        // Skip suggestions that can't be corrected (e.g., not found)
      }
    }

    logger.info('Category corrections applied', {
      corrected,
      suggestionCount: suggestionIds.length,
    });

    return { corrected };
  }

  /**
   * Correct payee suggestions and approve the corrected payee
   */
  correctPayeeSuggestions(
    suggestionIds: string[],
    correction: { payeeId?: string; payeeName: string }
  ): { corrected: number } {
    let corrected = 0;

    for (const suggestionId of suggestionIds) {
      try {
        const suggestion = this.suggestionRepo.findById(suggestionId);
        if (!suggestion) {
          continue;
        }

        this.suggestionRepo.updatePayeeProposal(suggestionId, {
          payeeId: correction.payeeId ?? null,
          payeeName: correction.payeeName,
          payeeStatus: 'approved',
          correction,
        });

        if (this.payeeMatchCache) {
          this.payeeMatchCache.save({
            budgetId: suggestion.budgetId,
            rawPayeeName: suggestion.transactionPayee || '',
            canonicalPayeeId: correction.payeeId || null,
            canonicalPayeeName: correction.payeeName,
            confidence: 1.0,
            source: 'user_approved',
          });
        }

        this.auditRepo.log({
          eventType: 'suggestion_approved',
          entityType: 'Suggestion',
          entityId: suggestionId,
          metadata: { type: 'payee', corrected: true, correction },
        });

        corrected++;
      } catch {
        // Skip suggestions that can't be corrected (e.g., not found)
      }
    }

    logger.info('Payee corrections applied', { corrected, suggestionCount: suggestionIds.length });

    return { corrected };
  }

  /**
   * Reset a suggestion back to pending status
   * Allows users to undo an approve/reject action
   */
  resetSuggestion(suggestionId: string): void {
    const suggestion = this.suggestionRepo.findById(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    // Reset both payee and category status back to pending (or skipped if no suggestion)
    const newPayeeStatus: SuggestionComponentStatus = suggestion.payeeSuggestion?.proposedPayeeName
      ? 'pending'
      : 'skipped';
    const newCategoryStatus: SuggestionComponentStatus = 'pending';

    this.suggestionRepo.updatePayeeStatus(suggestionId, newPayeeStatus);
    this.suggestionRepo.updateCategoryStatus(suggestionId, newCategoryStatus);
    this.suggestionRepo.updateStatus(suggestionId, 'pending');

    this.auditRepo.log({
      eventType: 'suggestion_reset',
      entityType: 'Suggestion',
      entityId: suggestionId,
    });

    logger.info('Suggestion reset to pending', { suggestionId });
  }

  /**
   * Retry LLM suggestion for a specific suggestion
   * Deletes the existing suggestion and regenerates it using AI
   */
  async retrySuggestion(suggestionId: string, useAI = true): Promise<Suggestion> {
    const existing = this.suggestionRepo.findById(suggestionId);
    if (!existing) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    logger.info('Retrying suggestion', {
      suggestionId,
      payee: existing.transactionPayee,
      budgetId: existing.budgetId,
    });

    const payeeName = existing.transactionPayee || 'Unknown';
    let payeeResult: PayeeSuggestionResult;
    let categoryResult: CategorySuggestionResult;

    if (useAI) {
      // Fetch categories from budget
      const categories = await this.actualBudget.getCategories();

      // Force regeneration using AI (bypass cache by calling AI directly)
      // First identify the payee
      payeeResult = await this.identifyPayee(payeeName);

      // Then suggest category with web search
      categoryResult = await this.suggestCategory(
        payeeName,
        payeeResult.canonicalPayeeName,
        categories,
        [] // No matched payees - force fresh AI suggestion
      );
    } else {
      const categories = await this.actualBudget.getCategories();
      const fuzzyMatchCandidates = await this.buildFuzzyMatchCandidates(existing.budgetId);
      const heuristic = await this.generateCombinedSuggestion(
        payeeName,
        categories,
        fuzzyMatchCandidates,
        existing.budgetId,
        false
      );
      payeeResult = heuristic.payee;
      categoryResult = heuristic.category;
    }

    // Update the suggestion with new values
    const updated = createSuggestion({
      budgetId: existing.budgetId,
      transactionId: existing.transactionId,
      transactionAccountId: existing.transactionAccountId,
      transactionAccountName: existing.transactionAccountName,
      transactionPayee: existing.transactionPayee,
      transactionAmount: existing.transactionAmount,
      transactionDate: existing.transactionDate,
      currentCategoryId: existing.currentCategoryId,
      currentPayeeId: existing.currentPayeeId,

      // Payee suggestion from retry
      proposedPayeeId: payeeResult.canonicalPayeeId,
      proposedPayeeName: payeeResult.canonicalPayeeName,
      payeeConfidence: payeeResult.confidence,
      payeeRationale: `Retry: ${payeeResult.rationale}`,
      payeeStatus: payeeResult.canonicalPayeeName ? 'pending' : 'skipped',

      // Category suggestion from retry
      proposedCategoryId: categoryResult.categoryId,
      proposedCategoryName: categoryResult.categoryName,
      categoryConfidence: categoryResult.confidence,
      categoryRationale: `Retry: ${categoryResult.rationale}`,
      categoryStatus: 'pending',
    });

    // Keep the same ID for the updated suggestion
    const updatedWithId: Suggestion = { ...updated, id: existing.id };

    this.suggestionRepo.save(updatedWithId);

    this.auditRepo.log({
      eventType: 'suggestion_retried',
      entityType: 'Suggestion',
      entityId: suggestionId,
      metadata: {
        oldConfidence: existing.confidence,
        newConfidence: updatedWithId.confidence,
      },
    });

    logger.info('Suggestion retried successfully', {
      suggestionId,
      oldConfidence: existing.confidence,
      newConfidence: updatedWithId.confidence,
    });

    return updatedWithId;
  }

  /**
   * Retry LLM suggestions for all suggestions with the same payee in a budget
   * This is useful when suggestions are grouped by payee in the UI
   */
  async retryPayeeGroup(suggestionId: string, useAI = true): Promise<Suggestion[]> {
    const existing = this.suggestionRepo.findById(suggestionId);
    if (!existing) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    const payeeName = existing.transactionPayee;
    if (!payeeName) {
      // If no payee name, just retry the single suggestion
      return [await this.retrySuggestion(suggestionId, useAI)];
    }

    // Find all pending suggestions with the same payee
    const allSuggestions = this.suggestionRepo.findByBudgetId(existing.budgetId);
    const payeeGroup = allSuggestions.filter(
      (s) => s.transactionPayee === payeeName && s.status === 'pending'
    );

    if (payeeGroup.length === 0) {
      // No pending suggestions, just retry the one
      return [await this.retrySuggestion(suggestionId)];
    }

    logger.info('Retrying payee group', {
      payeeName,
      suggestionCount: payeeGroup.length,
      budgetId: existing.budgetId,
    });

    const categories = await this.actualBudget.getCategories();
    let payeeResult: PayeeSuggestionResult;
    let categoryResult: CategorySuggestionResult;

    if (useAI) {
      // Generate new suggestion once (same for all transactions with this payee)
      payeeResult = await this.identifyPayee(payeeName);
      categoryResult = await this.suggestCategory(
        payeeName,
        payeeResult.canonicalPayeeName,
        categories,
        [] // No matched payees - force fresh AI suggestion
      );
    } else {
      const fuzzyMatchCandidates = await this.buildFuzzyMatchCandidates(existing.budgetId);
      const heuristic = await this.generateCombinedSuggestion(
        payeeName,
        categories,
        fuzzyMatchCandidates,
        existing.budgetId,
        false
      );
      payeeResult = heuristic.payee;
      categoryResult = heuristic.category;
    }

    // Update all suggestions in the group
    const updatedSuggestions: Suggestion[] = [];
    for (const suggestion of payeeGroup) {
      const updated = createSuggestion({
        budgetId: suggestion.budgetId,
        transactionId: suggestion.transactionId,
        transactionAccountId: suggestion.transactionAccountId,
        transactionAccountName: suggestion.transactionAccountName,
        transactionPayee: suggestion.transactionPayee,
        transactionAmount: suggestion.transactionAmount,
        transactionDate: suggestion.transactionDate,
        currentCategoryId: suggestion.currentCategoryId,
        currentPayeeId: suggestion.currentPayeeId,

        // Payee suggestion from retry
        proposedPayeeId: payeeResult.canonicalPayeeId,
        proposedPayeeName: payeeResult.canonicalPayeeName,
        payeeConfidence: payeeResult.confidence,
        payeeRationale: `Retry: ${payeeResult.rationale}`,
        payeeStatus: payeeResult.canonicalPayeeName ? 'pending' : 'skipped',

        // Category suggestion from retry
        proposedCategoryId: categoryResult.categoryId,
        proposedCategoryName: categoryResult.categoryName,
        categoryConfidence: categoryResult.confidence,
        categoryRationale: `Retry: ${categoryResult.rationale}`,
        categoryStatus: 'pending',
      });

      // Keep the same ID
      const updatedWithId: Suggestion = { ...updated, id: suggestion.id };
      this.suggestionRepo.save(updatedWithId);
      updatedSuggestions.push(updatedWithId);
    }

    this.auditRepo.log({
      eventType: 'suggestion_retried',
      entityType: 'Suggestion',
      entityId: suggestionId,
      metadata: {
        payeeName,
        count: updatedSuggestions.length,
        newConfidence: categoryResult.confidence,
      },
    });

    logger.info('Payee group retried successfully', {
      payeeName,
      count: updatedSuggestions.length,
      newConfidence: categoryResult.confidence,
    });

    return updatedSuggestions;
  }

  /**
   * Cache approved payee match
   */
  private cacheApprovedPayeeMatch(suggestion: Suggestion): void {
    if (
      this.payeeMatchCache &&
      suggestion.transactionPayee &&
      suggestion.payeeSuggestion.proposedPayeeName
    ) {
      this.payeeMatchCache.save({
        budgetId: suggestion.budgetId,
        rawPayeeName: suggestion.transactionPayee,
        canonicalPayeeId: suggestion.payeeSuggestion.proposedPayeeId,
        canonicalPayeeName: suggestion.payeeSuggestion.proposedPayeeName,
        confidence: 1.0,
        source: 'user_approved',
      });
      logger.debug('Cached user-approved payee match', {
        rawPayee: suggestion.transactionPayee,
        canonicalPayee: suggestion.payeeSuggestion.proposedPayeeName,
      });
    }
  }

  /**
   * Cache approved category mapping
   */
  private cacheApprovedCategoryMapping(suggestion: Suggestion): void {
    if (
      this.payeeCache &&
      suggestion.categorySuggestion.proposedCategoryId &&
      suggestion.categorySuggestion.proposedCategoryId !== 'unknown'
    ) {
      const payeeName = suggestion.payeeSuggestion.proposedPayeeName || suggestion.transactionPayee;
      if (payeeName) {
        this.payeeCache.save({
          budgetId: suggestion.budgetId,
          payeeName,
          categoryId: suggestion.categorySuggestion.proposedCategoryId,
          categoryName: suggestion.categorySuggestion.proposedCategoryName || 'Unknown',
          confidence: 1.0,
          source: 'user_approved',
        });
        logger.debug('Cached user-approved category mapping', {
          payee: payeeName,
          category: suggestion.categorySuggestion.proposedCategoryName,
        });
      }
    }
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
    fullSnapshot = false,
    useAI = true
  ): Promise<Suggestion[]> {
    logger.info('Syncing and generating suggestions', { budgetId, fullSnapshot, useAI });

    // Sync latest data from Actual Budget server
    await this.actualBudget.sync();

    // If full snapshot mode (e.g., after redownload), use full generation
    if (fullSnapshot) {
      logger.info('Full snapshot mode enabled, generating all suggestions');
      return this.generateSuggestions(budgetId, useAI);
    }

    // Fetch current budget state
    const [transactions, categories] = await Promise.all([
      this.actualBudget.getTransactions(),
      this.actualBudget.getCategories(),
    ]);

    // Cleanup orphaned suggestions (transactions that no longer exist in budget)
    const validTransactionIds = new Set(transactions.map((t) => t.id));
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

    const existingTransactionIds = new Set(successfulSuggestions.map((s) => s.transactionId));

    // Filter to only new uncategorized transactions without suggestions
    const uncategorized = transactions.filter(
      (txn) => txn.categoryId === null && !existingTransactionIds.has(txn.id) && !txn.isTransfer
    );

    const transferSkipped = transactions.filter((txn) => txn.isTransfer).length;
    if (transferSkipped > 0) {
      logger.info('Skipped transfer transactions during diff-based generation', {
        count: transferSkipped,
      });
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
    const { cached: cachedCategories, uncached } = await this.checkPayeeCategoryCache(
      budgetId,
      uniquePayees
    );

    logger.info(`Diff sync: ${cachedCategories.size} cached, ${uncached.length} need LLM`);

    // Create suggestions from cache
    const suggestions: Suggestion[] = [];

    for (const [payeeName, cacheEntry] of cachedCategories) {
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
          currentPayeeId: null,

          // Payee - skip for cached
          payeeStatus: 'skipped',

          // Category from cache
          proposedCategoryId: cacheEntry.categoryId,
          proposedCategoryName: cacheEntry.categoryName,
          categoryConfidence: cacheEntry.confidence,
          categoryRationale: `Cached: ${cacheEntry.source === 'user_approved' ? 'Previously approved by user' : 'High-confidence AI suggestion'}`,
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
        categories,
        useAI
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
        cacheHits: cachedCategories.size,
        llmCalls: useAI && uncached.length > 0 ? 1 : 0,
        mode: 'diff',
      },
    });

    logger.info('Diff-based suggestions generated', {
      count: suggestions.length,
      cacheHits: cachedCategories.size,
      llmPayees: useAI ? uncached.length : 0,
      useAI,
      budgetId,
    });

    return suggestions;
  }
}
