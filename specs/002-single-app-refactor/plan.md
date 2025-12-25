# Implementation Plan: Single App Refactor

**Branch**: `002-single-app-refactor` | **Date**: 2025-12-24 | **Spec**: /home/ashish/projects/actual-assist/specs/002-single-app-refactor/spec.md  
**Input**: Feature specification from `/specs/002-single-app-refactor/spec.md`

## Summary

Refactor the application into a single deployable unit that serves both UI and API from one base URL. Merge frontend/backend folders into a unified source layout, keep existing behavior and routes, and update deployment artifacts (Dockerfile, docker-compose, Helm charts, GitHub workflows, and related scripts) to match the single-app packaging.

## Technical Context

**Language/Version**: Node.js 20.x with TypeScript 5.x (ES modules)  
**Primary Dependencies**: Express.js, React 18, Vite, TanStack Query, @actual-app/api, OpenAI SDK, better-sqlite3, zod, winston  
**Storage**: SQLite file database for audit log  
**Testing**: Vitest (unit/integration), Playwright (E2E)  
**Target Platform**: Linux containers and local developer machines  
**Project Type**: Web application (single deployable app)  
**Performance Goals**: UI initial load <= 2s on broadband; core API actions respond <= 1s for typical payloads; support 100 concurrent users on a single instance  
**Constraints**: Single release artifact; UI and API share one base URL; no breaking changes to API routes; deploy/rollback <= 5 minutes; environment configuration centralized  
**Scale/Scope**: Self-hosted single instance; <= 100 concurrent users; <= 100k transactions per budget

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Modular design with explicit ownership; no feature proceeds without defined module boundaries and owners (P1, P5, P10).
- Zero duplication of business rules; shared logic extracted to a single authoritative module (P2).
- Testability proven up front: isolated unit test strategy and coverage of error paths documented before build (P3, P7).
- Contracts and control flow are explicit; reject hidden side effects or cleverness without justification (P4).
- Dependencies justified with license/size review and exit strategy recorded; avoid unnecessary additions (P6).
- Error handling plan defines taxonomy, propagation, and logging/redaction rules; failures are intentional and observable (P7).
- Refactoring commitments captured to ensure the codebase is left healthier; speculative abstractions rejected (P8, P9).
- Reviewability standards met: consistent patterns, directory layout, and clear rationale included in plan (P10).

Pre-Phase 0 Status: Pass  
Post-Phase 1 Status: Pass

## Project Structure

### Documentation (this feature)

```text
specs/002-single-app-refactor/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
src/
├── api/
├── domain/
├── services/
├── infra/
├── ui/
│   ├── components/
│   ├── pages/
│   └── services/
└── server.ts

tests/
├── contract/
├── e2e/
├── integration/
└── unit/
```

**Structure Decision**: Consolidate backend and frontend into a single `src/` tree, with `ui/` hosting client code and `api/domain/services/infra` retaining server responsibilities. Tests move into a unified `tests/` structure to satisfy the constitution.

## Design Notes

**Module boundaries**: `domain/` for business entities and errors, `services/` for orchestration, `infra/` for external adapters, `api/` for HTTP routes, `ui/` for user interface.  
**Duplication avoidance**: Shared request/response shapes live in `domain/` and are reused by API handlers and UI API clients.  
**Test strategy**: Unit tests for domain/services, integration tests for API routes and infra adapters, contract tests for API responses, E2E tests for core UI flows.  
**Error handling**: Domain errors mapped to HTTP responses in `api/`; UI presents user-friendly messages; structured logging at HTTP and external adapter boundaries with redaction.  
**Deployment artifacts**: A single build pipeline produces one release artifact; Dockerfile, docker-compose, Helm chart, and GitHub workflows align to the single-app build and run commands.

## Complexity Tracking

No constitutional violations identified for this plan.
