# Implementation Plan: Actual Budget Assistant (POC)

**Branch**: `001-actual-assist-app` | **Date**: 2025-12-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-actual-assist-app/spec.md`

**POC Scope**: Focus on P1 (Review and Apply AI Suggestions) with minimal UI to validate core workflow: download budget → generate categorization suggestions → review → apply → sync plan. Defer P2/P3 and deployment artifacts to post-POC.

## Summary

Build a minimal viable assistant that downloads an Actual budget file, generates AI-driven categorization suggestions (no payee merge or new categories in POC), presents them in a simple CLI/web UI for review (approve/reject), applies only approved changes locally, and builds a sync plan without auto-submitting. This validates the "no direct writes" principle and the suggest→review→apply→sync workflow before investing in full features.

## Technical Context

**Language/Version**: Node.js v20 LTS with TypeScript 5.x  
**Primary Dependencies**: @actual-app/api (budget file access), OpenAI SDK (AI categorization), Express.js (minimal API server), React (simple review UI)  
**Storage**: Local filesystem for budget cache (per @actual-app/api design); SQLite for audit log and suggestion staging (exit: replace with PostgreSQL or remove if not needed)  
**Testing**: Vitest (unit), Playwright (integration for UI flows)  
**Target Platform**: Linux/macOS development workstation; Docker for future deployment
**Project Type**: Web application (backend API + frontend UI)  
**Performance Goals**: Generate 50 categorization suggestions in <10s; UI interaction <200ms p95; POC targets single-user local usage  
**Constraints**: POC runs locally without auth; budget file <50MB; no concurrent users; no production-grade error recovery in POC  
**Scale/Scope**: POC validates workflow only; production targets 1-5 concurrent users, monthly budget snapshots ~5k transactions

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
│   │   ├── budget-snapshot.ts
│   │   ├── suggestion.ts
│   │   └── sync-plan.ts
│   ├── services/            # Orchestration (P5)
│   │   ├── budget-service.ts
│   │   ├── ai-service.ts
│   │   └── sync-service.ts
│   ├── infra/              # External adapters (P5)
│   │   ├── actual-client.ts
│   │   ├── openai-client.ts
│   │   └── audit-repo.ts
│   ├── api/                # HTTP interface
│   │   └── routes.ts
│   └── index.ts            # Server entry point
├── tests/
│   ├── unit/               # Domain + service unit tests
│   └── integration/        # API + actual-client integration tests
└── package.json

frontend/
├── src/
│   ├── components/         # React UI components
│   │   ├── SuggestionList.tsx
│   │   └── SyncPlanPreview.tsx
│   ├── services/           # API client
│   │   └── api-client.ts
│   └── App.tsx
├── tests/
│   └── integration/        # Playwright UI flows
└── package.json

shared/                     # POC defers this; merge if types duplicate
```

**Structure Decision**: Web application (backend + frontend) selected per constitution requirement for UI. Domain logic isolated per P5; adapters wrap @actual-app/api and OpenAI SDK per P6. Tests mirror structure per constitution constraints.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| SQLite dependency (P6) | Need persistent audit log and suggestion staging across server restarts in POC | In-memory storage insufficient for multi-session debugging; exit strategy: PostgreSQL (swap repo implementation) or remove if audit not required |
| React frontend (P9) | UI requirement from spec; CLI insufficient for diff preview and bulk approve/reject | Pure CLI cannot show side-by-side diffs or interactive toggles without excessive scrolling; exit: replace with simpler HTML+htmx if React overhead unjustified |

## POC Phase Breakdown

### Phase 0: Research (POC - streamlined)

**Goal**: Resolve unknowns about @actual-app/api usage and OpenAI prompt design for categorization.

**Tasks**:
1. Research @actual-app/api: How to download budget, read transactions, read categories, detect staleness (hash/timestamp), build sync plan, execute sync.
2. Research OpenAI API: Prompt design for transaction categorization with confidence scores; cost estimation for 50 transactions; fallback if rate-limited.
3. Research audit/staging storage: SQLite schema for suggestions (id, transaction_id, proposed_category, confidence, status, created_at, applied_at).

**Output**: [research.md](research.md) documenting API patterns, OpenAI prompt template, SQLite schema, and cost/performance expectations.

