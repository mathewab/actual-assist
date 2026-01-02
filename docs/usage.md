# Actual Assist Usage

This guide summarizes the main workflows exposed in the UI.

## Getting Started

- On startup, the server connects to the Actual Budget server using `ACTUAL_SERVER_URL`, `ACTUAL_PASSWORD`, and `ACTUAL_BUDGET_ID` (or `ACTUAL_SYNC_ID`).
- The UI auto-selects the first budget returned by the Actual API.
- The app runs at `http://localhost:3000` by default.

## Category Suggestions

1. Open **Category suggestions** from the Tools menu.
2. Click **Generate suggestions** to start an AI analysis job.
3. Review suggestions grouped by payee. Each suggestion includes confidence and rationale.
4. Approve, reject, or correct suggestions in bulk.
5. Navigate to **Apply Changes** to select approved suggestions and apply them.

## Duplicate Payee Suggestions

1. Open **Duplicate payee suggestions** from the Tools menu.
2. Click **Generate** to build duplicate clusters (fuzzy matching + optional AI refinement).
3. Choose a target payee and merge the suggested duplicates.
4. Hide/unhide clusters to manage noisy results.
5. Configure merge thresholds in **Settings**.

## Budget Template Studio

- Open **Budget Template Studio** to inspect category template notes.
- Preview template rendering and edit notes inline.
- Apply changes safely; the server runs a preflight check and rolls back invalid templates.
