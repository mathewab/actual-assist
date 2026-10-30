# Spending-pattern drill-down — design exploration

Status: proposal only, following positive feedback on the PDF mockup. No feature implementation, real-data capture, external AI permission, delivery enablement or draft-PR approval is implied. The monthly PDF remains the primary report; the authenticated Reports page supplies exploration.

## Recommended small extension

Add an **Explore this month** area on `/reports/:id`: up to three calculated observation cards, clickable category bars, and a transaction drawer. Clicking an observation answers “which records support this?” using the exact saved report version, never the current mutable Actual cache. The PDF contains a short Highlights section with the same observation wording and amounts; deeper inspection belongs in the authenticated app.

Start with directly explainable observations, and use the budget’s already-imported history for comparisons wherever the records support them:

| Observation | Exact deterministic meaning | Drill-down |
| --- | --- | --- |
| Largest spending category | Category with the highest positive net spending in this snapshot; show amount and share only when total net spending is positive | All contributing debits and refunds; subtotal reconciles to the category figure |
| Largest recorded purchase | Highest individual expense allocation in included records; explicitly label split allocations rather than suggesting the entire parent was spent in that category | Selected row plus related split context, clearly separating the parent amount from child allocations |
| Merchant detail / review item | Group by captured Actual payee ID, using its captured display name; no fuzzy merchant merging. Prefer an uncategorized-spending review card when present | Merchant or uncategorized rows, transaction count, gross debits, refunds and net amount |

“Largest recorded purchase” is a ranking, not a statistical anomaly, overspending judgment or fraud alert. Unknown payees stay unknown; a payee label is not independently verified merchant identity. Never turn “only observed once” into “one-off expense.” Avoid claiming that a spike was caused by travel, inflation or lifestyle changes.

### Synthetic interaction example

An invented card says **“Food & groceries: $760 recorded net spending.”** Selecting it opens:

- Saved month/version, observed date range/account scope, and any specifically evidenced coverage limitation, visible above the rows.
- Filters for category and captured payee; a deterministic date/amount sort.
- Recorded rows such as $500 groceries, $300 dining and a $40 grocery refund; gross spending $800 minus refunds $40 reconciles to $760 net.
- Each row’s captured date, account display name, category, payee display name, amount and split context. No free-text bank notes or imported descriptions are needed.
- A short explanation: “Includes the records saved in September v1. Later imports may change a revised report.”

Filters affect the drawer subtotal, not the immutable report total. The UI labels both, retains a clear Back to report action, and paginates transaction lists. If the observation has no eligible records, omit it instead of generating filler. Large negative net categories are labelled net refunds and do not become “top spending.”

## Existing-code implications

`ReportFacts`/`SavedReport` currently persist aggregates and PDF metadata only (`src/domain/reports/ReportTypes.ts`). `ActualBudgetAdapter.captureReport` deliberately strips payees/notes with `reportTransactionSchema`; it captures only the requested month. This is a limitation of the current report implementation, not evidence that the budget lacks older transactions. The source hash cannot reconstruct evidence rows. Therefore exact transaction drill-down requires a small new local snapshot representation; it cannot be bolted on by querying today's transactions.

Propose a versioned `report_evidence` SQLite table keyed by `(report_id, evidence_id)`, with report-owned normalized rows: source transaction ID, parent/split linkage, captured date, integer amount, account ID/name, category ID/name, captured payee ID/name and inclusion/reconciliation role. Persist only the minimum evidence needed for the views. Notes, imported bank descriptions and credentials stay excluded. Preserve explicit exclusion context for transfers without letting those rows inflate spending subtotals. The existing calculator should produce normalized contributions once; facts and evidence must derive from those same contributions, avoiding a second calculation engine.

An observation contains a stable ID, rule/version, relevant calculated fact IDs, evidence filter/row references, and coverage qualification. References are resolved only inside the report's immutable evidence set. Snapshot content and observations are hashed and finalized with the report; partially written evidence is never exposed. Keep the existing local database/volume and single-writer service; no search index, vector store, agent framework or separate data service.

Capture payee display names inside the same Actual queue slot as transactions. Preserve the captured names and category assignments even if later renamed or recategorized. Reports saved before this feature say **“Transaction detail was not captured for this version.”** Offer explicit regeneration to create a new version with evidence; do not silently backfill historical reports from live data.

Proposed read routes are `/api/v1/reports/:id/observations` and `/api/v1/reports/:id/transactions?observationId=...&limit=...&offset=...`. Reuse `budget:read`, configured-budget scope checks, bounded pagination, private/no-store headers and existing audit conventions. Reject an observation/evidence ID from another report or budget. Browser links point to `/reports/:id?observation=<id>` with no financial values or credentials in URLs. No separate permissions or public downloads.

## Use existing history now; distinguish freshness from completeness

The budget may already contain more than a year of imported transactions. **No historical transactions were inspected for this design, so its actual history length and coverage are unverified.** The feature should inspect and use available local history at generation time, not wait for future monthly reports or ask the user to collect data they already have. Additional engineering for comparisons is distinct from any need for more data.

