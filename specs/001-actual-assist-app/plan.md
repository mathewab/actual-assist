# Implementation Plan: Actual Budget Assistant (POC)

**Branch**: `001-actual-assist-app` | **Date**: 2025-12-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-actual-assist-app/spec.md`

**POC Scope**: Focus on P1 (Review and Apply AI Suggestions) with minimal UI to validate core workflow: download/select budget → sync with diff-based suggestion generation → review → apply → sync plan. Include periodic sync capability (env-configured) and force redownload for full-snapshot re-analysis. Defer P2/P3 and deployment artifacts to post-POC.

## Summary

Build a minimal viable assistant that manages a single Actual budget (specified via env var), syncs at a fixed interval (env-configured) to fetch latest transactions, generates AI-driven categorization suggestions (diff-based from new/changed transactions), presents them in a web UI for review (approve/reject), applies only approved changes locally, and builds a sync plan without auto-submitting. Allow explicit user-triggered force redownload for full-snapshot re-analysis. This validates the "no direct writes" principle and the suggest→review→apply→sync workflow including periodic automation before investing in full features.

## Technical Context

**Language/Version**: Node.js v20 LTS with TypeScript 5.x  
**Primary Dependencies**: @actual-app/api (budget file access), OpenAI SDK (AI categorization), Express.js (minimal API server), React (review UI), node-cron (periodic sync scheduling)  
**Storage**: Local filesystem for budget cache (per @actual-app/api design); SQLite for audit log and suggestion staging (exit: replace with PostgreSQL or remove if not needed)  
**Testing**: Vitest (unit), Playwright (integration for UI flows)  
**Target Platform**: Linux/macOS development workstation; Docker for future deployment
**Project Type**: Web application (backend API + frontend UI with budget selector)  
**Performance Goals**: Generate 50 categorization suggestions in <10s; UI interaction <200ms p95; sync runs every 6-24 hours (env-configurable); POC targets single-user local usage  
**Constraints**: POC runs locally without auth; budget file <50MB; no concurrent users; no production-grade error recovery in POC; single budget per instance  
**Scale/Scope**: POC validates workflow including periodic sync; production targets 1-5 concurrent users, monthly budget snapshots ~5k transactions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Modular design with explicit ownership; no feature proceeds without defined module boundaries and owners (P1, P5, P10).
- Zero duplication of business rules; shared logic extracted to a single authoritative module (P2).
- Testability proven up front: isolated unit test strategy and coverage of error paths documented before build (P3, P7).
- Contracts and control flow are explicit; reject hidden side effects or cleverness without justification (P4).
- Dependencies justified with license/size review and exit strategy recorded; avoid unnecessary additions (P6).
- Error handling plan defines taxonomy, propagation, and logging/redaction rules; failures are intentional and observable (P7).
- Refactoring commitments captured to ensure the codebase is left healthier; speculative abstractions rejected (P8, P9).
- Reviewability standards met: consistent patterns, directory layout, and clear rationale included in plan (P10).

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── domain/              # Core business logic (P5 separation)
│   │   ├── entities/
│   │   │   ├── AuditEntry.ts
│   │   │   ├── BudgetSnapshot.ts
│   │   │   ├── Suggestion.ts       # Independent payee/category suggestions
│   │   │   └── SyncPlan.ts
│   │   └── errors.ts
│   ├── services/            # Orchestration (P5)
│   │   ├── SnapshotService.ts      # Download/redownload budget snapshots
│   │   ├── SuggestionService.ts    # Diff-based generation, caching, retry
│   │   └── SyncService.ts          # Build/execute sync plans
│   ├── infra/              # External adapters (P5)
│   │   ├── ActualBudgetAdapter.ts  # Wrap @actual-app/api + listBudgets
│   │   ├── OpenAIAdapter.ts        # Wrap OpenAI SDK with web search
│   │   ├── DatabaseAdapter.ts      # SQLite wrapper
│   │   ├── PayeeMatcher.ts         # Fuzzy payee matching with alias dictionary
│   │   ├── repositories/
│   │   │   ├── AuditRepository.ts
│   │   │   ├── PayeeCacheRepository.ts      # Payee→Category cache
│   │   │   ├── PayeeMatchCacheRepository.ts # Raw→Canonical payee cache
│   │   │   └── SuggestionRepository.ts
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   └── migrations/
│   │   ├── env.ts
│   │   └── logger.ts
│   ├── api/                # HTTP interface
│   │   ├── budgetRoutes.ts         # GET /api/budgets, GET /api/budgets/categories
│   │   ├── snapshotRoutes.ts       # POST /snapshots, force redownload
│   │   ├── suggestionRoutes.ts     # Full CRUD + independent approve/reject
│   │   ├── syncRoutes.ts           # Build plan, apply, pending changes
│   │   ├── auditRoutes.ts          # GET /api/audit
│   │   ├── errorHandler.ts         # Global error middleware
│   │   └── index.ts
│   ├── scheduler/          # Periodic sync scheduling
│   │   └── SyncScheduler.ts
│   ├── server.ts           # Server entry point
│   └── index.ts
├── tests/
│   ├── setup.test.ts
│   ├── unit/
│   │   ├── domain/
│   │   ├── infra/
│   │   │   └── PayeeMatcher.test.ts
│   │   └── services/
│   └── integration/
│       └── api/
└── package.json

frontend/
├── src/
│   ├── components/         # React UI components
│   │   ├── ApplyChanges.tsx        # Review and apply approved suggestions
│   │   ├── ApplyChanges.css
│   │   ├── Audit.tsx               # View audit log events
│   │   ├── Audit.css
│   │   ├── BudgetSelector.tsx      # List budgets, select, sync+generate
│   │   ├── BudgetSelector.css
│   │   ├── Header.tsx              # Navigation header with React Router
│   │   ├── Header.css
│   │   ├── History.tsx             # View applied changes
│   │   ├── History.css
│   │   ├── ProgressBar.tsx         # Loading indicator during async ops
│   │   ├── ProgressBar.css
│   │   ├── SuggestionList.tsx      # Approve/reject grouped by payee
│   │   ├── SuggestionList.css
│   │   ├── SyncPlanViewer.tsx      # Review sync plan (legacy)
│   │   └── SyncPlanViewer.css
│   ├── services/           # API client
│   │   └── api.ts          # Full API client with all endpoints
│   ├── App.tsx             # React Router with 4 pages
│   ├── App.css
│   ├── main.tsx
│   └── index.css
├── tests/
│   └── integration/        # Playwright UI flows
│       └── setup.spec.ts
└── package.json

charts/
└── actual-assist/          # Helm chart (chart-releaser compatible location)
    ├── Chart.yaml          # Helm chart metadata (name, version, description)
    ├── values.yaml         # Default configuration (prod defaults, secrets, storage, replicas)
    ├── templates/
    │   ├── deployment.yaml # Backend + frontend deployments
    │   ├── service.yaml    # Services for backend and frontend
    │   ├── configmap.yaml  # Non-secret config (env vars, file mounts)
    │   ├── secret.yaml     # Secret resource (OPENAI_API_KEY, ACTUAL_PASSWORD)
    │   ├── pvc.yaml        # PersistentVolumeClaim for budget data and SQLite
    │   ├── ingress.yaml    # Ingress for home-ops (optional, values-driven)
    │   ├── _helpers.tpl    # Template helpers (labels, selector)
    │   └── NOTES.txt       # Post-install instructions
    ├── README.md           # Helm chart documentation (quick install, values reference)
    └── .helmignore         # Ignore patterns for Helm package

.github/
├── workflows/
│   ├── pr-validation.yaml   # Lint, build, test on PR (backend + frontend)
│   └── release.yaml         # Build and publish Docker images on release tag
└── CODEOWNERS              # Code ownership for review automation (optional)

```

