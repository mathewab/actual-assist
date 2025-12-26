# Quickstart: Jobs Workflow

## Prerequisites

- App is configured and running locally.
- A valid `budgetId` is available.

## Create and Track a Sync Job

1. Create job:
   ```bash
   curl -X POST http://localhost:3000/api/jobs/sync \
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
   curl -X POST http://localhost:3000/api/jobs/suggestions \
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
   curl -X POST http://localhost:3000/api/jobs/sync-and-generate \
     -H 'Content-Type: application/json' \
     -d '{"budgetId":"<BUDGET_ID>","fullResync":false}'
   ```
2. Fetch details and steps:
   ```bash
   curl "http://localhost:3000/api/jobs/<JOB_ID>"
   ```
