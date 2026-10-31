# Monthly reports — design review v1

> Historical design record. See [implementation.md](implementation.md) and [usage.md](usage.md) for the implemented draft and current opt-in boundaries.

Status: proposed, synthetic-only. No application behavior, credentials, schedules or deployment changed.
Inspected checkout: `39e0309fcc78abb0a24b7ee3fed88581a6c12a6a`, package version `0.10.1` (2026-10-30). This is repository evidence, not verification of the running deployment.

## Outcome and minimum scope

An authenticated Reports screen organizes saved monthly PDFs by month. Select a month, generate on demand, view or download a durable version, and explicitly regenerate after importing more transactions. Two editorial PDF pages: overview and spending/coverage. A third wireframe page illustrates the Reports UI; a fourth explains architecture. All sample numbers and account names are invented. The narrative in the mock is authored sample copy, not an API-generated response.

V1 is one configured budget, one currency and calendar months; manual generation; no automatic bank imports; no public links; no investment, net-worth, forecasting or tax advice. Cash flow is described as recorded income minus recorded net spending, never as guaranteed savings. No budget-vs-plan comparison until a stable historical monthly-budget API is verified. No new storage service, queue service, tunnel integration or credential type.

## Architecture evidence

- `src/server.ts`, `src/api/index.ts`, `src/ui/App.tsx`: one Express application and React UI, existing service injection and route patterns. Add Reports to this app.
- `src/auth/principals.ts`, `src/auth/mountAccessBoundary.ts`, `src/auth/httpAuth.ts`: generic `budget:read`, `app:operate`, `ui:session`; reader/operator bearer roles; only operators currently qualify for UI sessions. Auth boundary mounts machine reads before the legacy operator-only API guard. `src/infra/env.ts` still defaults AUTH_MODE to legacy; machine APIs require enforced mode. Do not assume deployment settings from this default or change auth at this milestone.
- `src/api/integrationRoutes.ts`, `src/services/IntegrationService.ts`: authenticated `/api/v1` and MCP reads share a fixed-budget service, bounded transaction ranges (93 days), pagination, jobs and audit. Reuse the adapter/service boundary internally rather than loopback HTTP or a tunnel-specific path. Mount proposed Reports routes explicitly ahead of catch-all machine routes and operator legacy guards, with their own existing permission checks.
- `src/infra/ActualBudgetAdapter.ts`, `src/infra/SerialQueue.ts`: process-global Actual API serialized by a queue. The suggestion transaction mapper drops split metadata and skips closed and off-budget accounts. It is unsuitable as the authoritative report normalizer without extension. A report must capture all required monthly reads within a single queued operation so sync/apply cannot interleave. Keep PDF rendering/AI outside the Actual lock.
- `src/services/SnapshotService.ts`, `src/domain/entities/BudgetSnapshot.ts`: snapshot is a cache-file reference with counts; creation also deletes suggestions. Do not use it as report history or invoke it for report generation.
- `src/services/SuggestionService.ts`, `src/infra/ai/AIAdapter.ts`, `createAIAdapter.ts`: reusable completion interface with schema support; OpenAI Responses and Gemini implementations. Factory can fall back from Google to OpenAI. Reuse interface and provider configuration, not categorization prompts or transaction payloads. Provider fallback must not silently change the approved destination for reporting.
- `src/infra/OpenAIAdapter.ts`: logs full inputs and streamed response chunks. This requires a targeted logging/privacy follow-up before report facts can use this adapter. No change made now. Gemini uses metadata for ordinary request logging but error paths also need review.
- `src/infra/DatabaseAdapter.ts`, `src/infra/db/migrations`, `charts/actual-assist/templates/deployment.yaml`, `charts/actual-assist/values.yaml`: SQLite WAL with migrations; existing PVC mount at `/data`. Reuse SQLite plus a reports directory on that PVC. Actual deployed capacity/backups have not been inspected.
- `src/services/JobService.ts`, `JobOrchestrator.ts`, `src/domain/entities/Job.ts`: existing jobs, steps, event stream, failures and retention. Add a report-generation job type and audits; report retention must be independent of job cleanup.

No additional `.agents` skills were present in the repository or the empty workspace `.agents` directory. Followed AGENTS.md and `.specify/memory/constitution.md`.

## Deterministic calculation contract

`ReportFacts v1` contains budget scope, month, currency, timezone, capture timestamp, source fingerprint, included account IDs, coverage evidence, category totals, comparison eligibility and calculated metrics. Calculate in integer minor units; round only display values. Use Actual date-only transaction dates and explicit calendar boundaries; don't shift them through UTC timestamps.

Normalize posted/non-deleted rows, count split children once and never count their parent as well; validate parent/child amounts. Preserve uncategorized spending visibly. Exclude matched internal transfers and card repayments from income/spending; flag unresolved transfer links. Define perimeter transfers to excluded accounts separately as out-of-scope movements, not inferred expenses. Include historical activity in accounts closed after the month; do not silently drop it because the account is closed today. Initial default is on-budget scope, shown on every report; off-budget accounts excluded explicitly.

