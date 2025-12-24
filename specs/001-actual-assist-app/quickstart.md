# Quickstart: Actual Budget Assistant POC

**Date**: 2025-12-21  
**Feature**: [spec.md](spec.md) | [plan.md](plan.md)

## Prerequisites

- Node.js v20 LTS or later
- npm or pnpm
- Access to a running Actual Budget server (local or remote)
- OpenAI API key

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/mathewab/actual-assist.git
cd actual-assist
git checkout 001-actual-assist-app

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

Create `backend/.env`:

```env
# Actual Budget server connection
ACTUAL_SERVER_URL=http://localhost:5006
ACTUAL_PASSWORD=your-server-password
ACTUAL_BUDGET_ID=your-budget-sync-id

# Find ACTUAL_BUDGET_ID in Actual:
# Settings → Show advanced settings → Sync ID

# OpenAI API key (get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-...

# Local data storage
DATA_DIR=./data
SQLITE_DB_PATH=./data/assistant.db

# Server config
PORT=3000
NODE_ENV=development
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

### 3. Initialize Database

```bash
cd backend
npm run db:init  # Creates SQLite schema (see research.md)
```

## Running the POC

### Start Backend Server

```bash
cd backend
npm run dev
# Server runs on http://localhost:3000
```

### Start Frontend UI

```bash
cd frontend
npm run dev
# UI runs on http://localhost:5173
```

## Usage Workflow

### Step 1: Download Budget

1. Open http://localhost:5173 in browser
2. Click "Download Budget" or use API:

```bash
curl -X POST http://localhost:3000/api/budget/download \
  -H "Content-Type: application/json" \
  -d '{
    "serverURL": "http://localhost:5006",
    "password": "your-password",
    "budgetId": "your-budget-id"
  }'
```

Response includes `budgetId` for next steps.

### Step 2: Generate Suggestions

In UI: Click "Generate Suggestions"

Or via API:

```bash
curl -X POST http://localhost:3000/api/suggestions/generate \
  -H "Content-Type: application/json" \
  -d '{
    "budgetId": "1cfdbb80-6274-49bf-b0c2-737235a4c81f",
    "maxSuggestions": 50
  }'
```

Wait 2-3 seconds for AI processing.

### Step 3: Review and Approve

In UI:
- Each suggestion shows:
  - Transaction details (payee, amount, date)
  - Current category (if any)
  - Proposed category with confidence score
  - AI rationale
- Click ✓ to approve or ✗ to reject
- Use "Approve All >80% Confidence" for bulk actions

Or via API:

```bash
# Approve single suggestion
curl -X PATCH http://localhost:3000/api/suggestions/{suggestionId} \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'

# Bulk approve
curl -X POST http://localhost:3000/api/suggestions/bulk-update \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {"suggestionId": "uuid1", "status": "approved"},
      {"suggestionId": "uuid2", "status": "rejected"}
    ]
  }'
```

### Step 4: Build Sync Plan

In UI: Click "Build Sync Plan"

Or via API:

```bash
curl -X POST http://localhost:3000/api/sync-plan/build \
  -H "Content-Type: application/json" \
  -d '{"budgetId": "1cfdbb80-6274-49bf-b0c2-737235a4c81f"}'
```

Response shows dry-run preview:
- Number of changes
- Transaction IDs affected
- Old → New category mappings

### Step 5: Execute Sync (Manual in POC)

**POC limitation**: Sync execution not implemented. To apply changes:

1. Review sync plan JSON
2. Manually apply changes in Actual Budget UI, OR
3. Use @actual-app/api directly (see research.md for pattern)

**Post-POC**: `/sync-plan/{planId}/execute` will automate this step.

## Validation

### Acceptance Scenario 1: Approve and Stage Changes

```bash
# Download budget
BUDGET_ID="1cfdbb80-6274-49bf-b0c2-737235a4c81f"
SNAPSHOT=$(curl -s -X POST http://localhost:3000/api/budget/download \
  -H "Content-Type: application/json" \
  -d '{"serverURL": "...", "password": "...", "budgetId": "..."}' \
  | jq -r '.id')

# Generate suggestions
curl -X POST http://localhost:3000/api/suggestions/generate \
  -H "Content-Type: application/json" \
  -d "{\"budgetId\": \"$BUDGET_ID\", \"maxSuggestions\": 10}"

