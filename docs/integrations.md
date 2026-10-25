# REST and MCP integrations

Actual Assist serves a versioned REST interface and a stateless Streamable HTTP MCP server on its existing HTTP listener. Both read the same configured budget through the existing `@actual-app/api` 26.10.0 adapter. No second process, budget cache, account, or synchronization loop is introduced. The existing UI `/api` contract remains unchanged; there was no previous MCP server in this repository.

## Enable deliberately

Integrations default to disabled (HTTP 404). Set `INTEGRATIONS_ENABLED=true` and supply `INTEGRATIONS_TOKEN` from a secret manager (at least 32 characters). Every integration request, including health and MCP initialization, requires `Authorization: Bearer <token>` in every environment. Missing configuration fails startup. Never put tokens in URLs or chart values. The chart uses `integrations.enabled` and reads the token from `secrets.existingSecretName` via the existing Secret environment reference.

This token grants access to the configured budget's financial data. Provisioning it and enabling the feature require a reviewed access and rollout plan. The legacy UI routes retain their existing deployment-level access policy; this change does not retrofit bearer authentication onto them. Use the existing private ingress or local forwarding, with TLS at the trusted ingress for remote clients. Do not expose a public listener or send bearer tokens over an untrusted plaintext connection.

Requests carrying an `Origin` header are denied unless it exactly matches an entry in the comma-separated `INTEGRATIONS_ALLOWED_ORIGINS` (chart: `integrations.allowedOrigins`). This is an origin check for MCP clients, not a browser CORS API. Native clients without Origin are supported. Neither credentials nor financial response bodies are logged by the integration layer. Responses have `Cache-Control: no-store`.

## REST contract

All paths are relative to the existing server address. Collections return `{data: [...], pagination: {offset, limit, total}, jobId}`. Amounts are integer cents, dates are ISO calendar dates, and IDs are Actual IDs. Accounts and transactions use the official API fields (transactions include `payee`, `category`, `amount`, and `date`); categories, payees, and schedules use the existing adapter's normalized DTOs. Categories omit hidden/unnamed categories; payees and schedules follow the existing UI filtering.

| Method | Path | Parameters |
| --- | --- | --- |
| GET | `/integrations/v1/health` | none; authenticated readiness and application version |
| GET | `/integrations/v1/accounts` | `limit`, `offset` |
| GET | `/integrations/v1/categories` | `limit`, `offset` |
| GET | `/integrations/v1/payees` | `limit`, `offset` |
| GET | `/integrations/v1/schedules` | `limit`, `offset` |
| GET | `/integrations/v1/transactions` | required UUID `accountId`, `startDate`, `endDate`; `limit`, `offset` |

Pagination defaults to 100 rows, with maximum limit 500 and offset 100000. Transaction date windows are inclusive and at most 93 days apart. Unknown parameters, invalid dates, reversed dates, missing transaction filters, and out-of-range pagination return 400. Pagination is over the current cached result, not a stable snapshot across calls; transaction filtering is pushed into the official API before pagination. Collection queries may materialize all matching rows in memory. There is no arbitrary AQL, budget switching, write, import, or synchronization endpoint in this version.

REST errors are `{error: CODE, message: "safe explanation"}`: 400 `INVALID_ARGUMENT`/`INVALID_REQUEST`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN_ORIGIN`, 404 `NOT_FOUND`, 413 `PAYLOAD_TOO_LARGE`, 429 `RATE_LIMITED`, and 503 `UNAVAILABLE`/`BUSY`. Requests are limited to 120 per minute per peer IP, with at most 16 pending integration reads and 32 KiB JSON bodies. Behind an unconfigured proxy the rate limit conservatively applies to the proxy peer; this change does not alter Express proxy trust.

Example using a token already supplied through your secret manager:

```sh
curl --fail --header "Authorization: Bearer ${INTEGRATIONS_TOKEN}" \
  'http://127.0.0.1:3000/integrations/v1/accounts?limit=20'
