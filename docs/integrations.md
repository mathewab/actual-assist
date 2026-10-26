# REST and MCP integrations

Actual Assist serves a versioned REST interface and a stateless Streamable HTTP MCP server on its existing HTTP listener. Both read the same configured budget through the existing `@actual-app/api` 26.10.0 adapter. No second process, budget cache, account, or synchronization loop is introduced. Existing UI `/api` response shapes remain unchanged; there was no previous MCP server in this repository.

## Authentication and permissions

One HTTP listener serves the UI, `/api/v1` REST reads, and `/mcp`. Transport deployment (including private tunnels, proxies, and their credentials) belongs to infrastructure configuration, not application routing. Authentication is not network isolation: an ingress forwarding this listener also forwards these routes unless its own policy restricts them. Keep TLS and deployment access controls in place.

Defaults preserve the existing UI with `AUTH_MODE=legacy` and `MACHINE_API_ENABLED=false`. Machine access cannot be enabled in legacy mode. With `AUTH_MODE=enforced`, every `/api` operation and `/mcp` request requires authentication, except the bounded session login/status/logout endpoints. Static UI assets and minimal `/health` and `/ready` probes remain public. Enforced mode requires an explicitly configured operator credential and exact UI origins; it works with machine access disabled too.

Supply `AUTH_CREDENTIALS_JSON` from a secret manager as an array of objects with `id`, `token`, and `role`. IDs must be unique, 1–64 letters/digits/underscores/hyphens. Tokens must be unique high-entropy secrets of 32–512 characters, never human passwords. No credentials are created by the application or chart. Never commit them, put them in URLs, or store them in browser storage.

| Role | Permissions | Access |
| --- | --- | --- |
| `reader` | `budget:read` | Enabled REST reads and MCP tools only |
| `operator` | `budget:read`, `app:operate`, `ui:session` | Reads plus existing UI/API operations and UI sign-in |

An operator credential is powerful: existing categorization, merge, configuration, jobs, and other legacy actions retain their existing behavior. A reader cannot access those routes, including audit and job streams. This adds no budget write endpoints to REST/MCP. Permission checks are centralized; adding a legacy API route inherits the operator requirement. API bearer authentication uses `Authorization: Bearer <credential>`. An invalid bearer header never falls back to a valid browser session.

The UI exchanges an operator credential at `POST /api/auth/login` for an opaque HttpOnly, SameSite=Strict cookie scoped to `/api`. The credential field is cleared after submission. Sessions are bounded to 1,000, expire absolutely after `AUTH_SESSION_TTL_SECONDS` (default 3,600; range 300–86,400), and are revoked on logout or process restart. `GET /api/auth/session` returns session state and an in-memory CSRF token; `POST /api/auth/logout` revokes the session. Session-authenticated unsafe requests require an allowed Origin and `X-CSRF-Token`; logout and expiry close that session's job-event SSE connections. The UI clears cached data on expiry/logout and rechecks sessions on back navigation. Logout does not cancel already accepted jobs or in-flight operations.

Set comma-separated `AUTH_ALLOWED_ORIGINS` to exact UI origins. Requests presenting another Origin are denied; native bearer clients without Origin are supported. This is not a cross-origin browser API. Production requires HTTPS origins and `AUTH_COOKIE_SECURE=true`; local HTTP development can explicitly disable secure cookies outside production. Do not trust arbitrary forwarded identity headers: none are accepted. Login is limited to five attempts per minute per peer IP, API traffic to 120; behind a proxy limits apply to the peer unless a separately reviewed trust policy is configured.

`AuthenticationProvider` produces a named principal, while authorization and session issuance remain separate. A future verified OIDC/Authelia adapter can map identities to these explicit roles without changing domain services or REST/MCP authorization. That requires a separate design for issuer verification, callbacks, trust boundaries, and revocation; no Authelia, proxy-header authentication, or Actual Budget server authentication change is implemented here.

## Configuration and migration

