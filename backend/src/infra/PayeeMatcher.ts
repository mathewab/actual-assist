import * as fuzz from 'fuzzball';

/**
 * Fuzzy match result with combined scoring
 */
export interface FuzzyMatchResult {
  payeeName: string;
  categoryId: string;
  categoryName: string;
  score: number;
  wRatioScore: number;
  tokenSetScore: number;
  jaroWinklerScore: number;
  normalizedQuery: string;
  normalizedMatch: string;
}

/**
 * Candidate payee for matching
 */
export interface PayeeCandidate {
  payeeName: string;
  payeeNameOriginal: string;
  categoryId: string;
  categoryName: string;
}

/**
 * Thresholds for fuzzy matching decisions
 */
export const FUZZY_THRESHOLDS = {
  /** Score >= this means high confidence match, send to LLM for verification */
  HIGH_CONFIDENCE: 85,
  /** Score >= this means potential match, include in LLM disambiguation list */
  MINIMUM_CANDIDATE: 50,
  /** Maximum candidates to send to LLM for disambiguation */
  MAX_DISAMBIGUATION_CANDIDATES: 5,
} as const;

/**
 * Scoring weights for combined fuzzy score
 * WRatio: Best at handling different lengths and partial matches
 * TokenSet: Best for reordered words (e.g., "Amazon Prime" vs "Prime Amazon")
 * JaroWinkler: Best for prefix similarity (common in merchant names)
 */
const SCORING_WEIGHTS = {
  wRatio: 0.4,
  tokenSet: 0.3,
  jaroWinkler: 0.3,
} as const;

/**
 * Alias dictionary for common merchant name variations
 * Maps normalized variations to canonical names
 */
const PAYEE_ALIASES: Record<string, string[]> = {
  // E-commerce
  amazon: [
    'amzn',
    'amz',
    'amazon prime',
    'amazon.com',
    'amzn mktp',
    'amazon marketplace',
    'prime video',
    'prime now',
  ],
  walmart: ['wal-mart', 'wm supercenter', 'walmrt', 'walmart.com', 'walmart grocery'],
  target: ['target.com', 'tgt', 'target store'],
  costco: ['costco wholesale', 'costco.com', 'costco gas'],
  ebay: ['ebay.com', 'ebay inc'],

  // Food & Restaurants
  mcdonalds: ['mcdonald', 'mcd', 'mcdonalds restaurant', "mcdonald's"],
  starbucks: ['starbucks coffee', 'sbux', 'starbucks store'],
  chipotle: ['chipotle mexican', 'chipotle mexican grill'],
  'uber eats': ['ubereats', 'uber eat'],
  doordash: ['door dash', 'doordash inc'],
  grubhub: ['grub hub', 'seamless'],

  // Ride-sharing & Transport
  uber: ['uber trip', 'uber technologies', 'uber ride'],
  lyft: ['lyft ride', 'lyft inc'],

  // Streaming & Entertainment
  netflix: ['netflix.com', 'netflix inc'],
  spotify: ['spotify usa', 'spotify ab'],
  apple: ['apple.com', 'apple store', 'itunes', 'apple music', 'apple tv'],
  google: ['google.com', 'google play', 'google one', 'google cloud', 'goog'],
  microsoft: ['msft', 'microsoft corp', 'microsoft 365', 'xbox', 'azure'],
  hulu: ['hulu llc', 'hulu.com'],
  disney: ['disney+', 'disney plus', 'walt disney'],

  // Utilities & Services
  att: ['at&t', 'at and t', 'att wireless', 'att uverse'],
  verizon: ['verizon wireless', 'vzw', 'verizon fios'],
  't-mobile': ['tmobile', 't mobile', 'metro pcs', 'metro by t-mobile'],
  comcast: ['xfinity', 'comcast cable'],

  // Gas Stations
  shell: ['shell oil', 'shell gas'],
  chevron: ['chevron gas', 'chevron station'],
  exxon: ['exxonmobil', 'exxon mobil', 'mobil'],
  bp: ['bp gas', 'bp station', 'british petroleum'],

  // Grocery
  kroger: ['kroger fuel', 'krogers', 'kroger pharmacy'],
  'whole foods': ['wholefoods', 'whole foods market', 'wfm'],
  'trader joes': ['trader joe', "trader joe's", 'traderjoes'],
  safeway: ['safeway inc', 'safeway fuel'],
  publix: ['publix super', 'publix supermarket'],

  // Pharmacies
  cvs: ['cvs pharmacy', 'cvs health', 'cvs store'],
  walgreens: ['walgreen', 'walgreens pharmacy'],
  'rite aid': ['riteaid', 'rite aid pharmacy'],

  // Payment processors (often appear in transaction names)
  paypal: ['paypal payment', 'paypal inc', 'pp*'],
  venmo: ['venmo payment', 'venmo inc'],
  square: ['sq *', 'square inc', 'cash app'],
  stripe: ['stripe payment', 'stripe inc'],

  // Airlines
  'united airlines': ['united air', 'ual', 'united.com'],
  'american airlines': ['american air', 'aa.com', 'aa airlines'],
  delta: ['delta air', 'delta airlines', 'delta.com'],
  southwest: ['southwest air', 'southwest airlines', 'swa'],
};

