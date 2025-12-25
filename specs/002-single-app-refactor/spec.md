# Feature Specification: Single App Refactor

**Feature Branch**: `002-single-app-refactor`  
**Created**: 2025-12-24  
**Status**: Draft  
**Input**: User description: "Refactor to a single app (i.e no frontend backend) for simplicity of deployment etc."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single Deployment (Priority: P1)

As an operator, I want a single deployable application so I can release updates without coordinating separate frontend and backend steps.

**Why this priority**: Deployment simplicity is the main business value of the request and unlocks faster releases.

**Independent Test**: Can be fully tested by deploying one release package and verifying that both the user interface and API are available from the same base URL.

**Acceptance Scenarios**:

1. **Given** a target environment with the required configuration, **When** a single release package is deployed, **Then** the user interface loads and API requests succeed from the same base URL.
2. **Given** a previously deployed version, **When** a new single release package is deployed, **Then** no separate frontend or backend deployment steps are required.

---

### User Story 2 - Preserve User Experience (Priority: P2)

As an end user, I want the application to behave the same after the refactor so I can complete tasks without new steps or surprises.

**Why this priority**: Maintaining user experience prevents regressions and support burden.

**Independent Test**: Can be fully tested by running a regression pass of core user flows against the single app without any separate service setup.

**Acceptance Scenarios**:

1. **Given** a user account, **When** the user completes primary tasks in the app, **Then** all tasks succeed with the same steps and outcomes as before.
2. **Given** existing bookmarked entry points, **When** the user visits them, **Then** they continue to load correctly or redirect to the current equivalent.

---

### User Story 3 - Local Run Simplicity (Priority: P3)

As a developer, I want to run the entire app locally as one unit so I can test changes without managing separate services.

**Why this priority**: Simplifies development and reduces setup time.

**Independent Test**: Can be fully tested by starting the app once and confirming both UI and API availability locally.

**Acceptance Scenarios**:

1. **Given** a clean local environment, **When** the developer starts the app, **Then** the UI and API are available without starting separate services.

---

### Edge Cases

- What happens when required configuration for the combined app is missing or invalid?
- How does the system handle large API requests while also serving the UI from the same app?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST be deployable as a single application unit that serves both the user interface and API.
- **FR-002**: The system MUST allow operators to configure the single app with one unified set of deployment settings.
- **FR-003**: The system MUST preserve existing user-facing functionality and flows after the refactor.
- **FR-004**: The system MUST keep existing entry points functional or provide clear redirects to updated locations.
- **FR-005**: The system MUST provide a single, consistent way for operators to verify app availability.

### Key Entities *(include if feature involves data)*

- **Deployment Package**: The single deliverable used to release a new version of the app.
- **Runtime Configuration**: The set of deployment settings applied to the single app in each environment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operators can complete a production deployment using one release package and one configuration set.
- **SC-002**: At least 95% of core user flows pass regression checks with no change in required user steps.
- **SC-003**: A local run of the app can be started in under 5 minutes by a developer following documented steps.
- **SC-004**: Rollback to a previous version can be completed in under 5 minutes using the same single-app process.

## Assumptions

- The refactor does not change authentication or authorization behavior for users.
- Existing public entry points should remain valid, with redirects used where necessary.
- Deployment environments already support running a single application process.