```

## MCP contract

Connect a Streamable HTTP client to `/integrations/mcp` with the same Authorization header. The official SDK handles initialization, protocol negotiation, tool listing/calls, and JSON-RPC errors. This endpoint is stateless: no session ID or persistent SSE subscription is created; GET and DELETE return 405. It is not the legacy HTTP+SSE transport and does not provide stdio.

Tools are `list_accounts`, `list_categories`, `list_payees`, `list_schedules`, and `list_transactions`, with the same parameters as REST. Successful tool calls return the REST envelope as `structuredContent` and JSON text content. Application failures use `isError: true` with a redacted coded error. Malformed protocol calls are handled by the SDK. HTTP authentication and origin failures occur before protocol dispatch.

## Ownership, lifecycle, and verification

`IntegrationService` owns input validation, job/audit tracking, readiness, pending request limits, and result pagination. REST and MCP are thin transports. Reads record an `integration_read` job and success/failure audit event with operation, transport, count, and duration; financial values, filters, and tokens are excluded. Validation/authentication failures do not create jobs. Reads create persistent job/audit rows. The existing JobRetentionService can remove old jobs when invoked, but the server does not currently schedule automatic retention; operators should account for storage growth.

`ActualBudgetAdapter` owns the one process-global API session. Every public async adapter operation enters one FIFO queue, including legacy UI/scheduler operations, initialization, and shutdown. Internal method composition uses private methods within that same session to avoid nested queue deadlocks. This serializes adapter operations, not multi-operation UI workflows into database transactions. Budget listing reuses an initialized session instead of reinitializing it. MCP request completion closes only its transport, never the budget. SIGINT/SIGTERM stop new integration work and the scheduler, close HTTP, drain integration work and queued API operations, then close Actual and SQLite. Existing background UI jobs are not made transactional or restart-resumable by this change; avoid upgrading during active financial workflows. An unresponsive backend remains subject to the deployment's termination grace period.

Automated tests use injected fixture readers and a mocked Actual API. They never start `src/server.ts`, initialize a real budget, read credentials, synchronize, import, or mutate financial records. The SDK client integration tests run on loopback ephemeral ports. Full repository gates are `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run test:e2e`, and Helm lint.

## Dependency decision

The official MCP TypeScript SDK is pinned to 1.32.2 (MIT; about 4.5 MB unpacked package), with its dependency graph committed in the lockfile. It owns the protocol rather than hand-written JSON-RPC. Removing MCP only requires removing this transport and dependency; REST/domain operations do not depend on it. Production dependencies are audited before release.

The community [actual-http-api](https://github.com/jhonderson/actual-http-api) is a standalone Express application, not a documented embeddable library. Its server startup and separate Actual lifetime would conflict with this app. No upstream implementation code is copied. This implementation retains the existing official API pin and uses its public read methods; it does not upgrade the SDK or deployed Actual server as part of enabling integrations.

## Release and rollback review

Proposed feature version: 0.9.0, after draft PR review and exact-SHA CI. Before release, verify the deployed Actual server is compatible with API 26.10.0. Publish only with orchestrator authorization; the version workflow updates npm/Helm together and tags `v0.9.0`, triggering image tags `0.9.0`/`0.9`, chart 0.9.0, and the GitHub release. Release and chart-index git identities must both use `amathew121@gmail.com`. Inspect resulting remote author/committer identities and image provenance/digest before rollout.

Preserve the previous chart and image digest and back up the existing PVC using the established operator process before any approved upgrade. No new schema migration is added. First deploy with integrations disabled, verify health and existing UI, then enable only after approving the token source and access policy. Health/authentication checks do not read financial records. Functional checks against a real budget require separate authorization.

The October 25 deployment investigation reports 0.8.1 is already crash-looping and Helm has no healthy rollback target; a historical controller-to-Kubernetes API trust error was observed, but is not confirmed as a current blocker. Returning to the 0.8.1 configuration is a configuration rollback, not a recovery guarantee. Do not publish/deploy as a workaround for these unresolved blockers, and do not change cluster trust as part of this feature. Resolve the application startup cause and coordinate the existing controller issue with the operator first. Disable integrations and restore the exact prior chart/image if the new feature fails; do not delete or migrate budget data during rollback.

### Startup compatibility evidence

The released [v0.8.1 package](https://github.com/mathewab/actual-assist/blob/v0.8.1/package.json) pins Actual API 26.8.1. Current main already pins 26.10.0, matching the reported live Actual server 26.10.0. The official 26.10.0 core includes `1787013118115_add_account_groups.sql`, which creates `account_groups` and adds `accounts.account_group_id`. An isolated in-memory SQLite fixture reproduced `no such column: account_group_id` before applying that SQL and successfully queried the column afterward. This supports an SDK/schema mismatch diagnosis; it does not prove the state or recovery behavior of the live cache. No real budget or cached database was opened. The feature release also includes all previously unreleased main changes since 0.8.1, including that SDK upgrade; operators must review the complete release diff and backup/recovery plan, not only this PR.
