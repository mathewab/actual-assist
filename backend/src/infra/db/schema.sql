-- SQLite schema for audit log and suggestion staging
-- Version: 1.0.0
-- Purpose: Track AI categorization suggestions and user actions

-- Suggestions table: AI-generated categorization recommendations
CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,              -- UUID v4
  budget_snapshot_id TEXT NOT NULL, -- Links to BudgetSnapshot entity
  transaction_id TEXT NOT NULL,     -- Actual Budget transaction ID
  suggested_category_id TEXT,       -- NULL for uncategorized suggestion
  suggested_category_name TEXT,
  confidence REAL NOT NULL,         -- 0.0 to 1.0
  reasoning TEXT NOT NULL,          -- AI explanation
  status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected', 'applied')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log: Immutable record of all user actions
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'snapshot_created',
    'suggestions_generated',
    'suggestion_approved',
    'suggestion_rejected',
    'sync_plan_created',
    'sync_executed',
    'sync_failed'
  )),
  entity_type TEXT NOT NULL,        -- e.g., 'BudgetSnapshot', 'Suggestion'
  entity_id TEXT NOT NULL,
  metadata TEXT,                    -- JSON blob for additional context
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_suggestions_snapshot ON suggestions(budget_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