# Approve first suggestion (get ID from UI or list endpoint)
curl -X PATCH http://localhost:3000/api/suggestions/{suggestionId} \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'

# Build sync plan
PLAN=$(curl -s -X POST http://localhost:3000/api/sync-plan/build \
  -H "Content-Type: application/json" \
  -d "{\"budgetId\": \"$BUDGET_ID\"}" \
  | jq '.')

# Verify: plan contains only approved suggestion
echo "$PLAN" | jq '.changes | length'  # Should be 1
echo "$PLAN" | jq '.changes[0].suggestionId'  # Should match approved ID
```

### Acceptance Scenario 2: No Unapproved Changes

```bash
# Reject all suggestions
curl -X POST http://localhost:3000/api/suggestions/bulk-update \
  -H "Content-Type: application/json" \
  -d '{"updates": [...]}' # All status: "rejected"

# Build sync plan
curl -X POST http://localhost:3000/api/sync-plan/build \
  -H "Content-Type: application/json" \
  -d '{"budgetId": "..."}'

# Expect: 422 Unprocessable Entity or empty changes array
```

## Troubleshooting

### "Failed to connect to Actual server"
- Verify `ACTUAL_SERVER_URL` is reachable
- Check `ACTUAL_PASSWORD` matches server password
- Ensure Actual server is running

### "OpenAI API error"
- Verify `OPENAI_API_KEY` is valid
- Check API quota/billing at https://platform.openai.com/usage
- Retry after rate limit expires (POC has no retry logic)

### "Snapshot not found"
- Ensure budget was downloaded first
- Check `budgetId` is correct
- Verify `DATA_DIR` is writable and contains budget files

## Testing

```bash
# Backend unit tests
cd backend
npm test

# Frontend integration tests (Playwright)
cd frontend
npm run test:e2e
```

## Next Steps

After validating P1 workflow:
1. Implement P2 (payee merge suggestions)
2. Implement P3 (AI reports)
3. Add sync execution endpoint
4. Create Dockerfile and Helm chart
5. Add authentication and multi-user support

---

## Updated Workflow (Session 2025-12-22): Budget Selector + Periodic Sync

### New Environment Variables

Add to `backend/.env`:

```env
# Periodic sync interval in minutes (default: 360 = 6 hours)
SYNC_INTERVAL_MINUTES=360

# Optional: log level
LOG_LEVEL=info
```

### Step 0: Budget Selection (Frontend)

1. Open http://localhost:5173
2. Frontend displays BudgetSelector component
   - Shows available budgets from GET /api/budgets
   - MVP shows single env-configured budget
3. Click on budget name to select it
4. Two action buttons appear for selected budget:
   - "↻ Sync & Generate Suggestions" (primary workflow)
   - "Force Redownload & Re-analyze" (always visible)

### Step 1: Sync & Generate (Normal Workflow)

**Button**: "Sync & Generate Suggestions"

**What happens**:
1. Frontend calls POST /api/suggestions/sync-and-generate
2. Backend:
   - Syncs with Actual server (fetches latest transactions)
   - Compares with previous snapshot (diff detection)
   - Generates suggestions only for changed/new transactions (diff-based)
   - Stores suggestions in database
3. Frontend refreshes suggestion list; new suggestions appear in Review tab

**Expected behavior**:
- Fast: ~2-5 seconds for typical budget (5-20 new transactions)
- Focused: Only suggestions for changed transactions (avoids duplicates from prior syncs)
- Periodic: Runs automatically every SYNC_INTERVAL_MINUTES (default 6 hours)
  - No user intervention needed
  - Failures retry silently with exponential backoff
  - Alert shown only if all retries exhausted

### Step 2: Force Redownload (Explicit Re-Analysis)

**Button**: "Force Redownload & Re-analyze" (always visible in BudgetSelector)

**When to use**:
- User suspects stale snapshot (manually edited budget file)
- User wants comprehensive re-evaluation of all categories
- Server-side drift detected

**What happens**:
1. Frontend calls POST /api/snapshots/redownload
2. Backend re-downloads entire budget, replaces current snapshot
3. Frontend shows success message with new transaction count
4. Next "Sync & Generate" call uses full-snapshot analysis instead of diff
   - Slower: ~10-60 seconds for typical budget (500-5000 transactions)
   - Comprehensive: Re-analyzes all transactions
   - Detects recategorization opportunities

### Periodic Sync Behavior

Backend initializes SyncScheduler on startup:

```typescript
// runs every SYNC_INTERVAL_MINUTES (e.g., 360 minutes = 6 hours)
cron.schedule(`*/${syncIntervalMinutes} * * * *`, async () => {
  try {
    const suggestions = await suggestionService.syncAndGenerateSuggestions(budgetId);
    logger.info('Periodic sync completed', { count: suggestions.length });
  } catch (error) {
    // Retry with exponential backoff: 1min, 5min, 15min
    // Alert UI only if all retries exhausted
    retryWithBackoff(error, 3);
  }
});
```

**Frontend sees new suggestions automatically**:
- Optional: Poll GET /api/suggestions/pending periodically (e.g., every 30 seconds)
- Or: Use WebSocket (future enhancement) for real-time updates
- Or: Manual refresh in UI

### Example Workflow

```bash
# 1. Budget already selected in UI

