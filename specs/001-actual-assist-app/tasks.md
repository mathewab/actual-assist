---

description: "Task list for Actual Budget Assistant POC (P1 focus)"
---

# Tasks: Actual Budget Assistant (POC)

**Input**: Design documents from `specs/001-actual-assist-app/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.yaml, quickstart.md

**POC Scope**: Implementation focuses on P1 (Review and Apply AI Suggestions) only. P2/P3, deployment artifacts, and auth deferred to post-POC validation.

**Tests**: Unit and integration tests included per constitution P3 (testability gate).

**Organization**: Tasks organized by foundational setup → P1 implementation → validation.

## Format: `- [ ] [ID] [P?] [US1] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[US1]**: User Story 1 (Review and Apply AI Suggestions)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/`, `backend/tests/` at repository root
- **Frontend**: `frontend/src/`, `frontend/tests/` at repository root
- Paths based on plan.md web application structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create backend directory structure per plan.md (backend/src/{domain,services,infra,api}, backend/tests/{unit,integration})
- [X] T002 Create frontend directory structure per plan.md (frontend/src/{components,services}, frontend/tests/integration)
- [X] T003 [P] Initialize backend TypeScript project with package.json in backend/ (dependencies: @actual-app/api, openai, express, better-sqlite3, dotenv, zod)
- [X] T004 [P] Initialize frontend TypeScript + React project with package.json in frontend/ (dependencies: react, react-dom, @tanstack/react-query, vite)
- [X] T005 [P] Configure TypeScript compiler options for backend (backend/tsconfig.json with strict mode, ES modules, node20 lib)
- [X] T006 [P] Configure TypeScript compiler options for frontend (frontend/tsconfig.json with strict mode, DOM lib, JSX react)
- [X] T007 [P] Setup ESLint and Prettier for backend (backend/.eslintrc.js, backend/.prettierrc)
- [X] T008 [P] Setup ESLint and Prettier for frontend (frontend/.eslintrc.js, frontend/.prettierrc)
- [X] T009 Create backend/.env.example with required environment variables per quickstart.md (ACTUAL_SERVER_URL, ACTUAL_PASSWORD, ACTUAL_BUDGET_ID, OPENAI_API_KEY, DATA_DIR, SQLITE_DB_PATH, PORT, NODE_ENV)
- [X] T010 Create frontend/.env.example with VITE_API_BASE_URL per quickstart.md
- [X] T011 [P] Create Dockerfile for backend in backend/Dockerfile (multi-stage: build TypeScript → production image with node:20-alpine, copy dist/ and node_modules)
- [X] T012 [P] Create Dockerfile for frontend in frontend/Dockerfile (multi-stage: build Vite → serve with nginx:alpine)
- [X] T013 Create docker-compose.yml in repository root (services: backend, frontend with volume mounts for .env and data/, expose ports 3000 and 5173)
- [X] T014 Add npm scripts to root package.json (dev:all to start both backend and frontend concurrently, docker:up for docker-compose up, docker:down)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before P1 implementation can begin

**⚠️ CRITICAL**: No user story work can begin until this phase is complete


- [X] T015 Implement environment validation schema in backend/src/config.ts using zod (validate all env vars from .env.example, fail fast on startup)
- [X] T016 Create SQLite schema initialization script in backend/src/infra/db-schema.ts (suggestions table, audit_log table per research.md)
- [X] T017 Implement database migration runner in backend/src/infra/db-migrations.ts (execute schema.sql, track version)
- [X] T018 [P] Create error taxonomy types in backend/src/domain/errors.ts (BudgetDownloadError, AISuggestFailedError, SyncPlanInvalidError, NotFoundError, ValidationError)
- [X] T019 [P] Setup structured logging utility in backend/src/infra/logger.ts (Winston or Pino with JSON output, redact secrets per P7)
- [X] T020 [P] Configure Vitest for backend unit tests in backend/vitest.config.ts
- [X] T021 [P] Configure Playwright for frontend integration tests in frontend/playwright.config.ts
- [X] T022 Create backend server entry point in backend/src/index.ts (load env, init db, start Express server)

**Checkpoint**: Foundation ready - P1 implementation can now begin in parallel

### Additional Foundational (Periodic Sync Support)

- [X] T064 [P] Add SYNC_INTERVAL_MINUTES to backend/.env.example and validate in backend/src/infra/env.ts (default 360, min 1, integer)
- [X] T065 [P] Create scheduler in backend/src/scheduler/SyncScheduler.ts (node-cron schedule by SYNC_INTERVAL_MINUTES, exports startScheduler())
- [X] T066 Wire scheduler startup in backend/src/server.ts (call startScheduler() after app.listen, guard with env var)
- [X] T067 [P] Extend ActualBudgetAdapter with listBudgets() and sync() in backend/src/infra/ActualBudgetAdapter.ts (wrap @actual-app/api)


## Phase 3: User Story 1 - Review and Apply AI Suggestions (Priority: P1) 🎯 POC MVP

**Goal**: Users review AI categorization suggestions, approve/reject, and build sync plan without auto-applying

**Independent Test**: Download budget → generate suggestions → approve subset → build sync plan → verify plan matches approved only

### Domain Layer (P1)

- [X] T023 [P] [US1] Implement BudgetSnapshot entity in backend/src/domain/budget-snapshot.ts (budgetId as primary identifier, filepath, downloadedAt, transactionCount, categoryCount with validation per data-model.md; no hash or id fields)
- [X] T024 [P] [US1] Implement Suggestion entity in backend/src/domain/suggestion.ts (all fields from data-model.md with budgetId reference, status state machine validation, confidence range check)
- [X] T025 [P] [US1] Implement SyncPlan entity in backend/src/domain/sync-plan.ts (id, budgetId, changes array, dryRunSummary, immutability enforcement)
- [X] T026 [P] [US1] Unit test BudgetSnapshot validation rules in backend/tests/unit/domain/budget-snapshot.test.ts (test budgetId, downloadedAt, counts validation)
- [X] T027 [P] [US1] Unit test Suggestion state transitions with budgetId references in backend/tests/unit/domain/suggestion.test.ts
- [X] T028 [P] [US1] Unit test SyncPlan change deduplication in backend/tests/unit/domain/sync-plan.test.ts

### Infrastructure Layer (P1)

- [ ] T029 [P] [US1] Implement ActualClient adapter in backend/src/infra/actual-client.ts (wrap @actual-app/api: init, downloadBudget, getTransactions, getCategories, shutdown per research.md; surface sync errors for drift detection)
- [ ] T030 [P] [US1] Implement OpenAIClient adapter in backend/src/infra/openai-client.ts (wrap OpenAI SDK: categorization prompt with JSON mode per research.md, timeout handling)
- [X] T031 [P] [US1] Implement AuditRepository in backend/src/infra/audit-repo.ts (SQLite CRUD for suggestions table with budgetId, audit_log table per research.md schema)
- [ ] T032 [P] [US1] Unit test ActualClient error handling for connection failures in backend/tests/unit/infra/actual-client.test.ts (mock @actual-app/api, verify drift errors trigger when sync fails)
- [ ] T033 [P] [US1] Unit test OpenAIClient prompt formatting and JSON parsing in backend/tests/unit/infra/openai-client.test.ts (mock OpenAI SDK)
- [ ] T034 [P] [US1] Unit test AuditRepository SQLite queries in backend/tests/unit/infra/audit-repo.test.ts (in-memory SQLite)

### Service Layer (P1)

- [X] T035 [US1] Implement BudgetService in backend/src/services/budget-service.ts (downloadBudget method: call ActualClient, create/replace BudgetSnapshot, log to audit; surface sync errors for drift handling)
- [X] T036 [US1] Implement AIService in backend/src/services/ai-service.ts (generateSuggestions method: accept budgetId, read transactions/categories via ActualClient, batch OpenAI requests with concurrency limit, create Suggestion entities, persist via AuditRepo)
- [X] T037 [US1] Implement SyncService in backend/src/services/sync-service.ts (buildSyncPlan method: accept budgetId, query approved suggestions from AuditRepo, build SyncPlan entity, validate no duplicates)
- [X] T038 [P] [US1] Unit test BudgetService download and re-download flow in backend/tests/unit/services/budget-service.test.ts (mock ActualClient, verify snapshot creation and replacement on explicit re-download)
- [ ] T039 [P] [US1] Unit test AIService suggestion generation in backend/tests/unit/services/ai-service.test.ts (mock ActualClient and OpenAIClient, verify batching and confidence filtering)
- [ ] T040 [P] [US1] Unit test SyncService plan building in backend/tests/unit/services/sync-service.test.ts (mock AuditRepo, verify change ordering and dry-run summary)

### Sync & Generation Enhancements (Diff-Based Strategy)

- [X] T068 [P] [US1] Implement generateSuggestionsFromDiff(budgetId) in backend/src/services/SuggestionService.ts (sync, compute changed transactions, generate suggestions for diff only)
- [X] T069 [P] [US1] Add full-snapshot mode toggle post-redownload in backend/src/services/SuggestionService.ts (fallback to full analysis when flagged)
- [ ] T070 [P] [US1] Integration test diff-based generation in backend/tests/integration/services/suggestion-diff.test.ts (set up before/after snapshots, expect only changed txns suggested)

### API Layer (P1)

- [ ] T041 [P] [US1] Implement POST /budget/download route in backend/src/api/routes.ts (validate request body with zod, call BudgetService, return BudgetSnapshot JSON per contracts/api.yaml with budgetId)
- [X] T042 [P] [US1] Implement POST /suggestions/generate route in backend/src/api/routes.ts (validate budgetId, call AIService, return Suggestion[] JSON per contracts/api.yaml)
- [ ] T043 [P] [US1] Implement PATCH /suggestions/:id route in backend/src/api/routes.ts (validate suggestionId and status, update via AuditRepo with budgetId context, return updated Suggestion per contracts/api.yaml)
- [ ] T044 [P] [US1] Implement POST /suggestions/bulk-update route in backend/src/api/routes.ts (validate updates array, batch update via AuditRepo, return success/failure counts per contracts/api.yaml)
- [X] T045 [P] [US1] Implement POST /sync-plan/build route in backend/src/api/routes.ts (validate budgetId, call SyncService, return SyncPlan JSON per contracts/api.yaml)
- [X] T046 [US1] Add global error handler middleware in backend/src/api/error-handler.ts (map domain errors to HTTP status codes, redact secrets, log with context per P7, surface drift warnings)
- [ ] T047 [P] [US1] Integration test /budget/download endpoint in backend/tests/integration/api/budget-download.test.ts (mock Actual server, verify 200 response with budgetId and snapshot structure)
- [ ] T048 [P] [US1] Integration test /suggestions/generate endpoint in backend/tests/integration/api/suggestions-generate.test.ts (mock OpenAI API, verify suggestions returned with budgetId and confidence scores)
- [ ] T049 [P] [US1] Integration test /suggestions/:id PATCH endpoint in backend/tests/integration/api/suggestions-update.test.ts (verify status transitions and 400 for invalid states)
- [ ] T050 [P] [US1] Integration test /sync-plan/build endpoint in backend/tests/integration/api/sync-plan-build.test.ts (verify plan includes only approved suggestions)

#### API Extensions for Sync & Budgets (New)

- [X] T071 [P] [US1] Implement GET /api/budgets in backend/src/api/budgetRoutes.ts and mount in backend/src/api/index.ts (return {budgets: []} per contracts/api.yaml)
- [X] T072 [P] [US1] Implement POST /snapshots in backend/src/api/snapshotRoutes.ts (create/download snapshot per contracts/api.yaml)
- [X] T073 [P] [US1] Implement POST /snapshots/redownload in backend/src/api/snapshotRoutes.ts (force redownload and respond with snapshot)
- [X] T074 [P] [US1] Implement POST /suggestions/sync-and-generate in backend/src/api/suggestionRoutes.ts (calls diff-based generation)
- [X] T075 [P] [US1] Implement GET /suggestions/pending in backend/src/api/suggestionRoutes.ts (list status=pending)

#### API Integration Tests (New)

- [ ] T076 [P] [US1] Integration test GET /api/budgets in backend/tests/integration/api/budgets-list.test.ts (verify 200 + shape)
- [ ] T077 [P] [US1] Integration test POST /snapshots in backend/tests/integration/api/snapshots-create.test.ts (verify 201 + snapshot structure)
- [ ] T078 [P] [US1] Integration test POST /snapshots/redownload in backend/tests/integration/api/snapshots-redownload.test.ts (verify 200 + replacement)
- [ ] T079 [P] [US1] Integration test POST /suggestions/sync-and-generate in backend/tests/integration/api/suggestions-sync-generate.test.ts (mock Actual/OpenAI, expect only diff)
- [ ] T080 [P] [US1] Integration test GET /suggestions/pending in backend/tests/integration/api/suggestions-pending.test.ts (verify pending list)

### Frontend (P1)

- [ ] T051 [P] [US1] Create API client service in frontend/src/services/api-client.ts (axios or fetch wrapper: downloadBudget, generateSuggestions with budgetId, updateSuggestion, bulkUpdateSuggestions, buildSyncPlan methods)
- [ ] T052 [P] [US1] Implement SuggestionList component in frontend/src/components/SuggestionList.tsx (table with transaction details, proposed category, confidence badge, approve/reject buttons, budgetId context)
- [ ] T053 [P] [US1] Implement SyncPlanPreview component in frontend/src/components/SyncPlanPreview.tsx (show changes count, old→new category diff list, dry-run summary)
- [ ] T054 [US1] Implement App component in frontend/src/App.tsx (orchestrate workflow: download button → generate button with budgetId → SuggestionList → build plan button → SyncPlanPreview)
- [ ] T055 [US1] Add loading states and error handling in frontend/src/App.tsx (spinner during AI generation, error toast for API failures and drift warnings, disable buttons during operations)
- [ ] T056 [P] [US1] Style components with Tailwind CSS or basic CSS in frontend/src/styles.css (confidence color coding: green >0.8, yellow 0.5-0.8, red <0.5)
- [ ] T057 [P] [US1] Integration test approve/reject workflow in frontend/tests/integration/suggestion-review.spec.ts (Playwright: download → generate → approve 3 suggestions → build plan → verify plan contains 3 changes)
- [ ] T058 [P] [US1] Integration test bulk approve workflow in frontend/tests/integration/bulk-approve.spec.ts (Playwright: filter by confidence >0.8 → bulk approve → build plan → verify all approved)

#### Budget Selector & Sync Flow (UI)

- [X] T081 [P] [US1] Add listBudgets() in frontend/src/services/api.ts (GET /api/budgets; types for Budget)
- [X] T082 [P] [US1] Add syncAndGenerateSuggestions(budgetId) in frontend/src/services/api.ts (POST /suggestions/sync-and-generate)
- [X] T083 [US1] Create BudgetSelector component in frontend/src/components/BudgetSelector.tsx with styles in frontend/src/components/BudgetSelector.css
- [X] T084 [US1] Wire BudgetSelector into frontend/src/App.tsx (selectedBudget gating for tabs and actions)
- [ ] T085 [P] [US1] Playwright test budget selection + sync flow in frontend/tests/integration/setup.spec.ts (select budget → Sync & Generate → see suggestions)

**Checkpoint**: At this point, P1 should be fully functional and testable independently

---

## Phase 4: Polish & Validation

**Purpose**: Final testing and documentation validation

- [ ] T059 [P] Run full test suite for backend (npm test in backend/, verify all unit and integration tests pass)
- [ ] T060 [P] Run full test suite for frontend (npm run test:e2e in frontend/, verify Playwright tests pass)
- [ ] T061 Validate quickstart.md instructions (fresh clone, follow setup steps, verify POC runs and acceptance scenarios work per quickstart.md)
- [X] T062 [P] Add README.md to repository root with POC overview, links to specs/, and quickstart reference
- [ ] T063 Run constitution compliance check (verify P1-P10 alignment per plan.md: modularity, no duplication, testability, explicitness, separation, dependency discipline, error handling, refactoring opportunities, minimalism, reviewability)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all P1 work
- **P1 Implementation (Phase 3)**: Depends on Foundational phase completion
  - Domain layer can start immediately after Phase 2
  - Infrastructure layer can start in parallel with Domain
  - Service layer depends on Domain + Infrastructure
  - API layer depends on Service layer
  - Frontend depends on API layer being defined (can start UI shells in parallel)
- **Polish (Phase 4)**: Depends on P1 completion

### Within Phase 3 (P1)

- **Domain (T023-T028)**: No dependencies, can all run in parallel
- **Infrastructure (T029-T034)**: No dependencies on domain (uses mocks), can all run in parallel
- **Service (T035-T040)**: Depends on Domain + Infrastructure completion; BudgetService, AIService, SyncService can be built in parallel after
- **API (T041-T050)**: Depends on Service layer; routes can be built in parallel, error handler needed before integration tests
- **Frontend (T051-T058)**: API client can start once contracts defined; components can be built in parallel; App orchestration last; tests after App complete

### Parallel Opportunities

```bash
# Phase 1: All setup tasks T003-T014 can run in parallel (split by concern)
Task: "Initialize backend TypeScript project"
Task: "Initialize frontend TypeScript project"
Task: "Configure TypeScript for backend"
Task: "Configure TypeScript for frontend"
Task: "Create backend Dockerfile"
Task: "Create frontend Dockerfile"
# ... etc

