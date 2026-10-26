# Helm Chart for Actual Budget Assistant

## Quick Start

### Prerequisites
- Kubernetes 1.24+
- Helm 3.x
- Docker image for the app pushed to registry

### Installation

**Development deployment:**
```bash
helm install actual-assist ./helm -f helm/values-dev.yaml \
  --set secrets.openaiApiKey="sk-..." \
  --set secrets.actualServerUrl="https://..." \
  --set secrets.actualPassword="your-password"
```

**Production deployment:**
```bash
helm install actual-assist ./helm -f helm/values-prod.yaml \
  --set secrets.openaiApiKey="sk-..." \
  --set secrets.actualServerUrl="https://..." \
  --set secrets.actualPassword="your-password" \
  --set ingress.hosts[0].host="actual-assist.example.com"
```

### Configuration

**Core values:**
- `app.replicaCount`: Number of app replicas
- `ingress.enabled`: Enable ingress (recommended for prod)
- `secrets.openaiApiKey`: OpenAI API key (required)
- `secrets.actualServerUrl`: Actual Budget server URL (required)
- `secrets.actualPassword`: Actual Budget password (required)
- `secrets.actualBudgetId`: Actual Budget ID (optional, for POC)

**Storage:**
- `storage.size`: PVC size (default: 10Gi)
- `storage.className`: Storage class (optional)

**Resource limits:**
- `app.resources`: CPU/memory requests and limits

### Upgrade

```bash
helm upgrade actual-assist ./helm -f helm/values-prod.yaml
```

### Uninstall

```bash
helm uninstall actual-assist
```

## Architecture

- **App**: Express.js API + React UI in one container on port 3000
  - Handles budget sync, AI suggestions, sync plans
  - Serves UI assets from the same base URL
  - Persistent SQLite database on shared storage
  - Liveness and readiness probes configured
- **Storage**: PersistentVolumeClaim for budget data and SQLite database
- **Ingress**: Optional ingress for external access (dev: disabled, prod: enabled)

## Requirements

- OpenAI API key for suggestion generation
- Actual Budget server access and credentials
- Kubernetes cluster with available storage

See [values.yaml](values.yaml) for all configuration options.

## Single-writer deployment and restored claims

The Deployment uses `Recreate`. `app.replicaCount` accepts 1, or 0 for coordinated maintenance; other counts are rejected. Set `storage.existingClaim` to use a pre-provisioned PVC in this namespace. The original chart-owned PVC remains rendered unchanged, preserving it during upgrades; do not uninstall the release or delete the original claim during a restored-copy rollout. An external claim must have no other writer.

Set `env.scheduledSyncEnabled: false` to disable the background sync timer for a first rollout. It defaults to true. Startup still opens/migrates local databases and calls Actual `downloadBudget`, which may sync upstream; this flag does not create a read-only deployment. See [the rollout contract](../../docs/integrations.md#restored-copy-rollout-controls) for backup, approval, and original-volume retention requirements.
