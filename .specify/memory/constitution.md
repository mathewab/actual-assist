# Actual Assist Constitution
<!--
Sync Impact Report
- Version: N/A -> 1.0.0
- Modified Principles: initialized P1-P10 (code quality; zero duplication; testability gate; explicitness; separation of concerns; dependency discipline; predictable error handling; continuous refactoring; minimalism; reviewability and consistency)
- Added Sections: Additional Constraints; Development Workflow & Quality Gates; Governance
- Removed Sections: None
- Templates requiring updates: ✅ .specify/templates/plan-template.md; ⚠ .specify/templates/commands (directory absent)
- Follow-up TODOs: None
-->

## Core Principles

### P1. Code Quality Is Non-Negotiable
Design must be modular, loosely coupled, and owned by clear maintainers. Every module requires defined responsibilities, explicit boundaries, and documented invariants. Long-term technical debt created by shortcuts is not permitted.

### P2. Zero Duplication
Business logic and rules exist in a single authoritative place. Any repetition introduced is treated as immediate technical debt to be removed before merge. Shared logic must be extracted into composable modules with owners.

### P3. Testability as a Hard Gate
No behavior is merged unless it can be meaningfully tested in isolation. Red-green-refactor is expected; flakey or un-assertive tests are rejected. Designs that cannot be unit-tested must be refactored or simplified before implementation proceeds.

### P4. Explicitness Over Cleverness
Favor clarity, explicit contracts, and obvious control flow. Hidden mutation, reflection-based magic, and non-obvious side effects are disallowed. Public APIs must declare inputs, outputs, and failure modes explicitly.

### P5. Strong Separation of Concerns
Domain logic, orchestration, and infrastructure must remain clearly separated. Domain code cannot depend on transport or persistence details; adapters isolate frameworks. Cross-cutting concerns (logging, metrics, auth) must be implemented through well-defined boundaries.

### P6. Dependency Discipline
Introduce the fewest dependencies possible. Each dependency needs justification, version pinning, and an exit strategy (replacement or removal path). Unreviewed transitive risks (license, security, size) block adoption.

### P7. Predictable Error Handling
Errors are part of the API contract. Failures must be intentional, typed or coded, and meaningful for callers. All external boundaries normalize errors; no silent swallowing. Logging must preserve actionable context without leaking secrets.

### P8. Continuous Refactoring
Refactoring is mandatory and ongoing. Every change must leave code healthier—clearer structure, smaller surface area, and reduced complexity. Deferred cleanup requires a tracked owner and timeline.

### P9. Minimalism
Avoid speculative abstractions and over-engineering. Complexity is earned only by real requirements and measured impact. Prefer straightforward implementations with clear extension seams.

### P10. Reviewability and Consistency
Code must be easy to review, read, and reason about. Follow consistent patterns, naming, and directory structures. Changes must include clear diffs, rationale, and usage examples when applicable.

## Additional Constraints

- Stack: Node.js (current LTS) with TypeScript preferred for type safety; ECMAScript modules unless compatibility requires CJS. Package manager must be consistent per repository (e.g., npm or pnpm) with lockfile committed.
- Structure: Source code lives under `src/`; tests mirror structure under `tests/` with `unit`, `integration`, and `contract` layers. Shared domain libraries live in `src/domain`; infrastructure adapters reside in `src/infra`.
- Observability: Structured logging is required at boundaries; metrics for latency and error rates must be instrumented for critical paths. No ad-hoc `console.log` in committed code.
- Security: Secrets never committed; environment configuration managed via `.env.example` with schema validation at startup. Dependencies must pass vulnerability scanning before release.
- Performance: Baseline SLAs must be defined per feature (through specs); regressions require either mitigation or explicit acceptance by maintainers before merge.

## Development Workflow & Quality Gates

- Phase 0/1 design must document module boundaries, ownership, and why duplication is avoided (P1, P2, P5).
- Every proposed feature includes isolated test strategy and failure modes before implementation (P3, P7).
- Design must demonstrate explicit contracts and straightforward control flow; cleverness requires written justification (P4, P9).
- Dependency additions include justification, license review, size impact, and exit strategy recorded in the plan (P6).
- Error handling plans document error taxonomy, propagation, and logging/redaction rules (P7).
- Code reviews enforce refactoring opportunities and consistency; no merge without identified cleanup addressed or ticketed with owner and date (P8, P10).
- CI must run lint, type checks, and full tests; failing or flaky checks block merge. Coverage expectations are per-module but must cover business rules and error paths.

## Governance

- This constitution supersedes other practice docs when conflicts arise. Any exception requires a written, time-bounded waiver approved by maintainers.
- Amendments require: (1) written proposal referencing affected principles, (2) maintainer approval, (3) version bump per semantic rules, and (4) update of dependent templates/guides.
- Compliance reviews occur at plan and PR stages. Every PR must link to applicable principles and show how tests and error handling satisfy them.
- Versioning: MAJOR for breaking governance changes or principle removals; MINOR for new principles or materially expanded guidance; PATCH for clarifications or non-semantic edits.
- All guidance documents and templates must be updated in the same change when principles or gates shift. Missing templates must be created or explicitly waived.

**Version**: 1.0.0 | **Ratified**: 2025-12-21 | **Last Amended**: 2025-12-21
