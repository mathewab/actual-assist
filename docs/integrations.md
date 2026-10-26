# REST and MCP integrations

Actual Assist serves a versioned REST interface and a stateless Streamable HTTP MCP server on its existing HTTP listener. Both read the same configured budget through the existing `@actual-app/api` 26.10.0 adapter. No second process, budget cache, account, or synchronization loop is introduced. The existing UI `/api` contract remains unchanged; there was no previous MCP server in this repository.

## Enable deliberately

Integrations default to disabled (HTTP 404). Set `INTEGRATIONS_ENABLED=true` and supply `INTEGRATIONS_TOKEN` from a secret manager (at least 32 characters). Every integration request, including health and MCP initialization, requires `Authorization: Bearer <token>` in every environment. Missing configuration fails startup. Never put tokens in URLs or chart values. The chart uses `integrations.enabled` and reads the token from `secrets.existingSecretName` via the existing Secret environment reference. A ConfigMap checksum in the Deployment pod template triggers rollout when enable/disable or origin settings change. External Secret value changes do not change that checksum: token rotation requires an operator-controlled pod restart after the Secret is updated. No secret-watching controller or permissions are introduced.

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

`ActualBudgetAdapter` owns the one process-global API session. Every public async adapter operation enters one FIFO queue, including legacy UI/scheduler operations, initialization, and shutdown. Internal method composition uses private methods within that same session to avoid nested queue deadlocks. This serializes adapter operations, not multi-operation UI workflows into database transactions. Budget listing reuses an initialized session instead of reinitializing it. MCP request completion closes only its transport, never the budget. SIGINT/SIGTERM stop new integration work and the scheduler, end registered job-event SSE streams (including their heartbeat/subscriptions), close HTTP after ordinary in-flight requests finish, drain integration work and queued API operations, then close Actual and SQLite. Existing background UI jobs are not made transactional or restart-resumable by this change; avoid upgrading during active financial workflows. An unresponsive backend remains subject to the deployment's termination grace period.

Automated tests use injected fixture readers and a mocked Actual API. They never start `src/server.ts`, initialize a real budget, read credentials, synchronize, import, or mutate financial records. The SDK client integration tests run on loopback ephemeral ports. Full repository gates are `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run test:e2e`, and Helm lint.

## Dependency decision

The official MCP TypeScript SDK is pinned to 1.32.2 (MIT; about 4.5 MB unpacked package), with its dependency graph committed in the lockfile. It owns the protocol rather than hand-written JSON-RPC. Removing MCP only requires removing this transport and dependency; REST/domain operations do not depend on it. Production dependencies are audited before release.

