# Feature Specification: Jobs Workflow

**Feature Branch**: `003-add-jobs-workflow`  
**Created**: 2025-12-26  
**Status**: Draft  
**Input**: User description: "Needs a jobs workflow. This is for sync tasks. Currently when the user manually syncs, there is no way for user to know if the sync has finished or not. A jobs based approach will be able to identify the status of each job individually. There can be different types of jobs, but two types we are focussing primarily here 1. Sync - Syncs with actual budget. 2. Suggestions Generation - Makes request to openai for sugesstions for the batch. Also there needs to be a jobs orchestrator in case some jobs need to call other jobs etc. like a sync and generate would call sync first and then generate. So the notion of a super job perhaps."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Track a manual sync (Priority: P1)

A user starts a manual sync and can see a clear status that changes from start to completion so they know when it finished and whether it succeeded.

**Why this priority**: This is the core pain point and directly affects trust in sync operations.

**Independent Test**: Can be fully tested by starting a manual sync and observing status changes through completion.

**Acceptance Scenarios**:

1. **Given** a user starts a manual sync, **When** the job is created, **Then** the user can see a new job entry with a “queued” or “running” status.
2. **Given** a sync job is running, **When** it finishes successfully, **Then** the job status shows “succeeded” and the completion time.
3. **Given** a sync job fails, **When** the failure occurs, **Then** the job status shows “failed” with a user-readable reason.

---

### User Story 2 - Generate suggestions with job status (Priority: P2)

A user requests suggestions generation and can track its progress and final outcome separately from sync jobs.

**Why this priority**: Suggestions are user-visible outputs that depend on processing time and need clear completion signals.

**Independent Test**: Can be fully tested by starting a suggestions generation job and observing status to completion.

**Acceptance Scenarios**:

1. **Given** a user starts suggestions generation, **When** the job is created, **Then** the user can see a job entry with type “Suggestions Generation.”
2. **Given** the suggestions job completes, **When** the output is ready, **Then** the job status shows “succeeded” and the user can access the generated suggestions.

---

### User Story 3 - Run a combined “sync then generate” flow (Priority: P3)

A user triggers a combined workflow that runs sync first and then suggestions generation, with visibility into each step and the overall result.

**Why this priority**: This validates job orchestration and dependency handling while still delivering user value.

**Independent Test**: Can be fully tested by starting a combined job and verifying the ordered execution and status outcomes.

**Acceptance Scenarios**:

1. **Given** a user starts a combined job, **When** it begins, **Then** the user can see the combined job and its component sync and suggestions steps.
2. **Given** the sync step completes successfully, **When** it finishes, **Then** the suggestions step starts automatically.
3. **Given** the sync step fails, **When** it fails, **Then** the suggestions step does not start and the combined job is marked “failed.”

---

### Edge Cases

- What happens when a user starts a new job while another job of the same type is already running?
- How does the system handle a job that is interrupted by a restart or connectivity loss?
- What happens when a job is requested but required inputs (e.g., batch selection) are missing?
- How does the system handle multiple dependent jobs queued at once?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST create a job record whenever a user initiates a sync or suggestions generation.
- **FR-002**: The system MUST track and expose job status with at least: queued, running, succeeded, failed, and canceled.
- **FR-003**: The system MUST show users a list of their recent jobs with type, status, start time, and completion time (if finished).
- **FR-004**: The system MUST allow users to view the latest status of any job they initiated.
- **FR-005**: The system MUST record a user-readable failure reason when a job fails.
- **FR-006**: The system MUST support a combined job that runs a sync step before a suggestions generation step.
- **FR-007**: The system MUST prevent the suggestions step from starting if the prerequisite sync step fails.
- **FR-008**: The system MUST reflect the combined job’s overall status based on the outcomes of its steps.
- **FR-009**: The system MUST ensure each job type is identifiable and filterable by users.
- **FR-010**: The system MUST preserve job status history for a defined retention period.

### Key Entities *(include if feature involves data)*

- **Job**: A unit of work initiated by a user; includes type, status, timestamps, and outcome.
- **Job Step**: A component of a combined job; includes order, type, status, and result.
- **Job History**: A record of past jobs and status transitions within the retention window.

### Assumptions

- Users only need to view jobs they initiated; shared or organization-wide job visibility is out of scope.
- Job history retention defaults to 30 days unless otherwise specified.
- Users are not required to cancel jobs in this phase; cancellation is optional and treated as a supported status when it occurs.

### Dependencies

- Existing manual sync and suggestions generation capabilities remain available and can be invoked by jobs.
- The system can associate jobs with a user identity already in use for manual actions.

### Out of Scope

- Automated scheduling of recurring jobs.
- Organization-wide or shared job visibility beyond the initiating user.
- Detailed progress percentages for long-running jobs (status-only visibility is sufficient).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of manual syncs show a visible completion status within 5 seconds of finishing.
- **SC-002**: Users can determine whether a job succeeded or failed in under 10 seconds from the jobs list view.
- **SC-003**: 90% of users who start a combined job can confirm both step outcomes without external support.
- **SC-004**: Support tickets related to “unknown sync status” decrease by 50% within 60 days of release.
