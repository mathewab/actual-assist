# Feature Specification: Actual Budget Assistant

**Feature Branch**: `001-actual-assist-app`  
**Created**: 2025-12-21  
**Status**: Draft  
**Input**: User description: "Create an assistant for Actual Budget that offers AI-driven categorization, payee merge suggestions, new category prompts, and AI-generated reports. The app must never write directly; users review/apply suggestions, then sync to the Actual budget file via /sync. Provide UI for review/apply, Dockerfile, and Helm chart for home-ops deployment."

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Review and Apply AI Suggestions (Priority: P1)

Users review AI-generated categorization and payee-merge suggestions from their latest budget snapshot, approve or decline each item, and apply only selected changes before syncing back to the Actual budget file.

**Why this priority**: Delivers core value (AI-assisted hygiene) while enforcing the "no direct writes" principle; without this, the assistant is unusable.

**Independent Test**: Import a budget snapshot, generate suggestions, approve a subset, apply changes locally, and verify the resulting sync plan matches only approved items with no unintended writes.

**Acceptance Scenarios**:

1. **Given** a downloaded budget file and generated suggestions, **When** the user approves selected suggestions, **Then** the app stages only approved changes and shows a diff before applying.
2. **Given** staged changes, **When** the user confirms apply, **Then** the app updates the local budget copy and queues a sync request without auto-submitting any unapproved changes.

---

### User Story 2 - Curate New Category Suggestions (Priority: P2)

Users receive AI-proposed new categories (e.g., emerging spend patterns) with suggested parent grouping and sample transactions, then choose to create or dismiss each category and map affected transactions before syncing.

**Why this priority**: Prevents category sprawl while enabling smarter organization; complements P1 by addressing gaps instead of only fixing existing labels.

**Independent Test**: Present proposed categories with example transactions, accept one proposal, ensure it is added locally and mapped to relevant transactions, and verify the sync plan contains the new category plus mappings only when approved.

**Acceptance Scenarios**:

1. **Given** AI-proposed categories, **When** the user accepts one and assigns it a parent, **Then** the category is created locally and linked to recommended transactions with a preview diff.
2. **Given** proposed categories, **When** the user dismisses or defers them, **Then** no category or mapping changes are staged.

---

### User Story 3 - AI-Generated Budget Report (Priority: P3)

Users request an AI-generated report (MCP-based) summarizing trends, anomalies, and suggested actions, based on the current local budget snapshot, with no writes performed.

**Why this priority**: Provides insight and justification for applied changes; lower priority because it depends on reliable data hygiene from P1/P2.

**Independent Test**: Trigger report generation on a local snapshot, receive narrative and highlights (top deltas, anomalies, recommendations), and verify no budget modifications occur.

**Acceptance Scenarios**:

1. **Given** a valid local budget snapshot, **When** the user requests a report, **Then** the app returns a summary with trends, anomalies, and recommended actions within the stated response time and without mutating the file.
2. **Given** the report output, **When** the user saves or exports it, **Then** the action produces an artifact (e.g., file or copyable text) without altering budget data.

---

### Edge Cases

- AI service unavailable or times out: suggestions/report generation must fail gracefully and surface actionable errors without blocking manual workflows.
- Budget file out of date vs. server: rely on Actual sync signals to detect drift, surface a warning, and require the user to explicitly trigger a re-download/refresh before applying suggestions; no automatic replacement.
- Conflicting suggestions (e.g., two categories for one transaction) or duplicate payee merges: user must resolve explicitly before apply.
- Large budgets (file size/high transaction volume): generation and diff views must remain responsive and paginated.
- User runs in read-only mode (no sync credentials): allow preview and export of suggestions/report without write attempts.
- Sync failure mid-apply: ensure local state remains consistent and can retry safely without duplicate writes; surface any sync error and suggest a user-initiated re-download only when it may resolve drift.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Import the full Actual budget file once to a local workspace and rely on Actual's bidirectional sync state to surface drift warnings; do not auto-block local edits, but pause sync until the user chooses to reconcile (e.g., explicit re-download) after a drift/sync warning.
- **FR-002**: Generate AI-driven categorization suggestions with confidence scores and per-transaction previews; do not auto-apply.
- **FR-003**: Generate payee merge suggestions with before/after examples and potential collisions flagged; require explicit approval per merge.
- **FR-004**: Present all suggestions in a review UI that supports approve, reject, defer, and bulk actions while showing diffs of proposed changes.
- **FR-005**: Apply only approved suggestions to the local budget copy, logging each applied change with actor, timestamp, and source suggestion.
- **FR-006**: Create and manage AI-proposed new categories with suggested parent grouping and sample transactions; creation requires explicit user confirmation.
- **FR-007**: Build a sync plan from applied changes and execute sync to the Actual server only after user confirmation; surface a dry-run preview before submit.
- **FR-008**: Provide an AI-generated report (MCP-based) summarizing trends, anomalies, and recommended actions without mutating budget data.
- **FR-009**: Support read-only mode where suggestions/reports can be generated and exported without sync credentials.
- **FR-010**: Persist an audit log of suggestions generated, actions taken (approve/reject/defer), and sync outcomes for traceability.
- **FR-011**: Handle transient failures (AI, file IO, sync) with retry/backoff and clear user-facing errors; never leave the budget in a partial-applied state.
- **FR-012**: Deliver deployment artifacts: a Dockerfile and a Helm chart suitable for home-ops installation, each configurable for API keys, Actual server endpoint, and storage paths.

### Key Entities *(include if feature involves data)*

- **BudgetSnapshot**: Single active immutable view of the initially downloaded budget file with minimal metadata (source endpoint and optional sync version/token); replacement occurs only when the user explicitly re-downloads following drift/sync warnings.
- **Suggestion**: Proposed change (categorization, payee merge, category creation) with scope, confidence, rationale, and diff preview.
- **PayeeMergeCandidate**: Structured proposal to consolidate payees with collision warnings and impacted transactions.
- **CategoryProposal**: Suggested new category with proposed parent, example transactions, and mapping list.
- **ReportRequest/ReportOutput**: Inputs and generated narrative (trends, anomalies, recommendations) tied to a snapshot ID.
- **SyncPlan**: Ordered set of approved changes ready for submission, including dry-run summary and expected outcomes.
- **AuditEntry**: Record of suggestion generation, user decisions, apply actions, and sync results for traceability.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of budget mutations occur only after explicit user apply and sync confirmation; zero direct writes without approval in audits.
- **SC-002**: A reviewer can process (approve/reject/defer) at least 20 suggestions within 5 minutes while maintaining UI responsiveness on a representative budget.
- **SC-003**: 95% of sync attempts for approved changes succeed on first try; failures surface actionable errors and leave the budget in a consistent state.
- **SC-004**: At least 90% of AI suggestions (categories and payee merges) include confidence scores and human-readable rationale in the review UI.
- **SC-005**: AI-generated report is delivered within 60 seconds for a standard monthly budget snapshot and can be exported without modifying data.
- **SC-006**: A fresh installation via provided Dockerfile or Helm chart reaches a functional UI (able to import a budget snapshot and generate suggestions) in under 30 minutes following documented steps.

## Clarifications

### Session 2025-12-21

- Q: How should budget snapshots be managed? → A: Single initial download; re-download only when the user explicitly requests after drift/sync warnings.
- Q: How should drift vs. sync be handled with Actual's bidirectional sync? → A: Rely on Actual sync signals (no timestamp/hash tracking), surface drift warnings, keep local edits intact, and pause sync until the user chooses a reconcile action (e.g., explicit re-download).
