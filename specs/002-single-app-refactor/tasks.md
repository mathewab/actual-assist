---

description: "Task list template for feature implementation"
---

# Tasks: Single App Refactor

**Input**: Design documents from `/specs/002-single-app-refactor/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are OPTIONAL - not included because they were not requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create unified single-app directory structure in `src/` and `tests/`
- [X] T002 [P] Create root `.env.example` by merging `backend/.env.example` and `frontend/.env.example`
- [X] T003 [P] Create root `tsconfig.json` for the unified TypeScript project
- [X] T004 [P] Move `frontend/vite.config.ts` to `vite.config.ts` and adjust paths for `src/ui/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Move backend code from `backend/src/` into `src/` (`api/`, `domain/`, `services/`, `infra/`, `server.ts`) and fix import paths
- [X] T006 Move frontend code from `frontend/src/` into `src/ui/` and fix import paths
- [X] T007 Consolidate tests into `tests/` by moving `backend/tests/` to `tests/unit|integration` and `frontend/tests/` to `tests/e2e`
- [X] T008 Update tooling configs to new paths: `backend/vitest.config.ts` → `vitest.config.ts`, `frontend/playwright.config.ts` → `playwright.config.ts`
- [X] T009 Update root `package.json` and `package-lock.json` to single-app scripts and dependencies
- [X] T010 Update build configs for unified output paths in `tsconfig.json` and `vite.config.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Single Deployment (Priority: P1) 🎯 MVP

**Goal**: Ship a single deployable artifact that serves UI and API from the same base URL

**Independent Test**: Deploy one release package and confirm UI loads and API requests succeed from the same base URL

### Implementation for User Story 1

- [X] T011 [US1] Serve UI assets and API from one runtime in `src/server.ts`
- [X] T012 [US1] Ensure API routing remains under `/api` in `src/api/index.ts` and `src/api/*`
- [X] T013 [US1] Update `Dockerfile` to build UI + server into a single runtime image
- [X] T014 [US1] Update `docker-compose.yml` to a single service and unified port mapping
- [X] T015 [US1] Update Helm chart templates for single service: `charts/actual-assist/templates/deployment.yaml`, `charts/actual-assist/templates/service.yaml`, `charts/actual-assist/templates/ingress.yaml`, `charts/actual-assist/values.yaml`
- [X] T016 [US1] Update GitHub Actions workflows for unified build/test/release: `.github/workflows/pr-validation.yaml`, `.github/workflows/release.yaml`

**Checkpoint**: User Story 1 deploys as a single app and is verifiable independently

---

## Phase 4: User Story 2 - Preserve User Experience (Priority: P2)

**Goal**: Keep user flows and entry points behaving the same after refactor

**Independent Test**: Run core user flows against the single app and confirm no step changes or broken bookmarks

### Implementation for User Story 2

- [X] T017 [US2] Update UI API client base URL defaults in `src/ui/services/api.ts`
- [X] T018 [US2] Add redirects or fallbacks for legacy entry points in `src/server.ts`
- [X] T019 [US2] Validate UI routing still resolves existing paths in `src/ui/App.tsx`
- [X] T020 [US2] Update user-facing docs with new URLs and ports in `README.md`

**Checkpoint**: User Story 2 preserves existing UX without regressions

---

## Phase 5: User Story 3 - Local Run Simplicity (Priority: P3)

**Goal**: Enable local development with a single start command

**Independent Test**: Start the app once locally and confirm UI + API are reachable

### Implementation for User Story 3

- [X] T021 [US3] Add single-app dev/build/start scripts in `package.json`
- [X] T022 [US3] Configure dev server middleware for unified runtime in `vite.config.ts`
- [X] T023 [US3] Update local dev instructions in `specs/002-single-app-refactor/quickstart.md`

**Checkpoint**: User Story 3 delivers a one-command local run

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Clean up and ensure consistency across the repo

- [X] T024 [P] Remove obsolete `backend/` and `frontend/` folders after migration
- [X] T025 [P] Update `.dockerignore` to reflect new build outputs (`dist/`, `tests/`, `data/`)
- [X] T026 Update Helm documentation for single service in `charts/actual-assist/README.md`
- [X] T027 Update root documentation to reflect single-app architecture in `README.md`
- [X] T028 Update deployment docs and examples in `README.md` (docker-compose, ports, URLs)
- [ ] T029 Run manual validation suite (npm lint/build/test targets, Helm lint, Docker build, docker-compose build/up, and `act` workflows) referencing `.github/workflows/pr-validation.yaml`, `.github/workflows/release.yaml`, and `README.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
- **Polish (Phase 6)**: Depends on user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May reuse US1 outputs but remains independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Independent of US1/US2

### Parallel Opportunities

- Setup tasks marked [P] can run in parallel (T002, T003, T004)
- Foundational work can be split between backend and frontend moves (T005, T006)
- User Story 1 deployment artifacts (T013, T014, T015, T016) can proceed in parallel after T011/T012

---

## Parallel Example: User Story 1

```bash
Task: "Update Dockerfile to build UI + server into a single runtime image"
Task: "Update docker-compose.yml to a single service and unified port mapping"
Task: "Update Helm chart templates for single service"
Task: "Update GitHub Actions workflows for unified build/test/release"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Deploy the single app and verify UI + API share a base URL

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP)
3. Add User Story 2 → Validate UX parity
4. Add User Story 3 → Validate single-command local run
5. Finish Polish phase