/**
 * PayeeMatcher - Fuzzy matching for payee names
 *
 * Uses a combination of scoring algorithms for robust matching:
 * - WRatio: Weighted ratio, handles length differences well
 * - Token Set: Ignores word order, good for "Amazon Prime" vs "Prime Amazon"
 * - Jaro-Winkler: Prefix-weighted, good for merchant name variations
 */
export class PayeeMatcher {
  private aliasMap: Map<string, string>;

  constructor() {
    // Build reverse alias map for quick lookup
    this.aliasMap = new Map();
    for (const [canonical, aliases] of Object.entries(PAYEE_ALIASES)) {
      const normalizedCanonical = this.normalize(canonical);
      for (const alias of aliases) {
        this.aliasMap.set(this.normalize(alias), normalizedCanonical);
      }
      // Also map canonical to itself
      this.aliasMap.set(normalizedCanonical, normalizedCanonical);
    }
  }

  /**
   * Normalize a payee name for comparison
   * - Lowercase
   * - Remove special characters except spaces
   * - Collapse multiple spaces
   * - Trim
   */
  normalize(payeeName: string): string {
    return payeeName
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ') // Replace special chars with space
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();
  }

  /**
   * Get canonical name for a payee using alias dictionary
   * Returns the input if no alias match found
   */
  getCanonicalName(payeeName: string): string {
    const normalized = this.normalize(payeeName);

    // Check direct alias match
    const canonical = this.aliasMap.get(normalized);
    if (canonical) {
      return canonical;
    }

    // Check if normalized name starts with any known alias
    for (const [alias, canon] of this.aliasMap.entries()) {
      if (normalized.startsWith(alias) || alias.startsWith(normalized)) {
        return canon;
      }
    }

    return normalized;
  }

  /**
   * Calculate combined fuzzy score between two strings
   */
  private calculateScore(
    query: string,
    candidate: string
  ): {
    combined: number;
    wRatio: number;
    tokenSet: number;
    jaroWinkler: number;
  } {
    // fuzzball scores are 0-100
    const wRatio = fuzz.ratio(query, candidate);
    const tokenSet = fuzz.token_set_ratio(query, candidate);

    // Jaro-Winkler needs manual calculation or use partial_ratio as proxy
    // fuzzball doesn't have direct jaro-winkler, use partial_ratio which is similar for prefixes
    const jaroWinkler = fuzz.partial_ratio(query, candidate);

    const combined =
      wRatio * SCORING_WEIGHTS.wRatio +
      tokenSet * SCORING_WEIGHTS.tokenSet +
      jaroWinkler * SCORING_WEIGHTS.jaroWinkler;

    return {
      combined: Math.round(combined),
      wRatio,
      tokenSet,
      jaroWinkler,
    };
  }

