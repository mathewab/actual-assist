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
