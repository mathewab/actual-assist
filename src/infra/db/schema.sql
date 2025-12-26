-- SQLite schema for audit log and suggestion staging
-- Version: 2.0.0
-- Purpose: Track AI categorization suggestions and user actions

-- Suggestions table: AI-generated categorization recommendations
-- Supports independent payee and category suggestions with separate confidence/rationale
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
  current_payee_id TEXT,            -- Current payee ID (if exists)
  
  -- Payee suggestion fields
  proposed_payee_id TEXT,           -- Proposed canonical payee ID
  proposed_payee_name TEXT,         -- Proposed canonical payee name
  payee_confidence REAL DEFAULT 0,  -- Payee suggestion confidence 0.0 to 1.0
  payee_rationale TEXT,             -- Payee suggestion reasoning
  payee_status TEXT DEFAULT 'pending' CHECK(payee_status IN ('pending', 'approved', 'rejected', 'applied', 'skipped')),
  
  -- Category suggestion fields  
  proposed_category_id TEXT,        -- Proposed category ID (nullable now)
  proposed_category_name TEXT,      -- Proposed category name
  category_confidence REAL DEFAULT 0, -- Category suggestion confidence 0.0 to 1.0
  category_rationale TEXT,          -- Category suggestion reasoning
  category_status TEXT DEFAULT 'pending' CHECK(category_status IN ('pending', 'approved', 'rejected', 'applied', 'skipped')),
  
  -- Legacy fields for backward compatibility (will be deprecated)
  suggested_payee_name TEXT,        -- LLM-suggested canonical payee name (legacy)
  confidence REAL NOT NULL DEFAULT 0, -- Combined confidence (legacy, computed)
  rationale TEXT NOT NULL DEFAULT '', -- Combined rationale (legacy, computed)
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'applied')),
  
  -- Correction fields (when user rejects with correction)
  corrected_payee_id TEXT,          -- User-provided correct payee ID
  corrected_payee_name TEXT,        -- User-provided correct payee name
  corrected_category_id TEXT,       -- User-provided correct category ID
  corrected_category_name TEXT,     -- User-provided correct category name
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log: Immutable record of all user actions
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,        -- e.g., 'BudgetSnapshot', 'Suggestion'
  entity_id TEXT NOT NULL,
  metadata TEXT,                    -- JSON blob for additional context
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Jobs: Track user-initiated background work (sync, suggestions, combined)
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,              -- UUID v4
  budget_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  failure_reason TEXT,
  parent_job_id TEXT,
  metadata TEXT
);

-- Job steps: Ordered steps for combined jobs
CREATE TABLE IF NOT EXISTS job_steps (
  id TEXT PRIMARY KEY,              -- UUID v4
  job_id TEXT NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  failure_reason TEXT,
  UNIQUE(job_id, position)
);

-- Job events: Immutable job/step status transitions
CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY,              -- UUID v4
  job_id TEXT NOT NULL,
  job_step_id TEXT,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
CREATE INDEX IF NOT EXISTS idx_jobs_budget ON jobs(budget_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_job_steps_job ON job_steps(job_id);
CREATE INDEX IF NOT EXISTS idx_job_steps_status ON job_steps(status);
CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_step ON job_events(job_step_id);
CREATE INDEX IF NOT EXISTS idx_payee_cache_budget ON payee_category_cache(budget_id);
CREATE INDEX IF NOT EXISTS idx_payee_cache_payee ON payee_category_cache(payee_name);

-- Payee match cache: Store learned payee name normalizations (raw payee -> canonical payee)
-- Separate from category cache to independently cache payee matching
CREATE TABLE IF NOT EXISTS payee_match_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_id TEXT NOT NULL,
  raw_payee_name TEXT NOT NULL,           -- Normalized raw payee name from transaction
  raw_payee_name_original TEXT NOT NULL,  -- Original raw payee name for display
  canonical_payee_id TEXT,                -- Canonical payee ID in Actual Budget (if exists)
  canonical_payee_name TEXT NOT NULL,     -- Canonical/clean payee name
  confidence REAL NOT NULL,               -- Confidence in this mapping
  source TEXT NOT NULL CHECK(source IN ('user_approved', 'high_confidence_ai', 'fuzzy_match')),
  hit_count INTEGER DEFAULT 1,            -- Number of times this cache entry was used
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(budget_id, raw_payee_name)
);

CREATE INDEX IF NOT EXISTS idx_payee_match_cache_budget ON payee_match_cache(budget_id);
CREATE INDEX IF NOT EXISTS idx_payee_match_cache_payee ON payee_match_cache(raw_payee_name);
