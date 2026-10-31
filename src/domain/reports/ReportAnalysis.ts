import {
  calculateReportSnapshot,
  monthRange,
  addMinorUnits,
  ReportError,
  type ReportCapture,
} from './Report.js';
import type { ReportAnalysis, ReportObservation } from './ReportTypes.js';
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
/** Baselines are frozen from existing transactions, never from mutable later reports. */
export function analyzeReport(capture: ReportCapture, month: string, currency: string) {
  monthRange(month);
  if (month > capture.capturedAt.slice(0, 7)) throw new ReportError('FUTURE_REPORT_MONTH', 400);
  const startMonth = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
  const dates = capture.accounts
    .flatMap((a) => a.transactions.map((t) => t.date))
    .filter(
      (d) =>
        d >= `${startMonth}-01` && d <= monthRange(month)[1] && d <= capture.capturedAt.slice(0, 10)
    )
    .sort();
  const partial = month === capture.capturedAt.slice(0, 7);
  const cutoff = partial ? Number(capture.capturedAt.slice(8, 10)) : null;
  const effective = cutoff
    ? {
        ...capture,
        accounts: capture.accounts.map((a) => ({
          ...a,
          transactions: a.transactions.filter(
            (t) => t.date.slice(0, 7) !== month || Number(t.date.slice(8, 10)) <= cutoff
          ),
        })),
      }
    : capture;
  const current = calculateReportSnapshot(effective, month, currency);
  const analysis: ReportAnalysis = {
    evidenceVersion: 1,
    evidence: [],
    observations: [],
    history: [],
    observedStart: dates[0] ?? null,
    observedEnd: dates.at(-1) ?? null,
  };
  for (let index = 0; index < 13; index++) {
    const date = new Date(`${startMonth}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + index);
    const period = date.toISOString().slice(0, 7);
    if (!dates.length || period < dates[0].slice(0, 7)) continue;
    const bounded = cutoff
      ? {
          ...capture,
          accounts: capture.accounts.map((a) => ({
            ...a,
            transactions: a.transactions.filter((t) => Number(t.date.slice(8, 10)) <= cutoff),
          })),
        }
      : capture;
    const snapshot = calculateReportSnapshot(bounded, period, currency);
    analysis.history.push({
      month: period,
      spending: snapshot.facts.spending,
      income: snapshot.facts.income,
      transactionCount: snapshot.facts.transactionCount,
      cutoffDay: cutoff,
    });
    analysis.evidence.push(...snapshot.evidence);
  }
  // Current-month cards use the same cutoff as the historical comparisons.
  const targetEvidence = analysis.evidence.filter((e) => e.month === month);
  const spend = targetEvidence.filter((e) => e.role === 'spending');
  const observations: ReportObservation[] = [];
  const largest = current.facts.categories.find((c) => c.amount > 0);
  if (largest)
    observations.push({
      id: 'largest-category',
      kind: 'category',
      text: `${largest.name}: ${money(largest.amount, currency)} recorded net spending.`,
      evidenceIds: spend
        .filter((e) => (e.categoryId ?? 'uncategorized') === largest.id)
        .map((e) => e.id),
    });
  const purchase = [...spend]
    .sort((a, b) => a.amount - b.amount || a.id.localeCompare(b.id))
    .find((e) => e.amount < 0);
  if (purchase)
    observations.push({
      id: 'largest-purchase',
      kind: 'purchase',
      text: `Largest recorded ${purchase.parentId ? 'split allocation' : 'purchase'}: ${money(-purchase.amount, currency)}.`,
      evidenceIds: [purchase.id],
    });
  const prior = analysis.history.at(-2),
    target = analysis.history.at(-1);
  if (prior && target?.month === month) {
    const delta = addMinorUnits(target.spending, -prior.spending);
    const percentage =
      prior.spending > 0 ? ` (${((delta / prior.spending) * 100).toFixed(1)}%)` : '';
    observations.push({
      id: 'previous-month',
      kind: 'comparison',
      text: `Recorded net spending changed by ${money(delta, currency)}${percentage} from ${prior.month} to ${month}${cutoff ? ` (through day ${cutoff} of each month)` : ''}.`,
      evidenceIds: analysis.evidence
        .filter((e) => e.role === 'spending' && [prior.month, month].includes(e.month))
        .map((e) => e.id),
    });
  }
  const payees = [...new Set(spend.map((e) => e.payeeId).filter((p): p is string => Boolean(p)))];
  for (const payee of payees) {
    const rows = analysis.evidence.filter((e) => e.role === 'spending' && e.payeeId === payee);
    const months = new Set(rows.filter((e) => e.amount < 0).map((e) => e.month));
    if (months.size >= 3) {
      observations.push({
        id: `repetition-${observations.length}`,
        kind: 'repetition',
        text: `${rows[0].payeeName}: purchases recorded in ${months.size} observed months. This is repetition, not proof of a subscription.`,
        evidenceIds: rows.map((e) => e.id),
      });
      break;
    }
  }
  analysis.observations = observations;
  if (partial)
    current.facts.warnings.push(
      `Month in progress at capture (${capture.capturedAt.slice(0, 10)} UTC). Historical comparisons use the same day cutoff.`
    );
  return { facts: current.facts, analysis };
}