Income = signed total assigned to income categories. Spending = negative of signed non-income amounts, so refunds reduce the original category's spending. Keep uncategorized positive inflows as an explicit unresolved bucket instead of claiming income. Net = income - net spending only when classification is reconciled; otherwise show a reconciliation warning/qualified result. A zero-income denominator yields unavailable percentage, not infinity. Preserve negative net category totals (refunds), render a diverging chart rather than a misleading pie. Do not deduplicate legitimate identical transactions based on date/amount alone.

Prior-month comparisons should use the historical transactions already present in the budget, with compatible currency, account scope and classification. Show the actual observed periods and compare recorded totals; manual imports or unavailable completeness metadata alone do not suppress trends. Qualify or withhold only specifically affected comparisons when an evidenced gap or scope mismatch makes them misleading. A zero baseline makes percentage change unavailable. No balance/net-worth claims from a transaction-only snapshot. The fixture uses reconciled aggregates to demonstrate layout; it does not establish actual SDK split semantics. Pin split/transfer fixture behavior against the installed Actual API before implementing the production normalizer.

## Coverage, freshness and revisions

Latest recorded transaction date is not bank import completeness. Show the actual first/last observed dates and account scope, cache capture time, and available import/statement metadata. Missing metadata is unavailable evidence, not an identified missing import. Do not infer gaps from quiet months or fabricate a completeness percentage. Distinguish current-month freshness and month-to-date cutoffs from historical completeness; flag only specific evidenced gaps or known exclusions and qualify the affected observations. Existing history is immediately usable for recorded-total comparisons and repeated-pattern analysis; no future collection or blanket statement confirmation is required. The budget may have over a year of history, but no actual history length has been verified in this design task. See the drill-down proposal for baseline snapshot semantics.

Capture the current cache without implicit sync or importing; explain that newer bank CSVs may exist elsewhere. Manual refresh/import is a separate existing workflow. Imported data later makes a new version possible but cannot silently rewrite a saved report. A changed-source indicator is optional and must be derived from a new fingerprint, not merely elapsed time.

## Saved storage and explicit lifecycle

Propose `reports` metadata table with opaque UUID, budget ID, month, monotonic version, state, createdAt, creator, sourceHash, factsHash, schemaVersion, templateVersion, rendererVersion, currency/timezone/scope, coverage JSON, frozen facts JSON, narrative text/status/provider/model/promptVersion, relative PDF path, byte size, SHA-256, jobId and supersedesId. Unique `(budgetId, month, version)`; request idempotency key unique per budget. Store facts and narrative locally; never raw transaction notes or credentials in metadata. Report IDs are identifiers, not authorization secrets.

For this homelab, SQLite metadata + `${DATA_DIR}/reports/<opaque-id>.pdf` is sufficient. Resolve only server-generated file names; do not accept client filesystem paths. Write a temporary PDF, validate it, atomically rename, then commit ready metadata. A failed DB commit can leave an orphan file; recovery removes only unreferenced temporary/orphan files after a grace period. Incomplete rows are never downloadable. Startup marks interrupted jobs failed and permits retry. Database and file backup/restore must be coordinated; verify hash on restore. No new object store. Keep reports until explicit deletion policy is designed; do not tie them to job retention. Monitor disk usage and reject generation safely when full.

Regenerate always creates v2/v3, links supersedesId and keeps all earlier versions and URLs valid. Mark latest successful version in month list. A retry using the same idempotency key returns the same job/report; deliberate regeneration uses a new key. Parallel requests serialize version allocation with a database constraint. Notification retries reference the same report ID. Report bytes, facts and narrative stay immutable once ready; even narrative/template edits require a new version.

## UI and API proposal

- `/reports`: month rows with latest version, captured date, coverage warning and View / Download actions; expandable version history. Generate button is operator-only.
- `/reports/:id`: authenticated detail with version selector, coverage, PDF preview, Download PDF and Regenerate (operator). Bookmark/notification points here, not a public PDF URL. Preserve a validated same-origin return path through sign-in; never a token in a query string. Current UI sessions remain operator-only; reader bearer clients can list/view/download through API. Reader browser sessions would be a separate auth decision, unnecessary for v1.
- `GET /api/v1/reports?month=YYYY-MM` and `GET /api/v1/reports/:id`: `budget:read`, fixed configured budget, bounded pagination.
- `GET /api/v1/reports/:id/pdf`: `budget:read`, ownership/scope checked every request, `application/pdf`, private/no-store, safe Content-Disposition inline or attachment. Unauthorized returns 401/403; unknown/out-of-scope IDs 404.
- `POST /api/v1/reports`: `app:operate`, validated month/scope and idempotency key; returns 202 `{jobId,reportId}`. Regeneration includes supersedesId, validated to same budget/month. Session mutation uses existing CSRF/origin protections. Reject legacy mode for report endpoints rather than expose financial artifacts; no auth settings changed automatically.

## AI narrative only

