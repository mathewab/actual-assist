# Data Model: Single App Refactor

**Feature**: /home/ashish/projects/actual-assist/specs/002-single-app-refactor/spec.md  
**Date**: 2025-12-24

## Entities

### DeploymentPackage

Represents the single deliverable used to release the application.

**Fields**:
- `id`: Unique identifier for the release package.
- `version`: Human-readable version label.
- `buildTimestamp`: Time the package was produced.
- `checksum`: Integrity checksum for verification.
- `includedArtifacts`: List of included components (UI bundle, server runtime).

**Validation Rules**:
- `version` must be non-empty and match release naming conventions.
- `checksum` must be present for any published package.

### RuntimeConfiguration

Represents the unified configuration applied at deploy time.

**Fields**:
- `environment`: Environment name (dev, staging, prod).
- `baseUrl`: Base URL used to serve both UI and API.
- `requiredSecrets`: Required secret keys for external integrations.
- `optionalSettings`: Optional feature flags or tuning parameters.

**Validation Rules**:
- `baseUrl` must be a valid URL.
- `requiredSecrets` must include all mandatory integrations before startup.

## Relationships

- A `DeploymentPackage` is deployed with exactly one `RuntimeConfiguration` per environment.
