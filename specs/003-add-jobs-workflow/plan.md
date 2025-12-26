# Implementation Plan: Jobs Workflow

**Branch**: `003-add-jobs-workflow` | **Date**: 2025-12-26 | **Spec**: /home/ashish/projects/actual-assist/specs/003-add-jobs-workflow/spec.md
**Input**: Feature specification from `/specs/003-add-jobs-workflow/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command.

## Summary

Introduce a persistent jobs workflow for sync and suggestions generation, including a combined “sync then generate” flow. Provide job status visibility via API and UI, backed by durable storage and explicit orchestration steps. Extend the jobs system to cover remaining async/background operations (suggestions generate/retry, snapshot create/redownload, apply suggestions, and scheduled sync+suggest) so all long-running work is tracked consistently.

## Technical Context

**Language/Version**: Node.js 20.x, TypeScript 5.x (ES modules)  
**Primary Dependencies**: Express, React 18, Vite, TanStack Query, @actual-app/api, OpenAI SDK, better-sqlite3, zod, winston  
**Storage**: SQLite (better-sqlite3) with migrations via knex  
**Testing**: Vitest (unit/integration), Playwright (e2e)  
**Target Platform**: Node.js server + web UI (browser)  
**Project Type**: Web application (backend + frontend in single repo)  
**Performance Goals**: Job status visible within 5 seconds of completion; job list retrieval under 1 second for typical datasets  
**Constraints**: Job history retention default 30 days; status transitions must be auditable and deterministic  
**Scale/Scope**: Single-tenant usage; hundreds of jobs per budget; low-concurrency interactive traffic
**Out of Scope**: Legacy sync plan build/execute workflow (deprecated and removed).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Modular design with explicit ownership; no feature proceeds without defined module boundaries and owners (P1, P5, P10).
  - Plan: Domain entities in `src/domain`, orchestration in `src/services`, persistence in `src/infra`, HTTP in `src/api`, UI in `src/ui`.
- Zero duplication of business rules; shared logic extracted to a single authoritative module (P2).
  - Plan: Job status transitions centralized in a Job domain module/service.
- Testability proven up front: isolated unit test strategy and coverage of error paths documented before build (P3, P7).
  - Plan: Unit tests for job state transitions; integration tests for API endpoints.
- Contracts and control flow are explicit; reject hidden side effects or cleverness without justification (P4).
  - Plan: Explicit job lifecycle API and orchestrator flow; no implicit side effects.
- Dependencies justified with license/size review and exit strategy recorded; avoid unnecessary additions (P6).
  - Plan: No new dependencies anticipated.
- Error handling plan defines taxonomy, propagation, and logging/redaction rules; failures are intentional and observable (P7).
  - Plan: Job failures capture user-safe reason + internal log context; error mapping at API boundary.
- Refactoring commitments captured to ensure the codebase is left healthier; speculative abstractions rejected (P8, P9).
  - Plan: Minimal new abstractions; reuse existing service/repository patterns.
- Reviewability standards met: consistent patterns, directory layout, and clear rationale included in plan (P10).
  - Plan: Keep new modules aligned with existing conventions in `src/services` and `src/infra/repositories`.

## Project Structure

### Documentation (this feature)

```text
specs/003-add-jobs-workflow/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── api/
├── domain/
├── infra/
├── scheduler/
├── services/
├── ui/
└── server.ts

tests/
├── contract/
├── integration/
└── unit/
```

**Structure Decision**: Single repository with backend and frontend co-located. Jobs logic will live in `src/domain`, `src/services`, and `src/infra`, with API routes in `src/api` and UI status components in `src/ui`.

## Complexity Tracking

No Constitution violations identified.

## Phase 0: Research Summary

Research completed in `research.md` with decisions on persistence, orchestration pattern, and API/UI integration strategy.

## Phase 1: Design Summary

Design artifacts produced:
- `data-model.md` for Job, JobStep, and state transitions.
- `contracts/` for job lifecycle and status endpoints.
- `quickstart.md` for feature verification steps.

## Scope Update: Async Work Migration

### Async Operations to Migrate

- `POST /api/suggestions/generate` (generate suggestions on-demand)
- `POST /api/suggestions/sync-and-generate` (sync + diff-based suggestions)
- `POST /api/suggestions/:id/retry` (retry payee group suggestions)
- `POST /api/snapshots` (create snapshot)
- `POST /api/snapshots/redownload` (force redownload)
- `POST /api/sync/apply` (apply approved suggestions)
- Scheduler: `SyncScheduler.runSync` (scheduled sync + suggest with retry/backoff)

### Job Types (System IDs → UX Labels)

- `budget_sync` → “Sync Budget”
- `suggestions_generate` → “Generate Suggestions”
- `sync_and_suggest` → “Sync & Generate Suggestions”
- `suggestions_retry_payee` → “Retry Suggestions (Payee Group)”
- `suggestions_apply` → “Apply Approved Suggestions”
- `snapshot_create` → “Create Snapshot”
- `snapshot_redownload` → “Redownload Snapshot”
- `scheduled_sync_and_suggest` → “Scheduled Sync & Generate”

### Migration Approach

- Replace direct async execution in API routes with job creation + orchestration, returning `{ job, steps }` consistently.
- Move scheduler work to enqueue `scheduled_sync_and_suggest` jobs; retry/backoff handled by job runner or re-queue logic, not `setTimeout` in the scheduler.
- Ensure job metadata captures trigger context (user-initiated vs scheduled) for UX and audit visibility.

## Constitution Check (Post-Design)

Re-evaluated after design artifacts: all gates satisfied with no violations.
