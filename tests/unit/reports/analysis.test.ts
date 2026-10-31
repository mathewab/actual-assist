import { expect, it } from 'vitest';
import { analyzeReport } from '../../../src/domain/reports/ReportAnalysis.js';
import type { ReportCapture } from '../../../src/domain/reports/Report.js';
const source = (): ReportCapture => ({
  capturedAt: '2026-10-02T09:00:00Z',
  payees: [{ id: 'merchant', name: 'Captured merchant' }],
  categories: [{ id: 'food', name: 'Food', income: false }],
  accounts: [
    {
      id: 'a',
      name: 'Captured account',
      transactions: [
        { id: 'jul', date: '2026-07-03', amount: -1000, category: 'food', payee: 'merchant' },
        { id: 'aug', date: '2026-08-03', amount: -2000, category: 'food', payee: 'merchant' },
        { id: 'sep', date: '2026-09-03', amount: -3000, category: 'food', payee: 'merchant' },
        { id: 'refund', date: '2026-09-04', amount: 500, category: 'food', payee: 'merchant' },
      ],
    },
  ],
});
it('uses imported history immediately, freezes labels and links comparisons to exact evidence', () => {
  const result = analyzeReport(source(), '2026-09', 'USD');
  expect(result.analysis.history.map((h) => h.month)).toEqual(['2026-07', '2026-08', '2026-09']);
  expect(result.facts.spending).toBe(2500);
  const comparison = result.analysis.observations.find((o) => o.kind === 'comparison')!;
  expect(comparison.text).toContain('$5.00 (25.0%)');
  expect(comparison.evidenceIds).toEqual(['2026-08:aug', '2026-09:sep', '2026-09:refund']);
  expect(result.analysis.observations.find((o) => o.kind === 'repetition')?.text).toContain(
    '3 observed months'
  );
  expect(result.analysis.evidence[0].payeeName).toBe('Captured merchant');
  expect(JSON.stringify(result.analysis.observations)).not.toContain('missing import');
});
it('quiet months are observed zeros, not missing-import evidence; zero baseline has no percentage', () => {
  const capture = source();
  capture.accounts[0].transactions = capture.accounts[0].transactions.filter((t) => t.id !== 'aug');
  const result = analyzeReport(capture, '2026-09', 'USD');
  expect(result.analysis.history[1]).toMatchObject({ spending: 0, transactionCount: 0 });
  expect(result.analysis.observations.find((o) => o.kind === 'comparison')?.text).not.toContain(
    '%'
  );
});
it('current month and historical comparisons use the same day cutoff', () => {
  const capture = source();
  capture.capturedAt = '2026-09-03T12:00:00Z';
  capture.accounts[0].transactions.push({
    id: 'later',
    date: '2026-08-20',
    amount: -9000,
    category: 'food',
  });
  const result = analyzeReport(capture, '2026-09', 'USD');
  expect(result.facts.spending).toBe(3000);
  expect(result.analysis.history.at(-2)?.spending).toBe(2000);
  expect(result.analysis.evidence.map((e) => e.sourceId)).not.toContain('refund');
  expect(result.analysis.observations.find((o) => o.kind === 'comparison')?.text).toContain(
    'through day 3'
  );
});
it('split evidence counts children once and carries parent amount only as context', () => {
  const capture = source();
  capture.accounts[0].transactions = [
    {
      id: 'parent',
      date: '2026-09-01',
      amount: -1000,
      is_parent: true,
      subtransactions: [
        { id: 'child1', date: '2026-09-01', amount: -600, category: 'food', parent_id: 'parent' },
        { id: 'child2', date: '2026-09-01', amount: -400, parent_id: 'parent' },
      ],
    },
  ];
  const result = analyzeReport(capture, '2026-09', 'USD');
  expect(result.analysis.evidence).toHaveLength(2);
  expect(result.analysis.evidence[0]).toMatchObject({
    parentId: 'parent',
    parentAmount: -1000,
    amount: -600,
  });
  expect(result.facts.spending).toBe(1000);
});
