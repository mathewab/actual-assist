import type { ReportFacts, ReportEvidence } from './ReportTypes.js';
export type { ReportFacts, SavedReport } from './ReportTypes.js';
import { z } from 'zod';
export interface ReportTransaction {
  id: string;
  date: string;
  amount: number;
  category?: string | null;
  payee?: string | null;
  transfer_id?: string | null;
  is_parent?: boolean;
  is_child?: boolean;
  parent_id?: string | null;
  subtransactions?: ReportTransaction[];
}
export const reportTransactionSchema: z.ZodType<ReportTransaction> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    date: z.iso.date(),
    amount: z.number().int().safe(),
    category: z.string().nullable().optional(),
    payee: z.string().nullable().optional(),
    transfer_id: z.string().nullable().optional(),
    is_parent: z.boolean().optional(),
    is_child: z.boolean().optional(),
    parent_id: z.string().nullable().optional(),
    subtransactions: z.array(reportTransactionSchema).optional(),
  })
);
export interface ReportCapture {
  capturedAt: string;
  payees?: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string; transactions: ReportTransaction[] }>;
  categories: Array<{ id: string; name: string; income: boolean }>;
}
export class ReportError extends Error {
  constructor(
    public code: string,
    public status = 422
  ) {
    super(code);
  }
}
export function monthRange(month: string): [string, string] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900)
    throw new ReportError('INVALID_MONTH', 400);
  const [year, m] = month.split('-').map(Number);
  return [`${month}-01`, `${month}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}`];
}
export function validateCurrency(currency: string): string {
  if (
    !Intl.supportedValuesOf('currency').includes(currency) ||
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits !== 2
  )
    throw new ReportError('UNSUPPORTED_CURRENCY', 400);
  return currency;
}
export function addMinorUnits(left: number, right: number): number {
  const sum = left + right;
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || !Number.isSafeInteger(sum))
    throw new ReportError('AMOUNT_OVERFLOW');
  return sum;
}
/** Actual API returns grouped splits. Reject malformed groups instead of double counting. */
export function calculateReportSnapshot(
  capture: ReportCapture,
  month: string,
  currency: string
): { facts: ReportFacts; evidence: ReportEvidence[] } {
  const [start, end] = monthRange(month);
  validateCurrency(currency);
  const categories = new Map(capture.categories.map((c) => [c.id, c]));
  const totals = new Map<string, { id: string; name: string; amount: number }>();
  const evidence: ReportEvidence[] = [];
  const payees = new Map(capture.payees?.map((p) => [p.id, p.name]) ?? []);
  const seen = new Set<string>();
  const transfers = new Map<string, ReportTransaction>();
  let income = 0,
    spending = 0,
    unresolvedInflows = 0,
    transactionCount = 0;
  const warnings = [
    'Figures describe captured records. Transaction dates do not establish import completeness or missing imports.',
    'On-budget account scope, including historical activity in closed accounts.',
  ];
  const add = (
    txn: ReportTransaction,
    account: ReportCapture['accounts'][number],
    parent?: ReportTransaction
  ) => {
    if (seen.has(txn.id) || !Number.isSafeInteger(txn.amount))
      throw new ReportError('INVALID_TRANSACTIONS');
    seen.add(txn.id);
    transactionCount++;
    const category = txn.category ? categories.get(txn.category) : undefined;
    evidence.push({
      id: `${month}:${txn.id}`,
      sourceId: txn.id,
      month,
      date: txn.date,
      accountId: account.id,
      accountName: account.name,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? 'Uncategorized',
      payeeId: txn.payee ?? null,
      payeeName: (txn.payee && payees.get(txn.payee)) || 'Unknown payee',
      amount: txn.amount,
      role: txn.transfer_id
        ? 'transfer'
        : category?.income
          ? 'income'
          : !category && txn.amount > 0
            ? 'unresolved_inflow'
            : 'spending',
      parentId: parent?.id ?? null,
      parentAmount: parent?.amount ?? null,
    });
    if (txn.transfer_id) {
      transfers.set(txn.id, txn);
      return;
    }
    if (category?.income) {
      income = addMinorUnits(income, txn.amount);
      return;
    }
    if (!category && txn.amount > 0) {
      unresolvedInflows = addMinorUnits(unresolvedInflows, txn.amount);
      return;
    }
    spending = addMinorUnits(spending, -txn.amount);
    const id = category?.id ?? 'uncategorized';
    const total = totals.get(id) ?? { id, name: category?.name ?? 'Uncategorized', amount: 0 };
    total.amount = addMinorUnits(total.amount, -txn.amount);
    totals.set(id, total);
  };
  for (const account of capture.accounts)
    for (const txn of account.transactions) {
      if (txn.date < start || txn.date > end) continue;
      if (txn.is_child || txn.parent_id) throw new ReportError('UNGROUPED_SPLIT');
      if (txn.is_parent || txn.subtransactions?.length) {
        if (seen.has(txn.id) || !Number.isSafeInteger(txn.amount))
          throw new ReportError('INVALID_TRANSACTIONS');
        seen.add(txn.id);
        const children = txn.subtransactions;
        if (
          !children?.length ||
          children.reduce((s, c) => addMinorUnits(s, c.amount), 0) !== txn.amount
        )
          throw new ReportError('INCONSISTENT_SPLITS');
        for (const child of children) {
          if (
            child.is_parent ||
            child.subtransactions?.length ||
            (child.parent_id && child.parent_id !== txn.id)
          )
            throw new ReportError('INCONSISTENT_SPLITS');
          add({ ...child, date: txn.date }, account, txn);
        }
      } else add(txn, account);
    }
  if (
    [...transfers.values()].some((t) => {
      const other = transfers.get(t.transfer_id!);
      return !other || other.transfer_id !== t.id || other.amount !== -t.amount;
    })
  )
    warnings.push(
      'Unmatched or out-of-scope transfers excluded from income and spending; review them before interpreting net cash flow.'
    );
  if (unresolvedInflows)
    warnings.push(
      'Uncategorized positive inflows excluded from income; recorded net is qualified until classified.'
    );
  if (
    ![
      income,
      spending,
      income - spending,
      unresolvedInflows,
      ...[...totals.values()].map((t) => t.amount),
    ].every(Number.isSafeInteger)
  )
    throw new ReportError('AMOUNT_OVERFLOW');
  const facts: ReportFacts = {
    schemaVersion: 1,
    month,
    currency,
    capturedAt: capture.capturedAt,
    income,
    spending,
    net: income - spending,
    unresolvedInflows,
    categories: [...totals.values()].sort(
      (a, b) => b.amount - a.amount || a.id.localeCompare(b.id)
    ),
    accounts: capture.accounts.map((a) => ({
      name: a.name,
      firstRecord:
        a.transactions
          .map((t) => t.date)
          .filter((d) => d >= start && d <= end)
          .sort()[0] ?? null,
      latestRecord:
        a.transactions
          .map((t) => t.date)
          .filter((d) => d >= start && d <= end)
          .sort()
          .at(-1) ?? null,
    })),
    warnings,
    transactionCount,
  };
  return { facts, evidence };
}
export function calculateReport(
  capture: ReportCapture,
  month: string,
  currency: string
): ReportFacts {
  return calculateReportSnapshot(capture, month, currency).facts;
}