A modest initial historical window is the report month plus up to 12 preceding calendar months. Capture eligible historical records coherently from the existing cache and freeze the selected baseline evidence with the new report. A baseline does not require a previously generated PDF or saved monthly report. If an existing saved report version is deliberately selected instead, record that choice and version. Later imports or revisions must not silently change either form of frozen baseline. Display the actual observed period, included accounts, sample counts and baseline dates, not the maximum requested window as though every day were verified complete.

- **Category/merchant changes:** compare recorded totals for adjacent months and show the available multi-month pattern using the same currency, account perimeter and classification rules. Show absolute change and percentage change when the baseline is nonzero. Label it “recorded spending” and state the periods used. An unconfirmed import status alone does not disable this comparison. Exclude or qualify specifically affected comparisons when account scope or classification is incompatible; explain the exact mismatch. Where possible use a common account subset and label it clearly.
- **Historical coverage:** display per-account first/last observed dates, month-by-month transaction counts and any available import/statement metadata. These describe the records; they do not certify continuous coverage. A month with no transactions is an observed zero, not proof that a CSV is missing. An account first appearing later does not establish its opening date. Flag a missing period only with supporting evidence, such as a failed/incomplete import record, a known omitted account or the user identifying an unimported statement. If metadata is absent, label it unavailable without inventing a gap or withholding all trends. Optional user confirmation can resolve a specific ambiguity; it is not a mandatory monthly gate.
- **Current-month freshness:** show capture time, latest recorded dates and whether the requested calendar month is still in progress. A mid-month report can compare recorded month-to-date totals over the same calendar-day cutoff, clearly labelled; do not compare it to an entire prior month as though they were equal periods. A late last-transaction date is not proof of complete imports, and an older date is not proof of staleness for an inactive account. Current-month uncertainty does not invalidate independently usable historical months.
- **Repeated pattern:** use existing historical records immediately. If the same captured payee appears in at least three eligible months within a documented date/amount tolerance, label it “repeated in these recorded months,” list the matching transactions and show the rule/window. This does not require three future reports. It is evidence of observed repetition, not a subscription diagnosis, guaranteed recurrence or next-charge prediction. “Only observed once in this window” stays distinct from “one-off.” Captured schedule evidence or user confirmation may strengthen the interpretation later.
- **Unusual amount:** an existing adequate historical sample can support a deterministic unusual-amount observation now. Show the baseline sample size, median/range and rule threshold, with links to both the flagged transaction and comparison rows. Do not assume a baseline is absent because this report feature is new. If there are too few relevant observations or a specifically identified incompatibility, use the largest-purchase ranking instead and state the precise limitation. Never infer causes from the amount alone.

The current core code still labels all coverage unconfirmed and omits comparisons. That behavior is not the desired long-term rule and should change only when the drill-down implementation scope is approved. This clarification changes the design, not runtime behavior or authorization to read/send real financial data.

## What AI adds, and what it does not

The first increment is useful with deterministic wording alone. If the user later authorizes external narrative, AI may select/rephrase eligible observations and suggest which calculated detail to inspect. It receives allowlisted calculated facts, observation IDs and coverage caveats, not supporting transactions, account/payee names, notes or a database tool. The app resolves cited observation IDs to local evidence and injects authoritative numbers. Invalid references or unsupported claims fall back to deterministic copy.

Label AI-assisted wording separately from calculated observations. Do not let AI invent an anomaly, calculate amounts, guess merchant identity, infer reasons, establish recurring status, browse transactions or choose an arbitrary data query. A general “chat with my budget” feature is outside this proposal. Approval of the mockup does not authorize real financial-data transmission.

## Incremental effort and acceptance

**Recommended increment: approximately 2–4 focused engineering days**, assuming the current report core, for minimal evidence storage/migration, coherent payee capture, observation rules, authenticated filtered drawer, PDF highlights and synthetic tests. This is a planning estimate, not a delivery commitment; user feedback and existing release gates are separate. **Existing-history comparisons/observed-repetition support: approximately 2–3 additional engineering days** for bounded historical capture, frozen baseline evidence and explicit observation rules. This is implementation effort, not a wait to accumulate future data or a requirement for blanket coverage confirmation. AI narrative work remains a separate opt-in item; no new dependency is needed for the deterministic increment.

Acceptance tests: exact observation-to-row reconciliation including refunds/splits; no transfer double counting; unknown payees and negative/zero totals; stable old observations after later imports/renames; cross-report/cross-budget ID rejection; reader/operator access; bounded pagination; old-version “detail unavailable”; existing historical data yields comparisons without prior saved reports or manual-import confirmation; current-month freshness is separate from historical coverage; quiet months do not become missing-import warnings; specifically evidenced gaps affect only relevant comparisons; missing/zero baseline; no raw evidence in mock AI payloads; PDF highlights match the saved observation facts. Include a browser test from card to drawer and back. No backup or recovery service is proposed.

**Scope decision for the user:** start with snapshot-backed category/merchant and largest-purchase drill-down plus PDF highlights; decide whether to include existing-history comparisons and observed repetition in the same increment or the next engineering increment. Neither option requires waiting for future months when usable history already exists. Until that decision, this document is the only change.
