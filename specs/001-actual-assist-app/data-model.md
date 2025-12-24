# Data Model: Actual Budget Assistant POC

**Date**: 2025-12-23 (Updated)  
**Feature**: [spec.md](spec.md) | [plan.md](plan.md) | [research.md](research.md)

## Core Entities

### BudgetSnapshot

**Purpose**: Immutable reference to the currently active downloaded Actual budget file with audit metadata; single snapshot per session, replaced only on explicit user re-download following drift/sync warnings.

**Attributes**:
- `budgetId` (string): Actual budget ID (from server) - unique identifier for this snapshot
- `filepath` (string): Local path to cached budget file
- `downloadedAt` (ISO 8601 timestamp): When snapshot was created
- `transactionCount` (number): Total transactions in snapshot
- `categoryCount` (number): Total categories available

**Validation Rules**:
- `budgetId` must be non-empty string (from Actual server)
- `downloadedAt` must not be future date
- `transactionCount` and `categoryCount` must be non-negative

**Relationships**:
- One snapshot has many suggestions (1:N)
- One snapshot has one sync plan (1:1, optional until build)

**State Transitions**: Immutable once created; new download creates new snapshot.

---

### Suggestion

**Purpose**: AI-generated recommendation for a transaction with **independent payee and category suggestions**. Each component can be approved/rejected separately.

**Architecture Note**: Payee and category suggestions are independent with separate confidence, rationale, and status tracking. This enables granular user control and supports the caching strategy where payee matches and category mappings are cached independently.

**Core Attributes**:
- `id` (string, UUID): Unique identifier
- `budgetId` (string): Reference to parent BudgetSnapshot (Actual budget ID)
- `transactionId` (string): Actual transaction ID
- `transactionAccountId` (string | null): Account ID for display
- `transactionAccountName` (string | null): Account name for display
- `transactionPayee` (string | null): Original payee name from transaction
- `transactionAmount` (number): Amount in cents (per Actual convention)
- `transactionDate` (ISO 8601 date): YYYY-MM-DD
- `currentCategoryId` (string | null): Existing category (null if uncategorized)
- `currentPayeeId` (string | null): Existing payee ID (if matched)

**Payee Suggestion Component** (`payeeSuggestion`):
```typescript
interface PayeeSuggestion {
  proposedPayeeId: string | null;    // Canonical payee ID in Actual
  proposedPayeeName: string | null;  // Clean/canonical payee name
  confidence: number;                 // 0.0 to 1.0
  rationale: string;                  // Explanation (e.g., "Fuzzy matched to Amazon")
  status: SuggestionComponentStatus;  // Independent status
}
```

**Category Suggestion Component** (`categorySuggestion`):
```typescript
interface CategorySuggestion {
  proposedCategoryId: string | null;   // Proposed category ID
  proposedCategoryName: string | null; // Category name for display
  confidence: number;                   // 0.0 to 1.0
  rationale: string;                    // Explanation from AI/cache
  status: SuggestionComponentStatus;    // Independent status
}
```

**Correction Data** (`correction`):
```typescript
interface SuggestionCorrection {
  correctedPayeeId: string | null;      // User-provided correct payee ID
  correctedPayeeName: string | null;    // User-provided correct payee name
  correctedCategoryId: string | null;   // User-provided correct category ID
  correctedCategoryName: string | null; // User-provided correct category name
}
```

**Component Status Enum**:
```typescript
type SuggestionComponentStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'skipped';
```
- `pending`: Awaiting user decision
- `approved`: User approved, ready for apply
- `rejected`: User rejected (with optional correction)
- `applied`: Change written to Actual Budget
- `skipped`: Component not applicable (e.g., payee already correct)

**Legacy Fields** (for backward compatibility):
- `confidence` (number): Combined confidence (max of payee/category)
- `rationale` (string): Combined rationale
- `status` (enum): Computed from component statuses
- `proposedCategoryId`, `proposedCategoryName`: Aliases for categorySuggestion fields

**Timestamps**:
- `createdAt` (ISO 8601 timestamp): When suggestion was generated
- `updatedAt` (ISO 8601 timestamp): Last status change

