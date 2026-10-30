# Spending-pattern drill-down — design exploration

Status: proposal only, following positive feedback on the PDF mockup. No feature implementation, real-data capture, external AI permission, delivery enablement or draft-PR approval is implied. The monthly PDF remains the primary report; the authenticated Reports page supplies exploration.

## Recommended small extension

Add an **Explore this month** area on `/reports/:id`: up to three calculated observation cards, clickable category bars, and a transaction drawer. Clicking an observation answers “which records support this?” using the exact saved report version, never the current mutable Actual cache. The PDF contains a short Highlights section with the same observation wording and amounts; deeper inspection belongs in the authenticated app.

Start with useful observations that require no questionable baseline:

| Observation | Exact deterministic meaning | Drill-down |
| --- | --- | --- |
| Largest spending category | Category with the highest positive net spending in this snapshot; show amount and share only when total net spending is positive | All contributing debits and refunds; subtotal reconciles to the category figure |
| Largest recorded purchase | Highest individual expense allocation in included records; explicitly label split allocations rather than suggesting the entire parent was spent in that category | Selected row plus related split context, clearly separating the parent amount from child allocations |
| Merchant detail / review item | Group by captured Actual payee ID, using its captured display name; no fuzzy merchant merging. Prefer an uncategorized-spending review card when present | Merchant or uncategorized rows, transaction count, gross debits, refunds and net amount |

“Largest recorded purchase” is a ranking, not a statistical anomaly, overspending judgment or fraud alert. Unknown payees stay unknown; a payee label is not independently verified merchant identity. Never turn “only observed once” into “one-off expense.” Avoid claiming that a spike was caused by travel, inflation or lifestyle changes.

### Synthetic interaction example

An invented card says **“Food & groceries: $760 recorded net spending.”** Selecting it opens:

- Saved month/version and coverage warning, visible above the rows.
- Filters for category and captured payee; a deterministic date/amount sort.
- Recorded rows such as $500 groceries, $300 dining and a $40 grocery refund; gross spending $800 minus refunds $40 reconciles to $760 net.
- Each row’s captured date, account display name, category, payee display name, amount and split context. No free-text bank notes or imported descriptions are needed.
- A short explanation: “Includes the records saved in September v1. Later imports may change a revised report.”

Filters affect the drawer subtotal, not the immutable report total. The UI labels both, retains a clear Back to report action, and paginates transaction lists. If the observation has no eligible records, omit it instead of generating filler. Large negative net categories are labelled net refunds and do not become “top spending.”

## Existing-code implications

`ReportFacts`/`SavedReport` currently persist aggregates and PDF metadata only (`src/domain/reports/ReportTypes.ts`). `ActualBudgetAdapter.captureReport` deliberately strips payees/notes with `reportTransactionSchema`; it captures only the requested month. The source hash cannot reconstruct evidence rows. Therefore exact transaction drill-down requires a small new local snapshot representation; it cannot be bolted on by querying today's transactions.

Propose a versioned `report_evidence` SQLite table keyed by `(report_id, evidence_id)`, with report-owned normalized rows: source transaction ID, parent/split linkage, captured date, integer amount, account ID/name, category ID/name, captured payee ID/name and inclusion/reconciliation role. Persist only the minimum evidence needed for the views. Notes, imported bank descriptions and credentials stay excluded. Preserve explicit exclusion context for transfers without letting those rows inflate spending subtotals. The existing calculator should produce normalized contributions once; facts and evidence must derive from those same contributions, avoiding a second calculation engine.

An observation contains a stable ID, rule/version, relevant calculated fact IDs, evidence filter/row references, and coverage qualification. References are resolved only inside the report's immutable evidence set. Snapshot content and observations are hashed and finalized with the report; partially written evidence is never exposed. Keep the existing local database/volume and single-writer service; no search index, vector store, agent framework or separate data service.

