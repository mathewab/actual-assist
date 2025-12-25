# Research Findings: Single App Refactor

**Date**: 2025-12-24  
**Feature**: /home/ashish/projects/actual-assist/specs/002-single-app-refactor/spec.md

## Decision 1: Serve UI and API from a single Node.js runtime

**Decision**: Use one Node.js process to serve API routes and the compiled UI assets from the same base URL.  
**Rationale**: A single runtime eliminates the dual-service deployment and ensures one release artifact.  
**Alternatives considered**: Keep separate frontend service with reverse proxy; run frontend as static hosting alongside a backend container.

## Decision 2: Single build artifact via multi-stage container build

**Decision**: Build UI and server in a multi-stage container build and ship one runtime image.  
**Rationale**: Guarantees the deployed artifact includes both UI and API without needing runtime builds.  
**Alternatives considered**: Build artifacts in CI and copy into runtime image; build UI at startup.

## Decision 3: Deployment configuration unified under one service

**Decision**: Replace multi-service docker-compose and Helm charts with a single service/deployment definition.  
**Rationale**: Aligns with the single-app requirement and reduces configuration drift.  
**Alternatives considered**: Keep separate frontend/backend services but deploy via a composite chart.

## Decision 4: CI workflows run unified build/test

**Decision**: GitHub Actions workflows will run unified build and test steps for the single app and publish one container image.  
**Rationale**: Prevents divergence between UI and API pipelines and reflects the single artifact.  
**Alternatives considered**: Maintain parallel frontend/backend jobs and merge artifacts later.

## Decision 5: Performance and scale baselines

**Decision**: Target UI initial load <= 2s on broadband, core API responses <= 1s for typical payloads, and 100 concurrent users on a single instance.  
**Rationale**: Matches expected self-hosted usage while keeping SLAs explicit per constitution requirements.  
**Alternatives considered**: Higher concurrency targets (500+ users) or looser UI performance thresholds.