### Phase 1: Design (POC - minimal contracts)

**Goal**: Define domain entities and API contracts for P1 only (categorization suggestions).

**Tasks**:
1. **data-model.md**: Define BudgetSnapshot (timestamp, hash, filepath), Suggestion (id, transactionId, proposedCategoryId, confidence, rationale, status: pending|approved|rejected), SyncPlan (changeList, dryRunSummary).
2. **contracts/**: Define backend API endpoints:
   - `POST /budget/download` (body: {serverURL, password, budgetId}) → {snapshotId, timestamp, transactionCount}
   - `POST /suggestions/generate` (body: {snapshotId}) → {suggestions: Suggestion[]}
   - `PATCH /suggestions/:id` (body: {status: approved|rejected}) → {updated: Suggestion}
   - `POST /sync-plan/build` (body: {snapshotId}) → {plan: SyncPlan}
3. **quickstart.md**: Document how to run POC: install deps, set env vars (OPENAI_API_KEY, ACTUAL_SERVER_URL, ACTUAL_PASSWORD, ACTUAL_BUDGET_ID), start backend, start frontend, test workflow.

**Output**: [data-model.md](data-model.md), [contracts/api.yaml](contracts/api.yaml), [quickstart.md](quickstart.md).

### Phase 2: Implementation (POC - P1 only)

**Goal**: Build and validate the core workflow end-to-end.

**Foundation**:
- Setup: Initialize Node.js/TypeScript projects for backend/frontend; install deps; configure env validation.
- Domain: Implement BudgetSnapshot, Suggestion, SyncPlan entities with validation.
- Infra: Wrap @actual-app/api (download, read transactions/categories, build sync plan), OpenAI SDK (categorization prompt), SQLite (audit/suggestions).

**P1 Implementation**:
- Backend services: BudgetService (download, read), AIService (generate suggestions), SyncService (build plan from approved suggestions).
- Backend API: Express routes per contracts.
- Frontend: React UI with SuggestionList (approve/reject buttons, confidence display), SyncPlanPreview (dry-run diff before sync).
- Tests: Unit tests for domain entities, service logic, AI prompt parsing; integration tests for API flows and UI approve/reject/build-plan workflow.

**Output**: Working POC demonstrating P1 acceptance scenarios from spec.

## Constitution Alignment (POC)

- **P1 (Modular Design)**: Domain (budget-snapshot, suggestion, sync-plan), services (orchestration), infra (adapters) with clear owners.
- **P2 (Zero Duplication)**: Single source for suggestion state (SQLite audit table); single AI prompt template; single sync-plan builder.
- **P3 (Testability)**: Domain entities pure functions; services injected with infra mocks; UI flows tested via Playwright.
- **P4 (Explicitness)**: API contracts in OpenAPI; error types explicit (BudgetStale, AISuggestFailed, SyncPlanInvalid); no hidden mutations.
- **P5 (Separation)**: Domain never imports @actual-app/api or OpenAI; adapters wrap external clients; services orchestrate.
- **P6 (Dependency Discipline)**: @actual-app/api (official, MIT, exit: none needed), OpenAI SDK (MIT, exit: switch to Anthropic or local LLM), SQLite (public domain, exit: PostgreSQL or remove).
- **P7 (Error Handling)**: Budget download failures → BudgetDownloadError with server URL redacted; AI timeouts → AISuggestTimeoutError with retry count; sync failures → SyncError with recoverable flag.
- **P8 (Refactoring)**: POC allows quick iteration; refactor duplication between frontend/backend types into shared package post-POC.
- **P9 (Minimalism)**: No speculative features; defer P2/P3, deployment artifacts, auth, multi-user until POC validated.
- **P10 (Reviewability)**: Consistent naming (e.g., *Service, *Client, *Repo); OpenAPI contracts; quickstart for onboarding.

## Next Steps Post-POC

1. Validate P1 workflow with real budget file and 50+ transactions.
2. Measure AI cost and latency; optimize prompts if needed.
3. If successful: implement P2 (payee merge), P3 (AI report), auth, Dockerfile, Helm chart.
4. If unsuccessful: document learnings and pivot or abandon.