Capture payee display names inside the same Actual queue slot as transactions. Preserve the captured names and category assignments even if later renamed or recategorized. Reports saved before this feature say **“Transaction detail was not captured for this version.”** Offer explicit regeneration to create a new version with evidence; do not silently backfill historical reports from live data.

Proposed read routes are `/api/v1/reports/:id/observations` and `/api/v1/reports/:id/transactions?observationId=...&limit=...&offset=...`. Reuse `budget:read`, configured-budget scope checks, bounded pagination, private/no-store headers and existing audit conventions. Reject an observation/evidence ID from another report or budget. Browser links point to `/reports/:id?observation=<id>` with no financial values or credentials in URLs. No separate permissions or public downloads.

## Comparisons and recurrence: optional next increment

These require additional evidence and should not hold up the first drill-down release.

- **Category/merchant changes:** compare explicitly selected saved versions from adjacent months only when currency, account perimeter, classification rules and coverage are compatible. Freeze the selected baseline ID and aggregates in the observation. Show absolute change; percentage change is unavailable when baseline is zero. A later baseline revision must not silently change an old observation. If category assignments changed and cannot be reconciled, suppress the comparison.
- **Coverage:** today's implementation marks every account unconfirmed. Consequently it must not generate confident “spending increased” claims. Meaningful comparisons require a modest operator statement-through confirmation per included account, or equivalent reliable source evidence. Date of last transaction alone is insufficient. If coverage remains unknown, show “Not enough comparable import coverage” and omit trend claims.
- **Repeated pattern:** with at least three comparable captured months, an explicit rule could flag the same payee appearing in each month within a documented date/amount tolerance. Label this “repeated in these captured months,” list matching rows and show the rule. It is not a subscription diagnosis, proof of recurrence, or prediction of the next charge. User-confirmed recurring status or a separately captured Actual schedule can provide stronger evidence later.
- **Unusual amount:** defer statistical anomaly scoring until there is an adequate and comparable historical sample. The first release's largest-purchase ranking is more defensible. If added later, publish the baseline sample size, median/range and threshold beside the observation; call it unusual relative to those records, never an inferred cause.

## What AI adds, and what it does not

The first increment is useful with deterministic wording alone. If the user later authorizes external narrative, AI may select/rephrase eligible observations and suggest which calculated detail to inspect. It receives allowlisted calculated facts, observation IDs and coverage caveats, not supporting transactions, account/payee names, notes or a database tool. The app resolves cited observation IDs to local evidence and injects authoritative numbers. Invalid references or unsupported claims fall back to deterministic copy.

Label AI-assisted wording separately from calculated observations. Do not let AI invent an anomaly, calculate amounts, guess merchant identity, infer reasons, establish recurring status, browse transactions or choose an arbitrary data query. A general “chat with my budget” feature is outside this proposal. Approval of the mockup does not authorize real financial-data transmission.

## Incremental effort and acceptance

**Recommended increment: approximately 2–4 focused engineering days**, assuming the current report core, for minimal evidence storage/migration, coherent payee capture, observation rules, authenticated filtered drawer, PDF highlights and synthetic tests. This is a planning estimate, not a delivery commitment; user feedback and existing release gates are separate. **Comparable-month/recurrence support: approximately 2–3 additional days** once coverage confirmation and baseline semantics are agreed. AI narrative work remains a separate opt-in item; no new dependency is needed for the deterministic increment.

Acceptance tests: exact observation-to-row reconciliation including refunds/splits; no transfer double counting; unknown payees and negative/zero totals; stable old observations after later imports/renames; cross-report/cross-budget ID rejection; reader/operator access; bounded pagination; old-version “detail unavailable”; no comparison under unknown coverage; missing/zero baseline; no raw evidence in mock AI payloads; PDF highlights match the saved observation facts. Include a browser test from card to drawer and back. No backup or recovery service is proposed.

**Scope decision for the user:** start with snapshot-backed category/merchant and largest-purchase drill-down plus PDF highlights; decide separately whether multi-month comparison and observed repetition are worth the additional coverage-confirmation step. Until that decision, this document is the only change.