# 2. Manual sync & generate (or happens periodically)
curl -X POST http://localhost:3000/api/suggestions/sync-and-generate \
  -H "Content-Type: application/json" \
  -d '{"budgetId": "..."}'
# Response: 3 new suggestions (only changed transactions)

# 3. Review suggestions in UI
# User approves 2, rejects 1

# 4. Build sync plan
curl -X POST http://localhost:3000/api/sync/plan \
  -H "Content-Type: application/json" \
  -d '{"budgetId": "..."}'
# Response: sync plan with 2 changes

# 5. After time passes... periodic sync runs automatically
# (6 hours later or SYNC_INTERVAL_MINUTES)
# → Fetches latest transactions
# → Generates suggestions for 5 new transactions
# → User sees new suggestions in UI next time they check

# 6. User suspects stale snapshot, clicks "Force Redownload"
curl -X POST http://localhost:3000/api/snapshots/redownload \
  -H "Content-Type: application/json" \
  -d '{"budgetId": "..."}'
# Response: snapshot redownloaded

# 7. User manually triggers "Sync & Generate" again
# (or waits for next periodic sync)
curl -X POST http://localhost:3000/api/suggestions/sync-and-generate \
  -H "Content-Type: application/json" \
  -d '{"budgetId": "..."}'
# This time: full-snapshot analysis (all 500 transactions re-analyzed)
# Response: 50 suggestions (comprehensive re-evaluation)
```

### Configuration Examples

**Fast sync (3 times per day)**:
```env
SYNC_INTERVAL_MINUTES=480  # 8 hours
```

**Slow sync (once per day)**:
```env
SYNC_INTERVAL_MINUTES=1440  # 24 hours
```

**Very frequent (for testing)**:
```env
SYNC_INTERVAL_MINUTES=5  # Every 5 minutes
```

## Monitoring & Debugging

### Check sync logs

```bash
# View recent audit log
curl http://localhost:3000/api/audit\?eventType\=sync_plan_created

# View periodic sync attempts
grep "Periodic sync" backend/logs/*.log

# View failures
grep "error\|Error" backend/logs/*.log
```

### Database inspection

```bash
# SQLite CLI
sqlite3 data/assistant.db

# View suggestions table
SELECT id, transactionPayee, status, createdAt FROM suggestions LIMIT 10;

# View audit log
SELECT eventType, details, timestamp FROM audit_log ORDER BY timestamp DESC LIMIT 20;
```

## Architecture Notes

**Diff-based vs. Full-snapshot**:
- **Diff-based** (normal sync): Compares current + new snapshots, generates suggestions only for changed transactions
  - Fast (~2-5s)
  - Avoids duplicates from prior syncs
  - Triggered by: periodic sync, "Sync & Generate Suggestions" button
- **Full-snapshot** (after redownload): Analyzes entire transaction set
  - Slow (~10-60s)
  - Comprehensive re-evaluation
  - Triggered by: "Force Redownload & Re-analyze" button, then "Sync & Generate"

**Periodic Sync Retry**:
- 1st attempt: immediate
- Fail → retry after 1 minute
- Fail → retry after 5 minutes
- Fail → retry after 15 minutes
- All failed → log error, alert UI (next time user checks)

**Future Enhancements** (post-POC):
- Multi-budget UI (add budgets dynamically)
- User-configurable sync schedule (UI settings)
- WebSocket for real-time suggestion notifications
- Drift detection and automatic recovery