**Structure Decision**: Web application (backend + frontend) selected per constitution requirement for UI. Domain logic isolated per P5; adapters wrap @actual-app/api and OpenAI SDK per P6. Tests mirror structure per constitution constraints. Helm chart added for home-ops deployment with support for dev/prod overrides per FR-012. GitHub Actions added for CI/CD: PR validation (lint/build/test) and release automation (Docker publish).

## Additional Dependencies (December 2025)

| Package | Purpose | Layer |
|---------|---------|-------|
| `fuzzball` | Fuzzy string matching for payee names | Backend infra |
| `react-router-dom` | Client-side routing for multi-page navigation | Frontend |
| Helm 3.x | Kubernetes package manager for deployment; not a code dependency | DevOps/deployment |
| Kubernetes 1.24+ | Target platform for Helm chart deployment | DevOps/deployment |
| GitHub Actions | Native CI/CD platform; no additional dependencies; configured via YAML workflows in .github/workflows/ | DevOps/deployment |

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| SQLite dependency (P6) | Need persistent audit log, suggestion staging, and caches across server restarts | In-memory storage insufficient for multi-session debugging; exit strategy: PostgreSQL (swap repo implementation) or remove if audit not required |
| React frontend (P9) | UI requirement from spec; CLI insufficient for diff preview and bulk approve/reject | Pure CLI cannot show side-by-side diffs or interactive toggles without excessive scrolling; exit: replace with simpler HTML+htmx if React overhead unjustified |
| fuzzball dependency (P6) | Fuzzy matching essential for payee normalization; no built-in JS equivalent | Manual Levenshtein too slow; fuzzball is well-maintained with MIT license |
| Helm chart (P6) | Deployment requirement (FR-012); Kubernetes-native packaging for home-ops installation | Alternative: distribute Docker Compose only; Helm enables declarative, reusable infrastructure; exit: remove Helm, keep docker-compose.yml as primary deployment method |
| GitHub Actions (P10) | CI/CD automation for quality gates (lint/build/test on PR) and release pipeline (Docker publish); improves reviewability and reduces manual deployment errors | Alternative: manual CI (GitLab, Gitea, Jenkins); GitHub Actions is free for public repos and GitHub-native, reducing toolchain complexity; exit: remove and rely on manual CI or external services |

