# Research: Actual Budget Assistant POC

**Date**: 2025-12-21  
**Feature**: [spec.md](spec.md) | [plan.md](plan.md)

## Research Tasks

### R1: @actual-app/api Usage Patterns

**Question**: How to download budget, read transactions/categories, detect staleness, build sync plan, execute sync?

**Decision**: Use @actual-app/api v6.x (latest stable) with documented patterns.

**Rationale**:
- Official NPM package maintained by Actual Budget team
- API operates on local file copy with explicit sync model (matches our "no direct writes" principle)
- Provides `downloadBudget()`, `getTransactions()`, `getCategories()`, `sync()` methods
- Staleness detection via comparing local file timestamp/hash with server

**Pattern**:
```typescript
import * as api from '@actual-app/api';

// Initialize and download
await api.init({
  dataDir: './data',
  serverURL: process.env.ACTUAL_SERVER_URL,
  password: process.env.ACTUAL_PASSWORD,
});
await api.downloadBudget(process.env.ACTUAL_BUDGET_ID);

// Read data
const transactions = await api.getTransactions('account-id', startDate, endDate);
const categories = await api.getCategories();

// Detect staleness: track download timestamp locally; before apply, re-check server
// (API does not expose hash directly; use file mtime as proxy)

// Apply changes (via addTransactions/updateTransaction)
await api.updateTransaction(transactionId, { category: newCategoryId });

// Sync to server
await api.sync(); // Pushes local changes; returns sync result

await api.shutdown();
```

**Alternatives considered**:
- Direct SQLite access to Actual's internal DB: rejected, too brittle and breaks encapsulation.
- REST API to Actual server: rejected, server does not expose HTTP endpoints for budget manipulation.

**Cost/Performance**: Local operations <10ms; download ~2s for 5k transactions; sync ~1s.

---

### R2: OpenAI Categorization Prompt Design

**Question**: How to prompt OpenAI for transaction categorization with confidence scores and rationale?

**Decision**: Use GPT-4o-mini with structured output (JSON mode) for cost efficiency and speed.

**Prompt Template**:
```text
You are a financial categorization assistant. Given a transaction and available categories, suggest the most appropriate category with a confidence score (0-1) and brief rationale.

Transaction:
- Payee: {payee}
- Amount: {amount}
- Date: {date}
- Description: {description}

Available Categories:
{categoryList}

Respond in JSON:
{
  "suggestedCategoryId": "uuid",
  "confidence": 0.95,
  "rationale": "Recurring charge for streaming service matches Entertainment category"
}
```

**Rationale**:
- GPT-4o-mini: $0.15/1M input tokens, $0.60/1M output tokens (80% cheaper than GPT-4)
- Structured JSON output ensures parseable results and avoids post-processing fragility
- Confidence score enables user trust calibration (show low-confidence suggestions prominently)
- Rationale improves reviewability (user understands why suggestion was made)

**Cost Estimation**:
- 50 transactions × ~200 input tokens/transaction = 10k input tokens → $0.0015
- 50 responses × ~50 output tokens = 2.5k output tokens → $0.0015
- **Total per batch: ~$0.003** (negligible for POC)

**Performance**: Parallel requests with concurrency limit (5); expect ~2-3s for 50 suggestions.

**Alternatives considered**:
- Claude Sonnet: more expensive, similar quality for categorization task.
- Local LLM (Llama 3): slower, requires GPU, exit strategy if OpenAI cost becomes issue.

---

### R3: Audit/Staging Storage Schema

**Question**: What SQLite schema for suggestions and audit log?

**Decision**: Minimal schema with denormalized transaction context for quick POC iteration.

**Schema**:
```sql
CREATE TABLE suggestions (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  transaction_payee TEXT,
  transaction_amount INTEGER,
  transaction_date TEXT,
  current_category_id TEXT,
  proposed_category_id TEXT NOT NULL,
  proposed_category_name TEXT,
  confidence REAL NOT NULL,
  rationale TEXT,
  status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_suggestions_snapshot ON suggestions(snapshot_id);
CREATE INDEX idx_suggestions_status ON suggestions(status);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL, -- 'snapshot_downloaded', 'suggestion_generated', 'suggestion_approved', 'suggestion_rejected', 'sync_executed'
  snapshot_id TEXT,
  suggestion_id TEXT,
  details TEXT, -- JSON blob for event-specific data
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_snapshot ON audit_log(snapshot_id);
```

**Rationale**:
- Denormalized transaction context (payee, amount) enables UI display without re-querying budget file.
- Status enum enforces state machine (pending → approved|rejected).
- Audit log tracks all actions for compliance with constitution P7 (observable errors) and P10 (reviewability).
- SQLite sufficient for POC (single user, <10k suggestions); exit to PostgreSQL trivial (swap repo implementation).

**Alternatives considered**:
- Normalized schema (separate transactions table): rejected, adds joins and POC doesn't need transaction persistence beyond suggestion context.
- In-memory only: rejected, cannot debug across server restarts.

---

## Summary

- **@actual-app/api**: Use official package; download/sync workflow matches spec; staleness detected via file timestamps.
- **OpenAI**: GPT-4o-mini with JSON mode; ~$0.003 per 50 suggestions; 2-3s latency; confidence + rationale improve UX.
- **Storage**: SQLite with denormalized suggestions table + audit log; sufficient for POC, easy exit to PostgreSQL.

**No NEEDS CLARIFICATION remaining**; proceed to Phase 1 (design).
