# Quickstart: Jobs Workflow

## Prerequisites

- App is configured and running locally.
- A valid `budgetId` is available.

## Create and Track a Sync Job

1. Create job:
   ```bash
   curl -X POST http://localhost:3000/api/jobs/budget-sync \
     -H 'Content-Type: application/json' \
     -d '{"budgetId":"<BUDGET_ID>"}'
   ```
2. Poll status:
   ```bash
   curl "http://localhost:3000/api/jobs?budgetId=<BUDGET_ID>"
   ```

## Create and Track Suggestions Generation

1. Create job:
   ```bash
   curl -X POST http://localhost:3000/api/jobs/suggestions-generate \
     -H 'Content-Type: application/json' \
     -d '{"budgetId":"<BUDGET_ID>"}'
   ```
2. Fetch details:
   ```bash
   curl "http://localhost:3000/api/jobs/<JOB_ID>"
   ```

## Combined Sync + Generate

1. Create combined job:
   ```bash
   curl -X POST http://localhost:3000/api/jobs/sync-and-suggest \
     -H 'Content-Type: application/json' \
     -d '{"budgetId":"<BUDGET_ID>","fullResync":false}'
   ```
2. Fetch details and steps:
   ```bash
   curl "http://localhost:3000/api/jobs/<JOB_ID>"
   ```

## Retry Suggestions for a Payee Group

1. Create job:
   ```bash
   curl -X POST http://localhost:3000/api/jobs/suggestions-retry \
     -H 'Content-Type: application/json' \
     -d '{"budgetId":"<BUDGET_ID>","suggestionId":"<SUGGESTION_ID>"}'
   ```
2. Poll status:
   ```bash
   curl "http://localhost:3000/api/jobs?budgetId=<BUDGET_ID>&type=suggestions_retry_payee"
   ```

## Apply Approved Suggestions

1. Create job:
   ```bash
   curl -X POST http://localhost:3000/api/jobs/suggestions-apply \
     -H 'Content-Type: application/json' \
     -d '{"budgetId":"<BUDGET_ID>","suggestionIds":["<SUGGESTION_ID>"]}'
   ```
2. Fetch details:
   ```bash
   curl "http://localhost:3000/api/jobs/<JOB_ID>"
   ```

## Create or Redownload Snapshot

1. Create snapshot job:
   ```bash
   curl -X POST http://localhost:3000/api/jobs/snapshot-create \
     -H 'Content-Type: application/json' \
     -d '{"budgetId":"<BUDGET_ID>"}'
   ```
2. Redownload snapshot job:
   ```bash
   curl -X POST http://localhost:3000/api/jobs/snapshot-redownload \
     -H 'Content-Type: application/json' \
     -d '{"budgetId":"<BUDGET_ID>"}'
   ```