## POC Phase Breakdown

### Phase 0: Research (POC - streamlined)

**Goal**: Resolve unknowns about @actual-app/api usage and OpenAI prompt design for categorization.

**Tasks**:
1. Research @actual-app/api: How to download budget, read transactions, read categories, build sync plan, execute sync; understand how Actual sync signals convey drift.
2. Research OpenAI API: Prompt design for transaction categorization with confidence scores; cost estimation for 50 transactions; fallback if rate-limited.
3. Research audit/staging storage: SQLite schema for suggestions (id, transaction_id, proposed_category, confidence, status, created_at, applied_at).

**Output**: [research.md](research.md) documenting API patterns, OpenAI prompt template, SQLite schema, and cost/performance expectations.

### Phase 1: Design (POC - minimal contracts)

**Goal**: Define domain entities and API contracts for P1 with budget selector, diff-based sync+generate, and periodic sync capability.

**Tasks**:
1. **data-model.md**: Define BudgetSnapshot (budgetId as primary identifier, filepath, downloadedAt, transactionCount, categoryCount; no hash-based staleness; replaced only on explicit user redownload), Suggestion (id, budgetId, transactionId, proposedCategoryId, confidence, rationale, status: pending|approved|rejected|applied), SyncPlan (id, budgetId, changes array, dryRunSummary).

2. **contracts/api.yaml**: Define backend API endpoints:
   - `GET /api/budgets` → {budgets: [{id, name, lastSync?}]} - List available budgets (MVP: single env-configured budget)
   - `POST /api/snapshots` (body: {budgetId}) → {budgetId, filepath, downloadedAt, transactionCount, categoryCount} - Create/download snapshot
   - `POST /api/snapshots/redownload` (body: {budgetId}) → {...} - Force full-snapshot redownload (triggers full re-analysis on next suggestion generation)
   - `POST /api/suggestions/generate` (body: {budgetId}) → {suggestions: Suggestion[]} - Generate from full snapshot (only after redownload)
   - `POST /api/suggestions/sync-and-generate` (body: {budgetId}) → {suggestions: Suggestion[], syncInfo: {snapshotBefore, snapshotAfter}} - **NEW**: Sync first (get new transactions), then generate diff-based suggestions
   - `GET /api/suggestions/pending` → {suggestions: Suggestion[]} - Fetch pending suggestions
   - `PATCH /api/suggestions/:id` (body: {status: approved|rejected}) → {updated: Suggestion} - Update suggestion status
   - `POST /api/sync/plan` (body: {budgetId}) → {id, budgetId, changes, dryRunSummary, createdAt} - Build sync plan from approved suggestions
   - `POST /api/sync/execute` (body: {budgetId}) → {success, planId, changesApplied} - Execute sync plan

