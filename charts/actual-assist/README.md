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
