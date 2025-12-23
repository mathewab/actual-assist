-- SQLite schema for audit log and suggestion staging
-- Version: 2.0.0
-- Purpose: Track AI categorization suggestions and user actions

-- Suggestions table: AI-generated categorization recommendations
CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,              -- UUID v4
  budget_id TEXT NOT NULL,          -- Actual Budget ID (budgetId)
  transaction_id TEXT NOT NULL,     -- Actual Budget transaction ID
  transaction_account_id TEXT,      -- Account ID
  transaction_account_name TEXT,    -- Account name for display
  transaction_payee TEXT,           -- Payee name from transaction
  transaction_amount REAL,          -- Transaction amount
  transaction_date TEXT,            -- Transaction date
  current_category_id TEXT,         -- Current category ID (may be NULL)
  proposed_category_id TEXT NOT NULL, -- Proposed category ID
  proposed_category_name TEXT NOT NULL,
  suggested_payee_name TEXT,        -- LLM-suggested canonical payee name from fuzzy match
  confidence REAL NOT NULL,         -- 0.0 to 1.0
  rationale TEXT NOT NULL,          -- AI explanation
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
    'sync_plan_built',
    'sync_executed',
    'sync_failed'
  )),
  entity_type TEXT NOT NULL,        -- e.g., 'BudgetSnapshot', 'Suggestion'
  entity_id TEXT NOT NULL,
  metadata TEXT,                    -- JSON blob for additional context
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Payee category cache: Store learned payee→category mappings to reduce LLM calls
CREATE TABLE IF NOT EXISTS payee_category_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_id TEXT NOT NULL,
  payee_name TEXT NOT NULL,           -- Normalized payee name (lowercase, trimmed)
  payee_name_original TEXT NOT NULL,  -- Original payee name for display
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  confidence REAL NOT NULL,           -- Confidence at time of caching
  source TEXT NOT NULL CHECK(source IN ('user_approved', 'high_confidence_ai')),
  hit_count INTEGER DEFAULT 1,        -- Number of times this cache entry was used
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(budget_id, payee_name)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_suggestions_budget ON suggestions(budget_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
CREATE INDEX IF NOT EXISTS idx_suggestions_transaction ON suggestions(transaction_id);

-- Unique constraint: Only one suggestion per transaction per budget
-- If regeneration is needed, the existing row should be updated or deleted first
CREATE UNIQUE INDEX IF NOT EXISTS idx_suggestions_budget_transaction 
  ON suggestions(budget_id, transaction_id);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_payee_cache_budget ON payee_category_cache(budget_id);
CREATE INDEX IF NOT EXISTS idx_payee_cache_payee ON payee_category_cache(payee_name);