**Validation Rules**:
- `budgetId` must reference existing BudgetSnapshot
- `transactionAmount` must be integer (cents)
- Component `confidence` must be in [0, 1]
- Component status transitions: `pending → approved | rejected`, `approved → applied`, `rejected` is terminal (unless reset)
- At least one of payeeSuggestion or categorySuggestion must have non-skipped status

**Relationships**:
- Many suggestions belong to one snapshot (N:1)
- Unique constraint: One suggestion per (budgetId, transactionId)

**State Transitions** (per component):
```
pending --[approve]--> approved --[apply]--> applied
pending --[reject]--> rejected
pending/approved/rejected --[reset]--> pending (allows undo)
```

---

### SyncPlan

**Purpose**: Ordered list of approved changes ready for submission to Actual server, with dry-run preview.

**Attributes**:
- `id` (string, UUID): Unique identifier
- `budgetId` (string): Reference to source BudgetSnapshot (Actual budget ID)
- `changes` (array of Change): Ordered list of mutations
- `createdAt` (ISO 8601 timestamp): When plan was built
- `dryRunSummary` (object): Preview counts and validation results

**Change Structure**:
```typescript
interface Change {
  id: string;
  transactionId: string;
  suggestionId: string;              // Traceability to source suggestion
  
  // Category change
  proposedCategoryId: string;
  currentCategoryId: string | null;
  proposedCategoryName: string | null;
  currentCategoryName: string | null;
  
  // Payee change (optional)
  proposedPayeeName: string | null;
  hasPayeeChange: boolean;
  
  // Transaction context for display
  transactionPayee: string | null;
  transactionDate: string | null;
  transactionAmount: number | null;
  transactionAccountName: string | null;
}
```

**DryRunSummary Structure**:
```typescript
interface DryRunSummary {
  totalChanges: number;
  categoryChanges: number;        // Count of category mutations
  payeeChanges: number;           // Count of payee mutations
  estimatedImpact: string;        // Human-readable summary
}
```

**Validation Rules**:
- `changes` must only include approved suggestions
- `changes` must not duplicate transaction IDs (one change per transaction)
- `budgetId` must reference existing BudgetSnapshot
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
- `eventType` (enum): See EventType enum below
- `entityType` (string): Entity type (e.g., 'BudgetSnapshot', 'Suggestion')
- `entityId` (string): Entity identifier
- `metadata` (JSON object): Event-specific payload
- `timestamp` (ISO 8601 timestamp): When event occurred

**EventType Enum**:
```typescript
type EventType =
  | 'snapshot_created'
  | 'suggestions_generated'
  | 'suggestions_generated_diff'
  | 'suggestion_approved'
  | 'suggestion_rejected'
  | 'suggestion_retried'
  | 'sync_plan_created'
  | 'sync_plan_built'
  | 'sync_executed'
  | 'sync_failed'
  | 'scheduled_sync_started'
  | 'scheduled_sync_completed'
  | 'scheduled_sync_failed';
```

**Validation Rules**:
- `eventType` must be from allowed enum
- `timestamp` must not be future date
- `metadata` must be valid JSON

**Relationships**: None (append-only log)

---

## Cache Entities

### PayeeCategoryCache

**Purpose**: Store learned payee→category mappings to reduce LLM API calls. Cached entries come from user approvals (high trust) or high-confidence AI suggestions.

**Attributes**:
- `id` (number, autoincrement): Unique identifier
- `budgetId` (string): Scoped to budget
- `payeeName` (string): Normalized payee name (lowercase, trimmed, no special chars)
- `payeeNameOriginal` (string): Original payee name for display
- `categoryId` (string): Mapped category ID
- `categoryName` (string): Category name for display
- `confidence` (number): Confidence at time of caching
- `source` (enum): `user_approved` | `high_confidence_ai`
- `hitCount` (number): Number of times cache entry was used
- `createdAt` (ISO 8601 timestamp): When entry was created
- `updatedAt` (ISO 8601 timestamp): Last update

**Unique Constraint**: (budgetId, payeeName)

---

### PayeeMatchCache

**Purpose**: Store learned raw payee → canonical payee mappings. Caches fuzzy match results and AI-identified payee names.