The community [actual-http-api](https://github.com/jhonderson/actual-http-api) is a standalone Express application, not a documented embeddable library. Its server startup and separate Actual lifetime would conflict with this app. No upstream implementation code is copied. This implementation retains the existing official API pin and uses its public read methods; it does not upgrade the SDK or deployed Actual server as part of enabling integrations.

## Release and rollback review

Proposed feature version: 0.9.0, after draft PR review and exact-SHA CI. Before release, verify the deployed Actual server is compatible with API 26.10.0. The version workflow updates npm/Helm together and tags `v0.9.0`, triggering image tags `0.9.0`/`0.9`, chart 0.9.0, and the GitHub release. Verify the published image provenance and digest before rollout.

Preserve the previous chart and image digest and back up the existing PVC using the established operator process before any approved upgrade. No new schema migration is added. First deploy with integrations disabled, verify health and existing UI, then enable only after approving the token source and access policy. Health/authentication checks do not read financial records. Functional checks against a real budget require separate authorization.

The October 25 deployment investigation reports 0.8.1 is already crash-looping and Helm has no healthy rollback target; a historical controller-to-Kubernetes API trust error was observed, but is not confirmed as a current blocker. Returning to the 0.8.1 configuration is a configuration rollback, not a recovery guarantee. Do not publish/deploy as a workaround for these unresolved blockers, and do not change cluster trust as part of this feature. Resolve the application startup cause and coordinate the existing controller issue with the operator first. Disable integrations and restore the exact prior chart/image if the new feature fails; do not delete or migrate budget data during rollback.

### Startup compatibility evidence

The released [v0.8.1 package](https://github.com/mathewab/actual-assist/blob/v0.8.1/package.json) pins Actual API 26.8.1. Current main already pins 26.10.0, matching the reported live Actual server 26.10.0. The official 26.10.0 core includes `1787013118115_add_account_groups.sql`, which creates `account_groups` and adds `accounts.account_group_id`. An isolated in-memory SQLite fixture reproduced `no such column: account_group_id` before applying that SQL and successfully queried the column afterward. This supports an SDK/schema mismatch diagnosis; it does not prove the state or recovery behavior of the live cache. No real budget or cached database was opened. The feature release also includes all previously unreleased main changes since 0.8.1, including that SDK upgrade; operators must review the complete release diff and backup/recovery plan, not only this PR.

### Restored-copy rollout controls

The chart enforces one application replica (or zero for coordinated maintenance) and uses `Recreate`, so Deployment upgrades terminate the old pod before starting the new pod. `storage.existingClaim` selects a pre-provisioned/restored PVC in the same namespace; blank retains the original claim. The original chart-owned `<release-fullname>-data` PVC is still rendered unchanged when an external claim is selected, avoiding Helm pruning during the switch. Do not uninstall the release or delete its original PVC as a rollback action: keeping that resource in the chart does not change its storage reclaim policy. The external claim must not be mounted by another application writer. Recreate does not fence other deployments or manual pods.

For a separately approved restored-copy rollout, use these values (claim name is illustrative):

```yaml
app:
  replicaCount: 1
storage:
  existingClaim: actual-assist-restored-0-9-0
env:
  scheduledSyncEnabled: false
integrations:
  enabled: false
```

`SCHEDULED_SYNC_ENABLED` (chart `env.scheduledSyncEnabled`) defaults to true to preserve existing behavior. False prevents creation of the app's scheduled sync timer; configuration changes trigger pod rollout through the ConfigMap checksum. It does **not** disable startup `api.downloadBudget()`, local database migrations, upstream synchronization, SDK services, or manually requested legacy UI operations. Existing interval behavior is unchanged: values above 59 minutes currently schedule hourly despite the default value of 360. `SYNC_INTERVAL_MINUTES=0` remains invalid; use the explicit enable flag.

All `/data` contents must be preserved during an approved backup: app `actual-assist.db` and possible SQLite sidecars, Actual budget directories/databases/metadata, and all other SDK state. Stop the application writer before an archive, verify the archive outside the volume's failure domain, and restore into a separate PVC before starting the new application. Actual initialization against that copy can migrate and sync; it is not a read-only verification step and requires explicit operational approval. No chart setting performs the archive, restore, or migration on the operator's behalf.

## Private listener and optional tunnel sidecar

`INTEGRATIONS_LISTENER=shared` preserves the existing routing. Set
`INTEGRATIONS_LISTENER=loopback` with `INTEGRATIONS_ENABLED=true` to serve the
same authenticated router only on `127.0.0.1:INTEGRATIONS_PORT` (default 3001).
The UI port returns JSON 404 for all `/integrations` paths before the SPA fallback,
including when integrations are disabled. The private port must differ from
`PORT`; a bind failure stops startup rather than falling back to a public address.
UI routes remain on their original port. Both listeners share the existing
IntegrationService, job/audit tracking and serialized Actual session. Shutdown
stops accepting integration work and drains both listeners before closing that
session and SQLite. No second budget connection is created (constitution P1/P2/P3/P5/P7).

The chart's optional `tunnel` sidecar targets the loopback MCP URL only. REST
shares the private listener but is not exposed through a Service or tunnel target.
Do not expose the private port via host networking, a Service, or Ingress. This is
a same-pod trust boundary: other containers in the pod can reach loopback and
still need the bearer token. There is no independent REST public-port option.

Preparation values (not a deployable credential configuration):

```yaml
integrations:
  enabled: true
  listener: loopback
  port: 3001
tunnel:
  enabled: false
  image: "" # Set an independently provenance-verified official image digest.
  tunnelId: "" # Dedicated Actual tunnel, separate from other services.
  existingSecretName: ""
```

Enabling the sidecar requires enabled loopback integrations, an explicit
`ghcr.io/openai/tunnel-client@sha256:...` image, a tunnel ID, and an existing
Secret. Chart validation checks the image reference shape, not its provenance.
No default image is supplied: the available CLI could inspect official v0.0.18
manifests but does not support `gh attestation verify`. Before activation, verify
that exact image using the [official image verification instructions](https://github.com/openai/tunnel-client/blob/v0.0.18/docs/deployment/docker.md).
No downloaded tunnel binary or image was executed during preparation. Removing
the optional sidecar/config restores an app-only deployment; no app dependency
or protocol fork is introduced (P6).

Use the existing external-secret workflow to supply only these references:

- App Secret: `INTEGRATIONS_TOKEN`, at least 32 characters.
- Tunnel Secret `runtime-api-key`: a separately scoped OpenAI runtime credential.
- Tunnel Secret `actual-authorization-header`: the complete `Bearer <token>`
  header, derived from the same app token using secret-store templating.

The sidecar receives the two selected keys, not the app's other credentials or
budget volume. No credentials belong in Helm values, argv or Git. Secret rotation
requires a coordinated restart; no watcher or permissions are added. ConfigMap
changes trigger rollout through a checksum.

[Upstream v0.0.18 static-header tests](https://github.com/openai/tunnel-client/blob/v0.0.18/e2e/static_headers_e2e_test.go)
confirm that connector-supplied Authorization overrides the configured static
header case-insensitively; discovery headers are distinct and scoped to the MCP
origin. Configure the connector without a conflicting upstream credential. A
conflicting header must yield 401; never strip app authentication to make it work.
The local synthetic test models this documented precedence, but is not a tunnel
runtime end-to-end test. Origin checks remain active: absent Origin is accepted;
a supplied Origin must match the explicit allowlist. Validate actual connector
headers with fixtures before approving real-budget calls.

The tunnel is restricted to the `main` channel and outbound HTTPS to OpenAI. No
public endpoint, Service port, hostPort, admin key, or automatic tunnel creation is
added. Health/admin binds `127.0.0.1:8080`; this port is reserved while enabled.
No Kubernetes probe is guessed for this unexecuted image: before activation,
verify a supported loopback readiness probe and the non-root/read-only filesystem
settings against the verified image using a mock upstream. The sidecar's HTTP
health/admin surface must not be exposed just to make kubelet probing convenient.
Tunnel failure does not change UI readiness. See the
[official tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
for account/workspace association and runtime permissions; availability and costs
must be confirmed for the selected personal account.

Deployment remains separate from this source preparation. This change neither
migrates data nor makes startup read-only: the SDK's download/load path can
migrate its local cache and synchronize pending changes upstream even with the
app scheduler disabled. Obtain startup-sync approval before an app upgrade and
separate approval for persistent tunnel credentials/access. Tests use injected
fixtures only and must not contact an Actual server.
