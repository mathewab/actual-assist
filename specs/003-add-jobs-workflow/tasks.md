# Tasks: Jobs Workflow

**Input**: Design documents from `/specs/003-add-jobs-workflow/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested; no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Confirm current database migration workflow in /home/ashish/projects/actual-assist/src/infra/db/migrations
- [x] T002 [P] Review existing sync/suggestions routes and services for integration points in /home/ashish/projects/actual-assist/src/api/syncRoutes.ts
- [x] T003 [P] Review existing sync/suggestions routes and services for integration points in /home/ashish/projects/actual-assist/src/api/suggestionRoutes.ts
- [x] T004 [P] Review existing services for sync/suggestions orchestration in /home/ashish/projects/actual-assist/src/services/SyncService.ts
- [x] T005 [P] Review existing services for sync/suggestions orchestration in /home/ashish/projects/actual-assist/src/services/SuggestionService.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

- [x] T006 Define Job domain entity and state transitions in /home/ashish/projects/actual-assist/src/domain/entities/Job.ts
- [x] T007 Define JobStep domain entity in /home/ashish/projects/actual-assist/src/domain/entities/JobStep.ts
- [x] T008 Define JobEvent domain entity in /home/ashish/projects/actual-assist/src/domain/entities/JobEvent.ts
- [x] T009 Create database schema/migration for jobs, job_steps, job_events in /home/ashish/projects/actual-assist/src/infra/db/migrations/20251226_add_jobs_tables.cjs
- [x] T010 Implement JobRepository for CRUD and list/filter in /home/ashish/projects/actual-assist/src/infra/repositories/JobRepository.ts
- [x] T011 Implement JobStepRepository in /home/ashish/projects/actual-assist/src/infra/repositories/JobStepRepository.ts
- [x] T012 Implement JobEventRepository to record status changes in /home/ashish/projects/actual-assist/src/infra/repositories/JobEventRepository.ts
- [x] T013 Implement JobService for lifecycle/status updates in /home/ashish/projects/actual-assist/src/services/JobService.ts
- [x] T014 Implement JobOrchestrator for sequential steps in /home/ashish/projects/actual-assist/src/services/JobOrchestrator.ts
- [x] T015 Add API router for jobs (list/get/create) in /home/ashish/projects/actual-assist/src/api/jobRoutes.ts
- [x] T016 Wire jobRoutes into API index in /home/ashish/projects/actual-assist/src/api/index.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Track a manual sync (Priority: P1) 🎯 MVP

**Goal**: User can start a sync job and see status transitions through completion.

**Independent Test**: Start a sync job and verify list/get endpoints return queued → running → succeeded/failed.

### Implementation for User Story 1

- [x] T017 [US1] Add sync job creation endpoint handler in /home/ashish/projects/actual-assist/src/api/jobRoutes.ts
- [x] T018 [US1] Add sync job execution path in /home/ashish/projects/actual-assist/src/services/JobOrchestrator.ts
- [x] T019 [US1] Integrate SyncService execution with job status updates in /home/ashish/projects/actual-assist/src/services/JobService.ts
- [x] T020 [US1] Add UI jobs list polling and status display in /home/ashish/projects/actual-assist/src/ui/components/JobList.tsx
- [x] T021 [US1] Wire jobs list into main UI flow in /home/ashish/projects/actual-assist/src/ui/components/SuggestionList.tsx

**Checkpoint**: User Story 1 independently functional

---

## Phase 4: User Story 2 - Generate suggestions with job status (Priority: P2)

**Goal**: User can start suggestions generation as a job and track its status.

**Independent Test**: Start suggestions job and verify status in list/get endpoints; suggestions appear when job succeeds.

### Implementation for User Story 2

- [x] T022 [US2] Add suggestions job creation endpoint handler in /home/ashish/projects/actual-assist/src/api/jobRoutes.ts
- [x] T023 [US2] Add suggestions job execution path in /home/ashish/projects/actual-assist/src/services/JobOrchestrator.ts
- [x] T024 [US2] Integrate SuggestionService generation with job status updates in /home/ashish/projects/actual-assist/src/services/JobService.ts
- [x] T025 [US2] Extend UI job list filtering to show suggestions jobs in /home/ashish/projects/actual-assist/src/ui/components/JobList.tsx

**Checkpoint**: User Story 2 independently functional

---

## Phase 5: User Story 3 - Run a combined “sync then generate” flow (Priority: P3)

**Goal**: Combined job runs sync then suggestions with step-level visibility.

**Independent Test**: Start combined job and verify step order and failure handling in job detail.

### Implementation for User Story 3

- [x] T026 [US3] Add combined job creation endpoint handler in /home/ashish/projects/actual-assist/src/api/jobRoutes.ts
- [x] T027 [US3] Add combined job orchestration with JobStep tracking in /home/ashish/projects/actual-assist/src/services/JobOrchestrator.ts
- [x] T028 [US3] Add job detail API response with steps in /home/ashish/projects/actual-assist/src/api/jobRoutes.ts
- [x] T029 [US3] Add UI job detail/steps view in /home/ashish/projects/actual-assist/src/ui/components/JobDetail.tsx

**Checkpoint**: User Story 3 independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T030 [P] Add retention cleanup task for jobs older than 30 days in /home/ashish/projects/actual-assist/src/services/JobRetentionService.ts
- [x] T031 Update quickstart verification steps if needed in /home/ashish/projects/actual-assist/specs/003-add-jobs-workflow/quickstart.md
- [x] T032 [P] Add error mapping and user-safe failure reasons in /home/ashish/projects/actual-assist/src/api/jobRoutes.ts
- [x] T033 [P] Add structured logging for job lifecycle events in /home/ashish/projects/actual-assist/src/services/JobService.ts
- [x] T034 Run quickstart.md validation steps in /home/ashish/projects/actual-assist/specs/003-add-jobs-workflow/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed) or sequentially (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - no dependency on other stories
- **User Story 2 (P2)**: Can start after Foundational - depends on shared job infrastructure
- **User Story 3 (P3)**: Can start after Foundational - depends on job steps and orchestration

### Within Each User Story

- Implement domain/service logic before endpoints
- Implement API before UI integration
- Story complete before moving to the next priority

### Parallel Opportunities

- Setup tasks marked [P] can run in parallel
- Foundational repository/entity tasks can be done in parallel where files do not overlap
- User Story 1 and User Story 2 can proceed in parallel after Foundational phase
- UI tasks can proceed in parallel with backend tasks once endpoints are defined

---

## Parallel Example: User Story 1

```bash
Task: "Add sync job creation endpoint handler in /home/ashish/projects/actual-assist/src/api/jobRoutes.ts"
Task: "Add UI jobs list polling and status display in /home/ashish/projects/actual-assist/src/ui/components/JobList.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate User Story 1 independently

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. User Story 1 → Validate
3. User Story 2 → Validate
4. User Story 3 → Validate
5. Polish and cleanup

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Merge incrementally with validations per story
