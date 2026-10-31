# Monthly reports: operation and validation

The Reports page generates a local PDF and immutable evidence snapshot. Choose the budget currency explicitly; no currency conversion is performed. Report totals describe recorded on-budget transactions, including historical activity in closed accounts. New reports capture the requested month plus up to twelve preceding months already present in the cache. They never sync, import, categorize or mutate Actual transactions.

## Explore a saved version

Open a saved month/version, select an observation, category or captured payee, then inspect the supporting rows. The filtered subtotal is distinct from the report total. Split children are counted once; their parent amount is context only. Transfers remain explicitly excluded from spending. Unknown payees remain unknown and are not fuzzy-merged.

Historical comparisons use existing captured records immediately, with no requirement for earlier saved PDFs or future data collection. The app shows actual observed dates and counts. A quiet month is a recorded zero, not evidence of missing imports. Current-month comparisons use the same day cutoff (UTC capture date), clearly labelled; historical full-month comparisons remain independent of current freshness. Repeated purchases across at least three observed months are described as repetition, never as a confirmed subscription. No causal or fraud claims are generated.

Every version keeps its own payee/category labels, supporting rows, baseline, observations, summary and PDF. Later imports and renames require explicit regeneration and cannot rewrite old evidence. Older report versions that predate evidence storage show detail-unavailable and can still be downloaded. Historical classification reflects the captured Actual category assignments; the app does not claim to reconstruct past category edits or verify import completeness. It has no authoritative bank-import ledger and therefore does not invent import-gap warnings.

Read APIs: `/api/v1/reports/:id`, `/:id/observations`, `/:id/transactions`, `/:id/pdf`. Evidence filters include observationId, categoryId, payeeId or month; pagination is bounded. They reuse `budget:read`, configured-budget scope and existing sessions. Generation and notification retry require `app:operate` plus existing session CSRF checks. API responses are private/no-store. Evidence reads have audit events without transaction contents.

## Optional AI highlights (off by default)

`REPORT_AI_ENABLED=false` by default. Explicit enablement sends only allowlisted aggregate income/net-spending/net amounts, currency, generic observation IDs and kinds to the selected existing `AI_BACKEND`. It sends no transaction rows, dates, payees, category/account names, notes, budget IDs or PDFs. Existing provider credentials must already exist; none are created by this feature. Report AI never falls back to a different provider.

The model selects up to three valid observation IDs. All displayed prose and numbers are resolved from server-calculated observations, so the model cannot introduce invented causes or amounts. The UI/PDF labels this as AI-assisted/AI-selected highlights; it is intentionally narrower than open-ended financial advice. Invalid output, timeout or provider failure yields the local summary. Requests are abortable and bounded to 20 seconds. Web search is disabled. Prompts, responses and provider error bodies are not logged.

Do not enable this setting until the user authorizes real aggregate financial-data transmission. All implementation tests use mock providers.

## Optional Pushover (off by default)

`REPORT_PUSH_ENABLED=false` by default. Future opt-in requires existing `REPORT_PUSH_TOKEN`, `REPORT_PUSH_USER` and `REPORT_APP_ORIGIN`. The origin must be an already allowed HTTPS app origin; configuring reports does not grant access or create credentials.

Only a generic “Your monthly report is ready” message, generic title, and exact `/reports/<opaque-id>` link are sent. No amounts, month, transaction/payee data or PDF is sent. Opening the link requires normal authentication. The provider necessarily sees the app origin/report link; opt-in must account for that.

Notifications run only after saving the PDF and metadata. Their status is persisted separately from immutable report content: pending, sent, failed or uncertain. Concurrent requests claim one delivery attempt. Each provider request has a 15-second timeout and no automatic HTTP retry. Definitively failed attempts can be retried by an operator from the Reports page; uncertain/network-timeout results are not automatically or manually resent by this feature. Interrupted pending attempts become uncertain. Failure never deletes or invalidates the report. Delivery uses existing jobs and audit logging, without provider response bodies or credentials.

## Optional monthly schedule (off by default)

`REPORT_SCHEDULE_ENABLED=false` by default. Configure `REPORT_CURRENCY`, `REPORT_TIMEZONE` (IANA), `REPORT_SCHEDULE_DAY` (1–28, default 2), and `REPORT_SCHEDULE_HOUR` (0–23, default 8) before future opt-in. Enforced authentication is required for enabled report integrations.

The existing node-cron dependency generates the previous calendar month in the selected timezone. Stable per-budget/month keys reuse a successfully saved report if a run repeats; failure before publication can be retried. Jobs record a scheduled trigger. One generation runs at a time, with bounded pending requests and graceful stop/drain. There is no bank refresh, automatic old-version rewrite or automatic catch-up after downtime; generate missed reports manually. Scheduling and notification flags are independent. No production schedule or notification was activated during development.

## Storage and scope

Evidence is stored in the existing SQLite report JSON, atomically with metadata, rather than adding a separate service or duplicate normalized transaction tables. Collection responses omit evidence; detail exposes observations/history while rows are served through the bounded evidence endpoint. Delivery state has one small SQLite table and migration. PDFs remain on the existing volume. No backup infrastructure or additional recovery service is introduced.

This is a single-writer personal homelab feature. Source transactions are captured coherently in the existing Actual queue; derived work runs outside that queue. No new runtime dependency is added by drilldowns/integrations beyond the already pinned PDF renderer.