  /**
   * Find best fuzzy matches for a payee name against a list of candidates
   *
   * @param queryPayee - The payee name to match
   * @param candidates - List of known payees with categories
   * @param minScore - Minimum score to include in results (default: MINIMUM_CANDIDATE)
   * @returns Sorted list of matches (best first), filtered by minScore
   */
  findMatches(
    queryPayee: string,
    candidates: PayeeCandidate[],
    minScore: number = FUZZY_THRESHOLDS.MINIMUM_CANDIDATE
  ): FuzzyMatchResult[] {
    const normalizedQuery = this.normalize(queryPayee);
    const canonicalQuery = this.getCanonicalName(queryPayee);

    const results: FuzzyMatchResult[] = [];

    for (const candidate of candidates) {
      const normalizedCandidate = this.normalize(candidate.payeeName);
      const canonicalCandidate = this.getCanonicalName(candidate.payeeName);

      // Score against both normalized and canonical names, take best
      const scoreNormalized = this.calculateScore(normalizedQuery, normalizedCandidate);
      const scoreCanonical = this.calculateScore(canonicalQuery, canonicalCandidate);

      const bestScore =
        scoreNormalized.combined >= scoreCanonical.combined ? scoreNormalized : scoreCanonical;

      // Bonus for matching canonical names (alias dictionary hit)
      let finalScore = bestScore.combined;
      if (canonicalQuery === canonicalCandidate && canonicalQuery !== normalizedQuery) {
        // Alias match bonus: boost score by 10 points (capped at 100)
        finalScore = Math.min(100, finalScore + 10);
      }

      if (finalScore >= minScore) {
        results.push({
          payeeName: candidate.payeeNameOriginal,
          categoryId: candidate.categoryId,
          categoryName: candidate.categoryName,
          score: finalScore,
          wRatioScore: bestScore.wRatio,
          tokenSetScore: bestScore.tokenSet,
          jaroWinklerScore: bestScore.jaroWinkler,
          normalizedQuery,
          normalizedMatch: normalizedCandidate,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Find the best match for a payee name
   * Returns null if no match meets the minimum threshold
   */
  findBestMatch(
    queryPayee: string,
    candidates: PayeeCandidate[],
    minScore: number = FUZZY_THRESHOLDS.MINIMUM_CANDIDATE
  ): FuzzyMatchResult | null {
    const matches = this.findMatches(queryPayee, candidates, minScore);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Check if there's a high-confidence match
   * Returns the match if score >= HIGH_CONFIDENCE threshold
   */
  findHighConfidenceMatch(
    queryPayee: string,
    candidates: PayeeCandidate[]
  ): FuzzyMatchResult | null {
    const best = this.findBestMatch(queryPayee, candidates, FUZZY_THRESHOLDS.HIGH_CONFIDENCE);
    return best;
  }

  /**
   * Get candidates for LLM disambiguation
   * Returns matches between MINIMUM_CANDIDATE and HIGH_CONFIDENCE thresholds
   */
  getCandidatesForDisambiguation(
    queryPayee: string,
    candidates: PayeeCandidate[]
  ): FuzzyMatchResult[] {
    const matches = this.findMatches(queryPayee, candidates, FUZZY_THRESHOLDS.MINIMUM_CANDIDATE);

    // Filter to only include candidates below high confidence
    // (high confidence matches should be verified differently)
    const disambiguation = matches
      .filter((m) => m.score < FUZZY_THRESHOLDS.HIGH_CONFIDENCE)
      .slice(0, FUZZY_THRESHOLDS.MAX_DISAMBIGUATION_CANDIDATES);

    return disambiguation;
  }
}

// Singleton instance for convenience
export const payeeMatcher = new PayeeMatcher();