3. **quickstart.md**: Document how to run POC: install deps, set env vars (OPENAI_API_KEY, ACTUAL_SERVER_URL, ACTUAL_PASSWORD, ACTUAL_BUDGET_ID, SYNC_INTERVAL_MINUTES), start backend, start frontend, test workflow including periodic sync.

**Diff-Based vs Full-Snapshot Strategy** (NEW):
   - **Normal sync** (`/suggestions/sync-and-generate`): Syncs with Actual server, detects new/changed transactions since last snapshot, generates suggestions only for changed set (fast, focused). Frontend button: "Sync & Generate Suggestions".
   - **Force redownload** (`/snapshots/redownload` + next `/suggestions/generate`): Explicitly redownload entire snapshot, perform full-snapshot analysis on next generation (comprehensive re-analysis). Frontend button: "Force Redownload & Regenerate" (always visible).

**Output**: [data-model.md](data-model.md), [contracts/api.yaml](contracts/api.yaml), [quickstart.md](quickstart.md).

### Phase 2: Implementation (POC - P1 + periodic sync)

**Goal**: Build and validate the core workflow end-to-end including budget selector, diff-based sync+generate, and periodic sync automation.

**Foundation**:
- Setup: Initialize Node.js/TypeScript projects for backend/frontend; install deps (including node-cron); configure env validation (add SYNC_INTERVAL_MINUTES).
- Domain: Implement BudgetSnapshot, Suggestion, SyncPlan entities with validation.
- Infra: Wrap @actual-app/api (download, listBudgets, read transactions/categories, build sync plan), OpenAI SDK (categorization prompt with JSON mode), SQLite (audit/suggestions).

**P1 + Periodic Sync Implementation**:
- **Backend services**: 
  - SnapshotService: download, redownload, read snapshot
  - SuggestionService: generateSuggestions (full-snapshot), generateSuggestionsFromDiff (diff-based, called after sync)
  - SyncService: build sync plan from approved suggestions, execute sync
  - SyncScheduler (NEW): use node-cron to run periodic syncs at fixed interval (env: SYNC_INTERVAL_MINUTES); on each trigger, sync then generate diff-based suggestions
- **Backend API**: Express routes per contracts (new: budgetRoutes, updated: suggestionRoutes with sync-and-generate endpoint)
- **Frontend**: 
  - BudgetSelector (NEW): list budgets (from /api/budgets), select one, show "Sync & Generate Suggestions" button, show "Force Redownload" button (always visible)
  - SuggestionList: approve/reject suggestions, show confidence and rationale
  - SyncPlanViewer: review and execute sync plan
  - App: route between tabs based on selected budget
- **Tests**: Unit tests for domain entities, service logic (diff detection), AI prompt parsing; integration tests for API flows and UI approve/reject/build-plan/sync workflow; periodic sync triggered manually in tests.

**Output**: Working POC demonstrating P1 acceptance scenarios + periodic sync automation via env var.

**Periodic Sync Behavior** (NEW):
- Backend runs SyncScheduler on startup; interval configured via `SYNC_INTERVAL_MINUTES` env var (default: 360 minutes = 6 hours)
- On each tick: call `syncAndGenerateSuggestions(budgetId)` which syncs with Actual server, detects new transactions, generates diff-based suggestions
- If sync fails: retry silently with exponential backoff; log failure; alert UI only if retry limit exhausted (3 attempts, then notify)
- Generated suggestions appear in pending list; users review/approve/apply as normal
- Frontend can refresh suggestion list manually or via polling

**Force Redownload Behavior** (NEW):
- Button always visible in BudgetSelector
- On click: calls `POST /api/snapshots/redownload`, replaces existing snapshot with full re-download
- Next manual sync+generate: triggers full-snapshot analysis (not diff-based)
- Use case: user manually edited budget file or suspects stale snapshot 

## Constitution Alignment (POC)

