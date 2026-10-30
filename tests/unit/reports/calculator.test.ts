import { describe, expect, it } from 'vitest';
import {
  calculateReport,
  monthRange,
  type ReportCapture,
  type ReportTransaction,
} from '../../../src/domain/reports/Report.js';
const row = (
  id: string,
  amount: number,
  extra: Partial<ReportTransaction> = {}
): ReportTransaction => ({ id, amount, date: '2026-09-12', category: 'food', ...extra });
const capture = (rows: ReportTransaction[]): ReportCapture => ({
  capturedAt: '2026-10-02T09:00:00Z',
  categories: [
    { id: 'food', name: 'Food', income: false },
    { id: 'pay', name: 'Pay', income: true },
  ],
  accounts: [{ id: 'a', name: 'Synthetic', transactions: rows }],
});
const calc = (rows: ReportTransaction[]) => calculateReport(capture(rows), '2026-09', 'USD');
describe('monthly facts', () => {
  it('counts grouped split children once, nets refunds, and preserves uncategorized spending', () => {
    const result = calc([
      row('income', 100000, { category: 'pay' }),
      row('parent', -15000, {
        is_parent: true,
        subtransactions: [
          row('c1', -10000, { parent_id: 'parent' }),
          row('c2', -5000, { category: null, parent_id: 'parent' }),
        ],
      }),
      row('refund', 2000),
    ]);
    expect(result).toMatchObject({
      income: 100000,
      spending: 13000,
      net: 87000,
      transactionCount: 4,
    });
    expect(result.categories.map((c) => c.amount)).toEqual([8000, 5000]);
  });
  it('excludes matched transfers and qualifies unmatched/out-of-scope transfers', () => {
    const result = calc([
      row('a', -100, { transfer_id: 'b' }),
      row('b', 100, { transfer_id: 'a' }),
    ]);
    expect(result.net).toBe(0);
    expect(result.warnings).toHaveLength(2);
    expect(calc([row('a', -100, { transfer_id: 'missing' })]).warnings.join(' ')).toContain(
      'Unmatched'
    );
  });
  it('does not infer income from unclassified inflows or discard net refunds', () => {
    expect(calc([row('in', 100, { category: null }), row('refund', 200)])).toMatchObject({
      income: 0,
      unresolvedInflows: 100,
      spending: -200,
      net: 200,
    });
  });
  it('rejects mismatched splits, duplicate IDs, flat children and unsafe money', () => {
    for (const rows of [
      [row('p', -100, { is_parent: true, subtransactions: [row('c', -50)] })],
      [row('x', 1), row('x', 1)],
      [row('c', 1, { parent_id: 'p' })],
      [row('x', 0.5)],
    ])
      expect(() => calc(rows)).toThrow();
  });
  it('uses date-only month bounds including leap years; invalid currency never becomes USD', () => {
    expect(monthRange('2024-02')).toEqual(['2024-02-01', '2024-02-29']);
    expect(() => monthRange('2026-13')).toThrow();
    expect(
      calc([row('old', -1, { date: '2026-08-31' }), row('new', -1, { date: '2026-10-01' })])
        .transactionCount
    ).toBe(0);
    expect(() => calculateReport(capture([]), '2026-09', 'XXX')).toThrow();
  });
});
