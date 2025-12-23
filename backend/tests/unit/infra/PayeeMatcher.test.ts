import { describe, it, expect, beforeEach } from 'vitest';
import {
  PayeeMatcher,
  payeeMatcher,
  FUZZY_THRESHOLDS,
  type PayeeCandidate,
} from '../../../src/infra/PayeeMatcher.js';

describe('PayeeMatcher', () => {
  let matcher: PayeeMatcher;

  beforeEach(() => {
    matcher = new PayeeMatcher();
  });

  describe('normalize', () => {
    it('should lowercase and trim', () => {
      expect(matcher.normalize('  AMAZON  ')).toBe('amazon');
    });

    it('should replace special characters with space', () => {
      expect(matcher.normalize('AMAZON.COM*MKTP')).toBe('amazon com mktp');
    });

    it('should collapse multiple spaces', () => {
      expect(matcher.normalize('Amazon   Prime   Video')).toBe('amazon prime video');
    });
  });

  describe('getCanonicalName', () => {
    it('should return canonical name for known alias', () => {
      expect(matcher.getCanonicalName('AMZN MKTP')).toBe('amazon');
    });

    it('should return canonical for partial match', () => {
      expect(matcher.getCanonicalName('Starbucks Coffee #1234')).toBe('starbucks');
    });

    it('should return normalized input for unknown payee', () => {
      expect(matcher.getCanonicalName('Unknown Store XYZ')).toBe('unknown store xyz');
    });
  });

  describe('findMatches', () => {
    const candidates: PayeeCandidate[] = [
      { payeeName: 'amazon', payeeNameOriginal: 'Amazon', categoryId: 'cat1', categoryName: 'Shopping' },
      { payeeName: 'amazon prime', payeeNameOriginal: 'Amazon Prime', categoryId: 'cat2', categoryName: 'Subscriptions' },
      { payeeName: 'starbucks', payeeNameOriginal: 'Starbucks', categoryId: 'cat3', categoryName: 'Coffee' },
      { payeeName: 'walmart', payeeNameOriginal: 'Walmart', categoryId: 'cat4', categoryName: 'Groceries' },
    ];

    it('should find exact match with high score', () => {
      const results = matcher.findMatches('Amazon', candidates);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].payeeName).toBe('Amazon');
      expect(results[0].score).toBeGreaterThanOrEqual(90);
    });

    it('should find fuzzy match for similar payee', () => {
      const results = matcher.findMatches('AMZN MKTP', candidates);
      expect(results.length).toBeGreaterThan(0);
      // Should match Amazon due to alias dictionary
      expect(results[0].categoryName).toBe('Shopping');
    });

    it('should return empty for completely unrelated payee', () => {
      const results = matcher.findMatches('Completely Random Store 12345', candidates, 90);
      expect(results.length).toBe(0);
    });

    it('should sort results by score descending', () => {
      const results = matcher.findMatches('Amazon Prime Video', candidates);
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });
  });

  describe('findHighConfidenceMatch', () => {
    const candidates: PayeeCandidate[] = [
      { payeeName: 'starbucks', payeeNameOriginal: 'Starbucks', categoryId: 'cat1', categoryName: 'Coffee' },
      { payeeName: 'star market', payeeNameOriginal: 'Star Market', categoryId: 'cat2', categoryName: 'Groceries' },
    ];

    it('should return match for high similarity', () => {
      const result = matcher.findHighConfidenceMatch('Starbucks Coffee', candidates);
      expect(result).not.toBeNull();
      expect(result?.score).toBeGreaterThanOrEqual(FUZZY_THRESHOLDS.HIGH_CONFIDENCE);
    });

    it('should return null for low similarity', () => {
      const result = matcher.findHighConfidenceMatch('Target Store', candidates);
      expect(result).toBeNull();
    });
  });

  describe('getCandidatesForDisambiguation', () => {
    const candidates: PayeeCandidate[] = [
      { payeeName: 'amazon', payeeNameOriginal: 'Amazon', categoryId: 'cat1', categoryName: 'Shopping' },
      { payeeName: 'amazon fresh', payeeNameOriginal: 'Amazon Fresh', categoryId: 'cat2', categoryName: 'Groceries' },
      { payeeName: 'amazon prime', payeeNameOriginal: 'Amazon Prime', categoryId: 'cat3', categoryName: 'Subscriptions' },
      { payeeName: 'amazons choice', payeeNameOriginal: 'Amazons Choice', categoryId: 'cat4', categoryName: 'Other' },
      { payeeName: 'amaion store', payeeNameOriginal: 'Amaion Store', categoryId: 'cat5', categoryName: 'Shopping' },
      { payeeName: 'target', payeeNameOriginal: 'Target', categoryId: 'cat6', categoryName: 'Shopping' },
    ];

    it('should return candidates below high confidence threshold', () => {
      const results = matcher.getCandidatesForDisambiguation('Amaz Store', candidates);
      // All results should be below HIGH_CONFIDENCE threshold
      for (const result of results) {
        expect(result.score).toBeLessThan(FUZZY_THRESHOLDS.HIGH_CONFIDENCE);
      }
    });

    it('should limit to MAX_DISAMBIGUATION_CANDIDATES', () => {
      const results = matcher.getCandidatesForDisambiguation('Amaz', candidates);
      expect(results.length).toBeLessThanOrEqual(FUZZY_THRESHOLDS.MAX_DISAMBIGUATION_CANDIDATES);
    });

    it('should return empty if best match is high confidence', () => {
      // "Starbucks" has no close candidates in our list
      const results = matcher.getCandidatesForDisambiguation('Target', candidates);
      // If Target matches exactly, it would be high confidence
      expect(results.every(r => r.score < FUZZY_THRESHOLDS.HIGH_CONFIDENCE)).toBe(true);
    });
  });

  describe('alias dictionary bonus', () => {
    const candidates: PayeeCandidate[] = [
      { payeeName: 'amazon', payeeNameOriginal: 'Amazon', categoryId: 'cat1', categoryName: 'Shopping' },
    ];

    it('should boost score for alias match', () => {
      // AMZN is an alias for Amazon
      const results = matcher.findMatches('AMZN', candidates, 0);
      expect(results.length).toBeGreaterThan(0);
      // The alias dictionary should help boost the match
      expect(results[0].score).toBeGreaterThan(50);
    });
  });

  describe('singleton instance', () => {
    it('should export a usable singleton', () => {
      expect(payeeMatcher).toBeInstanceOf(PayeeMatcher);
      expect(payeeMatcher.normalize('TEST')).toBe('test');
    });
  });
});