- **P1 (Modular Design)**: Domain (entities/), services (snapshot, suggestion, sync, scheduler), infra (adapters, repos), api (routes) with clear owners and separation.
- **P2 (Zero Duplication)**: Single source for suggestion state (SQLite suggestions table); single AI prompt template for categorization; single sync-plan builder; single diff detection logic (Snapshot comparison).
- **P3 (Testability)**: Domain entities pure functions; services injected with infra mocks; snapshot diff logic unit-tested; UI flows tested via Playwright; periodic sync triggered manually in tests via mocked cron.
- **P4 (Explicitness)**: API contracts in OpenAPI (with sync-and-generate endpoint); error types explicit (BudgetDownloadError, AISuggestError, SyncError, SnaphotRedownloadError); no hidden mutations; diff-based vs full-snapshot decision explicit in service method names.
- **P5 (Separation)**: Domain never imports @actual-app/api, OpenAI, or node-cron; adapters wrap external clients; services orchestrate; scheduler sits between API routes and services.
- **P6 (Dependency Discipline)**: @actual-app/api (official, MIT, exit: none), OpenAI SDK (MIT, exit: Anthropic), node-cron (ISC, exit: remove if interval via webhook preferred), SQLite (public domain, exit: PostgreSQL). 
- **P7 (Error Handling)**: Budget download failures → BudgetDownloadError; AI timeouts → AISuggestTimeoutError; sync failures → SyncError with recoverable flag; sync failures during periodic task: retry silently with backoff, alert only on exhaustion (matches FR-011).
- **P8 (Refactoring)**: POC allows quick iteration; post-POC refactor shared types between frontend/backend into unified package.
- **P9 (Minimalism)**: No speculative features; defer P2 (payee merge), P3 (AI report), deployment artifacts, auth, multi-user, multi-budget UI until POC validated. Periodic sync via env var (simple) deferred to user-configurable schedule post-POC.
- **P10 (Reviewability)**: Consistent naming (*Service, *Adapter, *Repository, *Scheduler); OpenAPI contracts with clear endpoint purposes; quickstart for onboarding; env var documentation in .env.example. GitHub Actions PR validation (lint/build/test) enforces code quality on every PR; release automation (Docker/Helm publish) ensures production artifacts are built consistently.

## GitHub Actions CI/CD Pipelines (Post-Helm)

**PR Validation Workflow** (.github/workflows/pr-validation.yaml):
- Trigger: on pull_request
- Backend matrix job (node 20):
  - Lint: eslint + prettier (non-zero exit on issues)
  - Build: tsc, npm run build (cache node_modules)
  - Unit tests: vitest unit tests with coverage threshold
  - Integration tests: vitest integration tests (timeout 10m)
- Frontend matrix job (node 20):
  - Lint: eslint + prettier (non-zero exit on issues)
  - Build: vite build (verify dist/ artifact)
  - E2E tests: playwright headless, screenshot/video on failure (timeout 15m)

**Release Workflow** (.github/workflows/release.yaml):
- Trigger: on push tag v* (or workflow_dispatch)
- Build Docker images:
  - Backend: actual-assist-backend:${GITHUB_REF#refs/tags/}
  - Frontend: actual-assist-frontend:${GITHUB_REF#refs/tags/}
  - Registry: Docker Hub (DOCKER_USERNAME, DOCKER_PASSWORD secrets) or ghcr.io
- Helm chart validation & packaging:
  - helm lint charts/actual-assist/
  - helm package charts/actual-assist/ → actual-assist-${VERSION}.tgz
  - Upload artifact for release
- GitHub release creation:
  - Extract tag and create release notes
  - Attach Helm chart tarball
  - Mark as pre-release for v0.x

**Quality Gates Enforced**:
- P3 (Testability): PR blocked if unit/integration tests fail
- P10 (Reviewability): PR blocked if lint/prettier checks fail; automatic fixes available via workflow dispatch
- Consistent code quality across all contributions via matrix jobs and caching

## Next Steps Post-POC

1. Validate P1 workflow with real budget file and 50+ transactions; confirm periodic sync executes without blocking user interaction.
2. Measure AI cost and latency; optimize diff detection and prompts if needed.
3. User feedback on budget selector UX, force redownload clarity, and periodic sync interval defaults.
4. If successful: implement P2 (payee merge, multi-budget UI), P3 (AI report), user-configurable sync schedule, auth, Dockerfile, Helm chart.
5. If unsuccessful: document learnings and pivot or abandon.