A `ReportNarrativeService` accepts a small allowlisted facts DTO with stable fact IDs and coverage warnings. No transactions, payees, account names/IDs, notes or PDF are sent. External transmission still requires explicit later authorization even for aggregate facts. Disabled by default in first implementation. Use `AIAdapter` with webSearch false and bounded structured output; no tools. Require fact references, validate schema/length, escape rendered text, and reject unsupported numerical claims. Render numeric claims through server-resolved fact tokens where possible. Reject claims of completeness, recommendations to trade, or invented causes. On provider unavailable, timeout or invalid output, use a deterministic summary and badge it accordingly; report generation succeeds. Distinguish narrative source in metadata and PDF. Preserve safety/privacy policy across provider selection; no unapproved fallback.

Before enabling real-data AI: make logging metadata-only, sanitize provider errors, bound timeout/retry/token use, review provider data handling, and obtain user authorization. This milestone makes no AI API call.

## Generic Pushover delivery — later, off by default

Optional later notifier sends only “Your monthly report is ready” and a link to the exact saved report detail. No month, amounts, financial content, account names or attachment in push. Link is configured same-origin app base URL plus opaque report ID; authentication remains required. The external push provider necessarily sees that link, so make enablement explicit. Never commit the real hostname or tokens. No new credentials now. Trigger only after ready metadata and durable file commit; notification failure cannot invalidate the PDF. Track pending/sent/failed status separately with bounded retry; no financial payloads in logs. There is no requirement for a tunnel-specific route or a public download. Scheduling is later opt-in, monthly only, with coverage policy and timezone agreed before activation.

## Boundaries, tests, failure modes and delivery

Feature owner: actual-assist maintainer. Pure `ReportCalculator` owns all arithmetic; `ReportCapture` owns a coherent Actual read; `ReportService` orchestrates jobs and version allocation; `ReportRepository` and `ReportFileStore` own persistence; `ReportPdfRenderer` consumes facts and validated narrative; `ReportNarrativeService` owns optional AI; future notifier owns generic delivery. One facts object feeds charts, PDF, UI and narrative so calculations are never duplicated.

Failure codes: INVALID_MONTH/SCOPE (400), NOT_AUTHENTICATED (401), FORBIDDEN (403), NOT_FOUND (404), IDEMPOTENCY_CONFLICT (409), SOURCE_BUSY/UNAVAILABLE (503), INCONSISTENT_SPLITS, RENDER_FAILED, STORAGE_FULL, STORAGE_FAILED. Last four fail the job without exposing an incomplete report. AI failure uses a labeled fallback. Audit generation, regeneration, ready/failure and download with principal/report/job IDs, durations and counts only. Do not log facts or full provider errors.

Implementation sequence: (1) approved design; pure calculator + synthetic golden fixtures; (2) coherent capture, SQLite migration and immutable file lifecycle; (3) local PDF renderer + Reports UI/API jobs/audit; (4) optional privacy-safe narrative after explicit approval; (5) opt-in push and monthly schedule after separate approval. Later PRs draft. No release or deploy in design phase.

Use an HTML/CSS print template with a local headless Chromium adapter if the runtime size is acceptable. Existing Playwright is development-only: moving a pinned runtime/browser into the image requires a measured image-size/license/security review. Benchmark on homelab before adoption; alternative is a small Node PDF library behind the same renderer interface. No dependency added for this prototype; its local ReportLab script is design tooling, not production code. Targets pending baseline: 10k monthly rows under 5s capture/calculation, PDF under 10s and 2 MB, generation concurrency 1, AI timeout 20s with local fallback. Measure rather than claim these targets passed.

Tests required before implementation merge: integer arithmetic/refunds/zero income; split normalization and mismatch; transfers/closed/off-budget scope; month/timezone boundaries; uncategorized inflows; coverage qualification without treating inactivity as missing imports; same-key retry and parallel version races; interrupted write/orphan recovery/disk-full; retention independence; 401/403/cross-budget/path traversal; cookie CSRF; reader GET/operator POST; narrative schema/fact validation and log redaction; AI fallback; report persisted across restart; old versions unchanged after imports; e2e month list/view/download/regenerate; notification emits only approved generic fields. Standard gates: tests, lint, types, build and dependency scanning before release.

## Design validation

The accompanying generator asserts synthetic totals, percentages and category reconciliation, and creates a four-page PDF. Rendering and text extraction verify the PDF locally. No app tests were needed for this documentation-only milestone; application tests, runtime renderer benchmarks, actual SDK normalization, live auth, backups, AI and notification tests are not run. No commit, PR, credential, live API request, schedule or deployment created. No blocking product decision is required to review this design. Currency uses USD only as an explicitly synthetic visual assumption; production must read/validate the configured budget currency.

## Optional spending-pattern drill-down

The approved visual direction can extend to evidence-linked exploration on the authenticated Reports page. See [drill-down-proposal.md](drill-down-proposal.md) for a deliberately small, unimplemented increment, exact snapshot evidence requirements, AI boundaries, comparison/recurrence limitations and effort estimate. Scope approval is still needed before implementation; mockup approval does not enable real-data AI or approve PR creation.