# Phase 2: T018, T019, T020, T021 can run in parallel (different concerns)
Task: "Create error types"
Task: "Setup logging"
Task: "Configure Vitest"
Task: "Configure Playwright"

# Phase 3 Domain: T023-T028 all parallel (different entities)
Task: "Implement BudgetSnapshot entity"
Task: "Implement Suggestion entity"
Task: "Implement SyncPlan entity"
Task: "Test BudgetSnapshot"
# ... etc
```

---

## Implementation Strategy

### MVP First (P1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all P1 work)
3. Complete Phase 3: P1 implementation
   - Start with Domain + Infrastructure in parallel
   - Then Services (using completed domain entities and infra adapters)
   - Then API (using completed services)
   - Then Frontend (using API contracts)
4. **STOP and VALIDATE**: Run quickstart.md acceptance scenarios
5. If successful, proceed to P2/P3; if not, iterate or pivot

### Incremental Delivery

- After Phase 1+2: Can test backend in isolation (no UI)
- After Domain+Infra: Can test business logic in unit tests
- After Services: Can test orchestration flows
- After API: Can test via curl/Postman (no UI needed)
- After Frontend: Full end-to-end workflow

---

## Notes

- [P] tasks = different files, no dependencies within phase
- [US1] label maps task to User Story 1 for traceability
- POC excludes P2/P3, so no tasks for payee merge or AI reports
- Sync execution endpoint (POST /sync-plan/:id/execute) deferred to post-POC
- Authentication, multi-user support deferred to post-POC
- **1-click run**: `docker-compose up` (T013) or `npm run dev:all` (T014)
- **Dockerfiles** (T011-T012) enable deployment to home-ops with Helm chart (post-POC)
- Commit after each logical group (e.g., all domain entities, all infra adapters)
- Stop at Phase 4 checkpoint to validate POC before expanding scope
