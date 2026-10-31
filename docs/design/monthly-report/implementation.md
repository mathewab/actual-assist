# Monthly reports — implemented draft

The feature remains on `feat/monthly-report-history`. It delivers manual monthly PDF generation, immutable version history, authenticated viewing/download, exact saved-transaction drilldowns, existing-history observations, constrained opt-in AI highlights, generic opt-in Pushover notifications and opt-in monthly scheduling. All three integrations default to off. No production setting, credential, access policy or deployment was changed during implementation.

See [usage.md](usage.md) for configuration, endpoints, privacy boundaries and operating behavior. The original [design](design.md) and [drill-down proposal](drill-down-proposal.md) are historical design records; this document and usage.md describe the current code.

## Implemented boundaries

- ReportCapture reads the month plus up to twelve preceding months coherently through the existing Actual queue. The schema strips free-text notes/imported descriptions and retains captured payee IDs/names locally. Closed-account history and hidden category assignments remain included within on-budget scope.
- ReportCalculator produces integer-minor-unit facts and normalized contribution rows through one implementation, including checked intermediate sums. Split children count once, refunds reduce spending, transfers are excluded, and unclassified positive inflows are explicit.
- ReportAnalysis freezes baseline months, observations and exact supporting evidence. Current-month comparisons use matching UTC day cutoffs; historical trends use available imported records immediately. Quiet months do not imply missing imports. Repetition is not represented as a subscription or a guaranteed recurring payment.
- SQLite stores evidence in immutable report JSON rather than introducing a second service or transaction table. ReportRepository omits evidence from archive responses. Bounded evidence endpoints read only the selected saved version and configured budget. Old versions without evidence explicitly report detail-unavailable.
- ReportService owns generation, idempotent successful requests, versions, jobs, audit and persistence. POST returns 201 after local generation. Failed/unpublished generation is retryable. Canceled/timed-out jobs cannot publish. One writer and bounded pending work match the homelab topology.
- ReportPdfRenderer consumes calculated facts, validated summary and highlights. PDFKit 0.17.2 is pinned; the local DejaVu font carries its redistribution license. No remote assets or browser runtime is used. Fonts/migrations are copied into the Docker runtime; builder/runtime both use Node 24.
- ReportNarrativeService is opt-in and calls only the explicitly selected existing provider, with no provider fallback or web tools. Only aggregate amounts/currency and generic observation IDs/kinds leave the app. The model selects valid IDs; server-owned wording supplies every displayed number and claim. Invalid IDs/prose, errors and timeout fall back locally.
- ReportDeliveryService stores notification state separately from report content, uses jobs/audit, and deduplicates attempts. Pushover receives only generic availability text and the exact authenticated report link. Explicit failed retries are operator-only; uncertain outcomes are never resent automatically. A notification failure cannot invalidate the saved report.
- ReportScheduler uses existing node-cron, prior-calendar-month selection in the configured timezone and deterministic per-budget/month request keys. It is disabled by default, has no automatic bank sync or downtime catch-up, and stops before generation drains.

## Privacy and access

Existing generic reader/operator permissions and UI sessions protect all report APIs; mutation requests retain CSRF/origin checks. Integrations require existing enforced authentication when enabled. Configuring report origin does not expand the allowed origins. No credentials are created. The report-specific AI path does not send rows, dates, category/payee/account names, notes or PDFs. Provider request/response bodies and errors are not logged. Notifications contain no month, amounts or attachment. Evidence reads and delivery attempts have audit events without financial payloads.

Files and metadata retain their original versions. Local temporary-file handling, hash checks and interrupted-job handling support core consistency; no backup infrastructure or additional recovery service is introduced.

## Validation and remaining gates

Synthetic tests cover arithmetic, split/transfer/refund handling, immediate use of historical records, quiet/zero-baseline months, current-month cutoffs, frozen category/payee evidence, cross-budget and unknown-observation rejection, old-version behavior, idempotency/revisions, storage failure, canceled jobs, authentication/CSRF, AI payload minimization and fallback, Pushover generic payload/error handling, delivery deduplication/uncertainty, and schedule keys/timezones/defaults.

The browser fixture covers generate, saved detail, observation-to-transaction dialog, revision, stable old versions and download links. API integration tests use real temporary SQLite and the actual PDF renderer; external providers are mocks. A read-only distroless Node 24 container with networking disabled validates native SQLite, migrations, fonts/PDF, evidence/history reopening and mock delivery.

The standalone UI typecheck has 111 pre-existing MUI incompatibility errors, reproduced at the prior feature baseline with the same dependencies; no new report errors. Server TypeScript and Vite build are separate passing gates. The UI bundle-size warning remains. A full production Docker build was blocked by Debian DNS resolution in the environment, including the final validation attempt; the runtime smoke test uses mounted compiled output/dependencies and is not represented as a complete image build. No live Actual, external provider, production notification/schedule, merge, release or deployment was exercised. Full final check counts and the final commit are recorded in the task completion report.
