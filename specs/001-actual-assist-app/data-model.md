# Data Model: Actual Budget Assistant POC

**Date**: 2025-12-21  
**Feature**: [spec.md](spec.md) | [plan.md](plan.md) | [research.md](research.md)

## Core Entities

### BudgetSnapshot

**Purpose**: Immutable reference to a downloaded Actual budget file with metadata for staleness detection.

**Attributes**:
- `id` (string, UUID): Unique identifier for this snapshot
- `budgetId` (string): Actual budget ID (from server)
- `filepath` (string): Local path to cached budget file
- `downloadedAt` (ISO 8601 timestamp): When snapshot was created
- `fileHash` (string, SHA-256): Hash of downloaded file for integrity check
- `transactionCount` (number): Total transactions in snapshot
- `categoryCount` (number): Total categories available

**Validation Rules**:
- `id` must be valid UUIDv4
- `downloadedAt` must not be future date
- `fileHash` must match actual file content
- `transactionCount` and `categoryCount` must be non-negative

**Relationships**:
- One snapshot has many suggestions (1:N)
- One snapshot has one sync plan (1:1, optional until build)

**State Transitions**: Immutable once created; new download creates new snapshot.

---

### Suggestion

**Purpose**: AI-proposed categorization change for a single transaction, pending user review.

**Attributes**:
- `id` (string, UUID): Unique identifier
- `snapshotId` (string, UUID): Reference to parent BudgetSnapshot
- `transactionId` (string): Actual transaction ID
- `transactionPayee` (string): Denormalized for UI display
- `transactionAmount` (number): Amount in cents (per Actual convention)
- `transactionDate` (ISO 8601 date): YYYY-MM-DD
- `currentCategoryId` (string | null): Existing category (null if uncategorized)
- `proposedCategoryId` (string): AI-suggested category
- `proposedCategoryName` (string): Denormalized for UI display
- `confidence` (number, 0-1): AI confidence score
- `rationale` (string): Human-readable explanation from AI
- `status` (enum): `pending` | `approved` | `rejected`
- `createdAt` (ISO 8601 timestamp): When suggestion was generated
- `updatedAt` (ISO 8601 timestamp): Last status change

**Validation Rules**:
- `snapshotId` must reference existing BudgetSnapshot
- `transactionAmount` must be integer (cents)
- `confidence` must be in [0, 1]
- `status` can only transition: pending → approved OR pending → rejected (no reversal in POC)
- `rationale` must be non-empty
- `currentCategoryId` and `proposedCategoryId` must differ (no no-op suggestions)

**Relationships**:
- Many suggestions belong to one snapshot (N:1)

**State Transitions**:
```
pending --[approve]--> approved
pending --[reject]--> rejected
(no transitions from approved/rejected in POC)
```

---

### SyncPlan

**Purpose**: Ordered list of approved changes ready for submission to Actual server, with dry-run preview.

**Attributes**:
- `id` (string, UUID): Unique identifier
- `snapshotId` (string, UUID): Reference to source BudgetSnapshot
- `changes` (array of Change): Ordered list of mutations
- `createdAt` (ISO 8601 timestamp): When plan was built
- `dryRunSummary` (object): Preview counts and validation results

**Change Structure**:
```typescript
interface Change {
  transactionId: string;
  field: 'category';
  oldValue: string | null;
  newValue: string;
  suggestionId: string; // Traceability
}
```

**DryRunSummary Structure**:
```typescript
interface DryRunSummary {
  totalChanges: number;
  approvedSuggestions: number;
  conflicts: Conflict[]; // Empty in POC; future: detect server-side changes
  estimatedSyncTime: number; // Seconds
}
```

**Validation Rules**:
- `changes` must only include approved suggestions
- `changes` must not duplicate transaction IDs (one change per transaction in POC)
- `snapshotId` must reference existing BudgetSnapshot
- Plan is immutable once created; rebuild if suggestions change

**Relationships**:
- One sync plan belongs to one snapshot (N:1)

**State Transitions**: Immutable; execution tracked in audit log, not in SyncPlan entity.

---

## Supporting Entities

### AuditEntry

**Purpose**: Append-only log of all system actions for compliance and debugging.

**Attributes**:
- `id` (number, autoincrement): Unique identifier
- `eventType` (enum): `snapshot_downloaded` | `suggestion_generated` | `suggestion_approved` | `suggestion_rejected` | `sync_plan_built` | `sync_executed` | `error_occurred`
- `snapshotId` (string | null): Context reference
- `suggestionId` (string | null): Context reference
- `details` (JSON object): Event-specific payload
- `timestamp` (ISO 8601 timestamp): When event occurred

**Validation Rules**:
- `eventType` must be from allowed enum
- `timestamp` must not be future date
- `details` must be valid JSON

**Relationships**: None (append-only log)

---

## Entity Diagram

```
BudgetSnapshot (1) --< (N) Suggestion
      |
      | (1:1)
      v
  SyncPlan
      |
      | references
      v
  Change[] --< Suggestion (via suggestionId)
```

---

## Persistence Notes

- **BudgetSnapshot**: Store metadata in SQLite; actual file remains in `dataDir` managed by @actual-app/api.
- **Suggestion**: Persist in SQLite `suggestions` table (see [research.md](research.md) schema).
- **SyncPlan**: Build on-demand; optionally cache in SQLite for audit (defer to post-POC).
- **AuditEntry**: Append to SQLite `audit_log` table.

---

## Constitution Alignment

- **P1 (Modular)**: Clear ownership: BudgetSnapshot (budget-service), Suggestion (ai-service), SyncPlan (sync-service).
- **P2 (No Duplication)**: Single source for suggestion state (SQLite); single sync plan builder.
- **P3 (Testable)**: Pure value objects; validation rules testable in isolation.
- **P4 (Explicit)**: All fields typed; state transitions documented; no hidden mutations.
- **P5 (Separation)**: Domain entities have no infrastructure dependencies (no @actual-app/api imports).
- **P7 (Error Handling)**: Validation failures explicit (e.g., InvalidConfidenceError); audit log captures errors.