**Attributes**:
- `id` (number, autoincrement): Unique identifier
- `budgetId` (string): Scoped to budget
- `rawPayeeName` (string): Normalized raw payee name from transaction
- `rawPayeeNameOriginal` (string): Original raw payee name
- `canonicalPayeeId` (string | null): Canonical payee ID in Actual (if exists)
- `canonicalPayeeName` (string): Clean/canonical payee name
- `confidence` (number): Match confidence
- `source` (enum): `user_approved` | `high_confidence_ai` | `fuzzy_match`
- `hitCount` (number): Number of times cache entry was used
- `createdAt` (ISO 8601 timestamp): When entry was created
- `updatedAt` (ISO 8601 timestamp): Last update

**Unique Constraint**: (budgetId, rawPayeeName)

---

## Entity Diagram

```
BudgetSnapshot (1) --< (N) Suggestion
      |                      |
      | (1:1)                | has
      v                      v
  SyncPlan              PayeeSuggestion
      |                 CategorySuggestion
      | references      SuggestionCorrection
      v
  Change[] --< Suggestion (via suggestionId)

PayeeCategoryCache (budgetId, payeeName) → categoryId
PayeeMatchCache (budgetId, rawPayeeName) → canonicalPayeeName
```

---

## Persistence Notes

- **BudgetSnapshot**: Store metadata in SQLite; actual file remains in `dataDir` managed by @actual-app/api.
- **Suggestion**: Persist in SQLite `suggestions` table with component fields.
- **SyncPlan**: Build on-demand from approved suggestions.
- **AuditEntry**: Append to SQLite `audit_log` table.
- **PayeeCategoryCache**: Persist in SQLite `payee_category_cache` table.
- **PayeeMatchCache**: Persist in SQLite `payee_match_cache` table.

---

## Database Schema (SQLite)

```sql
-- Suggestions table with independent payee/category components
CREATE TABLE suggestions (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  transaction_account_id TEXT,
  transaction_account_name TEXT,
  transaction_payee TEXT,
  transaction_amount REAL,
  transaction_date TEXT,
  current_category_id TEXT,
  current_payee_id TEXT,
  
  -- Payee suggestion
  proposed_payee_id TEXT,
  proposed_payee_name TEXT,
  payee_confidence REAL DEFAULT 0,
  payee_rationale TEXT,
  payee_status TEXT DEFAULT 'pending',
  
  -- Category suggestion
  proposed_category_id TEXT,
  proposed_category_name TEXT,
  category_confidence REAL DEFAULT 0,
  category_rationale TEXT,
  category_status TEXT DEFAULT 'pending',
  
  -- Corrections
  corrected_payee_id TEXT,
  corrected_payee_name TEXT,
  corrected_category_id TEXT,
  corrected_category_name TEXT,
  
  -- Legacy fields
  confidence REAL NOT NULL DEFAULT 0,
  rationale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  UNIQUE(budget_id, transaction_id)
);

-- Payee category cache
CREATE TABLE payee_category_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_id TEXT NOT NULL,
  payee_name TEXT NOT NULL,
  payee_name_original TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  hit_count INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(budget_id, payee_name)
);

-- Payee match cache
CREATE TABLE payee_match_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_id TEXT NOT NULL,
  raw_payee_name TEXT NOT NULL,
  raw_payee_name_original TEXT NOT NULL,
  canonical_payee_id TEXT,
  canonical_payee_name TEXT NOT NULL,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  hit_count INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(budget_id, raw_payee_name)
);
```

---

## Constitution Alignment

- **P1 (Modular)**: Clear ownership: BudgetSnapshot (snapshot-service), Suggestion (suggestion-service), SyncPlan (sync-service), Caches (repositories).
- **P2 (No Duplication)**: Single source for suggestion state (SQLite); cache reduces redundant LLM calls.
- **P3 (Testable)**: Pure value objects; validation rules testable in isolation; cache logic isolated.
- **P4 (Explicit)**: All fields typed; state transitions documented; no hidden mutations.
- **P5 (Separation)**: Domain entities have no infrastructure dependencies.
- **P7 (Error Handling)**: Validation failures explicit; audit log captures errors and retries.
