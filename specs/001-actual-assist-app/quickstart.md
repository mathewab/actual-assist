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

Response includes `snapshotId` for next steps.

### Step 2: Generate Suggestions

In UI: Click "Generate Suggestions"

Or via API:

```bash
curl -X POST http://localhost:3000/api/suggestions/generate \
  -H "Content-Type: application/json" \
  -d '{
    "snapshotId": "abc123-uuid-from-step1",
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
  -d '{"snapshotId": "abc123-uuid"}'
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
SNAPSHOT=$(curl -s -X POST http://localhost:3000/api/budget/download \
  -H "Content-Type: application/json" \
  -d '{"serverURL": "...", "password": "...", "budgetId": "..."}' \
  | jq -r '.id')

# Generate suggestions
curl -X POST http://localhost:3000/api/suggestions/generate \
  -H "Content-Type: application/json" \
  -d "{\"snapshotId\": \"$SNAPSHOT\", \"maxSuggestions\": 10}"

# Approve first suggestion (get ID from UI or list endpoint)
curl -X PATCH http://localhost:3000/api/suggestions/{suggestionId} \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'

# Build sync plan
PLAN=$(curl -s -X POST http://localhost:3000/api/sync-plan/build \
  -H "Content-Type: application/json" \
  -d "{\"snapshotId\": \"$SNAPSHOT\"}" \
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
  -d '{"snapshotId": "..."}'

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
- Check `snapshotId` is correct UUID
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
