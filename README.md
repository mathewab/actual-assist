# Actual Budget Assistant

AI-powered assistant for [Actual Budget](https://actualbudget.com/).

## Features

- **Category suggestions**: AI category + payee suggestions with review, correction, and apply-in-place
- **Duplicate payee suggestions**: Fuzzy matching + optional AI refinement, with merge controls
- **Budget Template Studio**: Template previews and safe apply checks for category notes

## Architecture

**Constitution-Driven Development**: This project follows the engineering principles documented in [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

**Tech Stack**:
- **App**: Node.js 24, TypeScript 5 (ES modules), Express 5, React 19, Vite 7, TanStack Query, MUI + Tailwind
- **AI**: OpenAI SDK (Responses API, default model `gpt-4o-mini`)
- **Storage**: SQLite via better-sqlite3 with knex migrations
- **Ops**: node-cron scheduling, winston logging, express-rate-limit
- **Deployment**: Docker, docker-compose (Helm chart under `charts/actual-assist`)

**Runtime shape**: a single server that mounts the Express API and serves the React UI. In development, Vite runs in middleware mode; in production, the built UI is served statically.

## Quick Start

### Prerequisites

- Node.js >= 24.0.0
- npm >= 10.0.0
- Actual Budget server URL and credentials
- OpenAI API key

### Development Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd actual-assist
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Run in development mode**:
   ```bash
   npm run dev
   ```

   This starts the single app at `http://localhost:3000` (UI + API).

5. **Optional: run UI only** (requires API running separately):
   ```bash
   npm run dev:ui
   ```
   Set `VITE_API_BASE_URL` (for example `http://localhost:3000/api`) if the API is not served from the same origin.

### Docker Deployment

1. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. **Build and start containers**:
   ```bash
   npm run docker:up
   ```

3. **Access the application**:
   - UI + API: `http://localhost:3000`
   - Health: `http://localhost:3000/health`
   - Readiness: `http://localhost:3000/ready`

4. **View logs**:
   ```bash
   npm run docker:logs
   ```

5. **Stop containers**:
   ```bash
   npm run docker:down
   ```

## Usage Workflow

1. **Category suggestions**: Generate suggestions, review/correct, and apply changes.
2. **Duplicate payee suggestions**: Generate duplicate clusters, hide noise, and merge cleanly.
3. **Template Studio**: Review template notes, preview rendering, and apply safely.

See `docs/usage.md` for a UI-focused walkthrough.

## Project Structure

```
actual-assist/
├── docs/                # User docs
├── src/
│   ├── api/              # HTTP routes
│   ├── domain/           # Business entities and errors
│   ├── services/         # Business logic
│   ├── infra/            # External adapters (DB, APIs)
│   ├── ui/               # React UI (components, pages, services)
│   └── server.ts         # Single app entry point
├── tests/
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # Playwright E2E tests
```

## Configuration

### Environment Variables

Required variables (see `.env.example`):
- `ACTUAL_SERVER_URL`: Actual Budget server URL
- `ACTUAL_PASSWORD`: Actual Budget password
- `ACTUAL_BUDGET_ID`: Budget file ID (UUID)
- `OPENAI_API_KEY`: OpenAI API key (starts with `sk-`)

Optional (defaults are enforced by `src/infra/env.ts`):
- `ACTUAL_SYNC_ID`: Sync ID for cloud-synced budgets
- `ACTUAL_ENCRYPTION_KEY`: Budget encryption key
- `OPENAI_MODEL`: OpenAI model name (default: `gpt-4o-mini`)
- `DATA_DIR`: Local data directory (default: `./data`)
- `SQLITE_DB_PATH`: SQLite database path (default: `./data/audit.db`)
- `PORT`: Server port (default: `3000`)
- `NODE_ENV`: `development` | `production` | `test`
- `LOG_LEVEL`: `error` | `warn` | `info` | `debug`
- `LOG_FILE`: Optional log file path
- `SYNC_INTERVAL_MINUTES`: Interval for scheduled sync+suggest jobs (default: `360`)
- `JOB_TIMEOUT_MINUTES`: Minutes before a job is marked failed (default: `60`)
- `JOB_TIMEOUT_CHECK_INTERVAL_MINUTES`: How often to scan for timed-out jobs (default: `5`)
- `RATE_LIMIT_WINDOW_MS`: API rate limit window (default: `60000`)
- `RATE_LIMIT_MAX_REQUESTS`: API rate limit max requests per window (default: `120`)
- `VITE_API_BASE_URL`: API base URL (defaults to `/api`)

## License

MIT
