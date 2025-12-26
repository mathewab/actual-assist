# Phase 0 Research: Jobs Workflow

## Decision 1: Persist job state in SQLite via existing infra

- **Decision**: Store job and job step records in SQLite using the existing database layer and migrations.
- **Rationale**: Durable status across restarts is required for user visibility, and the project already uses SQLite with repositories and migrations.
- **Alternatives considered**:
  - In-memory tracking: rejected because status would be lost on restart.
  - External job queue/service: rejected due to added dependency and operational complexity.

## Decision 2: Orchestration via explicit JobService + JobOrchestrator

- **Decision**: Introduce a JobService for lifecycle/state updates and a JobOrchestrator for sequential step execution.
- **Rationale**: Aligns with existing service patterns and keeps orchestration logic centralized and testable.
- **Alternatives considered**:
  - Embed orchestration inside API routes: rejected due to poor testability and mixed concerns.
  - Extend existing SyncScheduler for ad-hoc jobs: rejected because scheduler is periodic and not user-driven.

## Decision 3: API-first status visibility with UI polling

- **Decision**: Provide job status via dedicated API endpoints and use UI polling to reflect progress.
- **Rationale**: Works with current frontend patterns (React Query) and avoids introducing real-time infrastructure.
- **Alternatives considered**:
  - WebSockets/server-sent events: rejected for scope and dependency reasons.
  - Pure client-side optimistic state: rejected because it cannot reflect server-side failures.

## Decision 4: Expand job coverage to all long-running operations

- **Decision**: Migrate remaining async work (suggestions generate/retry, snapshot create/redownload, apply suggestions, scheduled sync+suggest) into the jobs system.
- **Rationale**: Ensures consistent visibility, auditability, and failure handling across all long-running user actions.
- **Alternatives considered**:
  - Leave these paths synchronous: rejected due to inconsistent UX and lack of durable status.
  - One-off background workers per endpoint: rejected as duplication and harder to audit.

## Decision 5: Use explicit, domain-scoped job type names

- **Decision**: Adopt clearer job type IDs (e.g., `budget_sync`, `suggestions_generate`, `snapshot_redownload`) and user-facing labels.
- **Rationale**: Improves UX clarity and avoids ambiguous “sync/generate” names when listing multiple job types.
- **Alternatives considered**:
  - Keep existing short names: rejected because they become unclear once more job types are added.
  - Encode details only in metadata: rejected because list filtering and readability suffer.

## Decision 6: Scheduler enqueues jobs instead of running work inline

- **Decision**: Change the scheduler to enqueue `scheduled_sync_and_suggest` jobs; retries/backoff handled by job runner logic.
- **Rationale**: Aligns scheduled work with the same lifecycle tracking and error reporting as user-initiated jobs.
- **Alternatives considered**:
  - Keep scheduler performing work directly: rejected due to missing job visibility and duplicated retry logic.