Chart values are `auth.mode`, `auth.allowedOrigins`, `auth.cookieSecure`, `auth.sessionTtlSeconds`, and `machineApi.enabled`. Credentials come from `secrets.existingSecretName` through the existing environment Secret reference. ConfigMap changes trigger pod rollout via checksum. Secret rotation requires a controlled restart, revoking existing sessions; no secret watcher or extra permissions are introduced.

This replaces the 0.9.0 opt-in integration contract: `/integrations/v1/*` becomes `/api/v1/*`, and `/integrations/mcp` becomes `/mcp`. Old paths return 404 without redirects. Remove `INTEGRATIONS_ENABLED`, `INTEGRATIONS_TOKEN`, and `INTEGRATIONS_ALLOWED_ORIGINS`; active obsolete configuration fails startup instead of silently restoring unauthenticated UI access. The chart also rejects the old enabled integration setting. Provision explicit named credentials and update clients before enabling the new mode. Existing legacy UI route URLs and response shapes remain unchanged, but enforced mode deliberately adds sign-in and authorization.

Activation, credential provisioning, ingress policy, and rollout require an operator plan separate from source changes. Auth configuration must be validated before budget initialization. Startup still opens/migrates local databases and calls Actual `downloadBudget`, which may synchronize upstream; neither read-only machine roles nor disabling scheduled sync makes startup read-only.

## REST contract

All paths are relative to the existing server address. Collections return `{data: [...], pagination: {offset, limit, total}, jobId}`. Amounts are integer cents, dates are ISO calendar dates, and IDs are Actual IDs. Accounts and transactions use the official API fields (transactions include `payee`, `category`, `amount`, and `date`); categories, payees, and schedules use the existing adapter's normalized DTOs. Categories omit hidden/unnamed categories; payees and schedules follow the existing UI filtering.

| Method | Path | Parameters |
| --- | --- | --- |
| GET | `/api/v1/health` | none; authenticated readiness and application version |
| GET | `/api/v1/accounts` | `limit`, `offset` |
| GET | `/api/v1/categories` | `limit`, `offset` |
| GET | `/api/v1/payees` | `limit`, `offset` |
| GET | `/api/v1/schedules` | `limit`, `offset` |
| GET | `/api/v1/transactions` | required UUID `accountId`, `startDate`, `endDate`; `limit`, `offset` |

Pagination defaults to 100 rows, with maximum limit 500 and offset 100000. Transaction date windows are inclusive and at most 93 days apart. Unknown parameters, invalid dates, reversed dates, missing transaction filters, and out-of-range pagination return 400. Pagination is over the current cached result, not a stable snapshot across calls; transaction filtering is pushed into the official API before pagination. Collection queries may materialize all matching rows in memory. There is no arbitrary AQL, budget switching, write, import, or synchronization endpoint in this version.

REST errors are `{error: CODE, message: "safe explanation"}`: 400 `INVALID_ARGUMENT`/`INVALID_REQUEST`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`/`FORBIDDEN_ORIGIN`/`CSRF_REQUIRED`, 404 `NOT_FOUND`, 413 `PAYLOAD_TOO_LARGE`, 429 `RATE_LIMITED`, and 503 `UNAVAILABLE`/`BUSY`. Requests are limited to 120 per minute per peer IP, with at most 16 pending integration reads and 32 KiB JSON bodies. Behind an unconfigured proxy the rate limit conservatively applies to the proxy peer; this change does not alter Express proxy trust.

Example using a token already supplied through your secret manager:

```sh
curl --fail --header "Authorization: Bearer ${API_CREDENTIAL}" \
  'http://127.0.0.1:3000/api/v1/accounts?limit=20'
