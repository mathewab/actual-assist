# Phase 1 Data Model: Jobs Workflow

## Entities

### Job

**Purpose**: Represents a user-initiated or scheduled unit of work (sync, suggestions generation, snapshot operations, apply, or combined flow).

**Fields**:
- `id` (string, unique): Job identifier.
- `budgetId` (string): Budget the job operates on.
- `type` (enum):
  - `budget_sync`
  - `suggestions_generate`
  - `sync_and_suggest`
  - `suggestions_retry_payee`
  - `suggestions_apply`
  - `snapshot_create`
  - `snapshot_redownload`
  - `scheduled_sync_and_suggest`
- `status` (enum): `queued`, `running`, `succeeded`, `failed`, `canceled`.
- `createdAt` (timestamp)
- `startedAt` (timestamp, nullable)
- `completedAt` (timestamp, nullable)
- `failureReason` (string, nullable; user-safe)
- `parentJobId` (string, nullable): Links step jobs to a combined parent if steps are modeled as jobs.
- `metadata` (object, optional): Non-sensitive context (e.g., fullResync flag, trigger source, retry count, suggestionIds).

**Validation Rules**:
- `type` and `status` are required.
- `startedAt` must be >= `createdAt` when present.
- `completedAt` must be >= `startedAt` when present.
- `failureReason` required when `status = failed`.

**State Transitions**:
- `queued` -> `running` -> `succeeded | failed | canceled`
- Terminal states: `succeeded`, `failed`, `canceled`

### JobStep

**Purpose**: Tracks ordered steps for combined jobs (sync + suggestions).

**Fields**:
- `id` (string, unique)
- `jobId` (string): Parent combined job.
- `stepType` (enum): `sync`, `suggestions`.
- `status` (enum): `queued`, `running`, `succeeded`, `failed`, `canceled`.
- `position` (integer): Execution order.
- `startedAt` (timestamp, nullable)
- `completedAt` (timestamp, nullable)
- `failureReason` (string, nullable)

**Validation Rules**:
- `position` unique per `jobId`.
- Steps must execute in ascending `position`.

**State Transitions**: Same as Job.

### JobEvent (History)

**Purpose**: Immutable record of job status transitions for audit/history views.

**Fields**:
- `id` (string, unique)
- `jobId` (string)
- `status` (enum)
- `message` (string, optional)
- `createdAt` (timestamp)

**Validation Rules**:
- Each status change on Job or JobStep emits a JobEvent.

## Relationships

- Job `1..n` JobStep (for combined jobs)
- Job `1..n` JobEvent
- JobStep `1..n` JobEvent (optional if step history is tracked separately)

## Data Retention

- Job and JobEvent records retained for 30 days by default; older records are purged by a scheduled cleanup task.