```

## MCP contract

Connect a Streamable HTTP client to `/mcp` with the same Authorization header. The official SDK handles initialization, protocol negotiation, tool listing/calls, and JSON-RPC errors. This endpoint is stateless: no session ID or persistent SSE subscription is created; GET and DELETE return 405. It is not the legacy HTTP+SSE transport and does not provide stdio.

Tools are `list_accounts`, `list_categories`, `list_payees`, `list_schedules`, and `list_transactions`, with the same parameters as REST. Successful tool calls return the REST envelope as `structuredContent` and JSON text content. Application failures use `isError: true` with a redacted coded error. Malformed protocol calls are handled by the SDK. HTTP authentication and origin failures occur before protocol dispatch.

## Ownership, lifecycle, and verification

`IntegrationService` owns input validation, job/audit tracking, readiness, pending request limits, and result pagination. REST and MCP are thin transports. Reads record an `integration_read` job and success/failure audit event with operation, transport, named principal ID, count, and duration; financial values, filters, and tokens are excluded. Validation/authentication failures do not create budget jobs. Login success/failure and logout are audit events without credentials; operator jobs and audit entries carry request principal attribution. Reads create persistent job/audit rows. The existing JobRetentionService can remove old jobs when invoked, but the server does not currently schedule automatic retention; operators should account for storage growth.

`ActualBudgetAdapter` owns the one process-global API session. Every public async adapter operation enters one FIFO queue, including legacy UI/scheduler operations, initialization, and shutdown. Internal method composition uses private methods within that same session to avoid nested queue deadlocks. This serializes adapter operations, not multi-operation UI workflows into database transactions. Budget listing reuses an initialized session instead of reinitializing it. MCP request completion closes only its transport, never the budget. SIGINT/SIGTERM stop new integration work and the scheduler, end registered job-event SSE streams (including their heartbeat/subscriptions), close HTTP after ordinary in-flight requests finish, drain integration work and queued API operations, then close Actual and SQLite. Existing background UI jobs are not made transactional or restart-resumable by this change; avoid upgrading during active financial workflows. An unresponsive backend remains subject to the deployment's termination grace period.

Automated tests use injected fixture readers and a mocked Actual API. They never start `src/server.ts`, initialize a real budget, read credentials, synchronize, import, or mutate financial records. The SDK client integration tests run on loopback ephemeral ports. Full repository gates are `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run test:e2e`, and Helm lint.

## Dependency decision

The official MCP TypeScript SDK is pinned to 1.32.2 (MIT; about 4.5 MB unpacked package), with its dependency graph committed in the lockfile. It owns the protocol rather than hand-written JSON-RPC. Removing MCP only requires removing this transport and dependency; REST/domain operations do not depend on it. Production dependencies are audited before release.

The community [actual-http-api](https://github.com/jhonderson/actual-http-api) is a standalone Express application, not a documented embeddable library. Its server startup and separate Actual lifetime would conflict with this app. No upstream implementation code is copied. This implementation retains the existing official API pin and uses its public read methods; it does not upgrade the SDK or deployed Actual server as part of enabling integrations.

## Deployment and lifecycle controls

Authentication is a deliberate configuration migration. Verify exact-SHA tests and image provenance before rollout; do not enable machine access on an unprotected legacy API. Default chart settings preserve legacy UI behavior with machine routes disabled. No tunnel image, sidecar, separate listener, or tunnel credential is configured by this chart.

The chart enforces one replica (or zero for maintenance) and uses `Recreate`. `storage.existingClaim` can select a pre-provisioned PVC without removing the original chart-owned PVC. The external claim must have no other writer; Recreate does not fence manual pods or other deployments. Storage recovery policy remains an operator decision; do not delete caches or claims as an authentication migration step.

`SCHEDULED_SYNC_ENABLED=false` (chart `env.scheduledSyncEnabled`) disables only the app's scheduled sync timer. It does not disable startup download/migration/synchronization, SDK services, or manually requested operator actions. Existing scheduling behavior is unchanged: intervals above 59 minutes currently schedule hourly. Keep previous chart/image references and review compatibility before rollback; a prior crash-looping image is not a recovery guarantee.
