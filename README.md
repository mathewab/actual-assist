# Actual Budget Assistant

AI-powered categorization assistant for [Actual Budget](https://actualbudget.com/).

## Features

- **AI Category Suggestions**: Automatically suggest categories for uncategorized transactions using GPT-4o-mini
- **Review & Approve**: Review AI suggestions before applying them to your budget
- **Sync Plan**: See exactly what changes will be made before syncing
- **Audit Log**: Track all AI suggestions and user actions

## Architecture

**Constitution-Driven Development**: This project follows strict engineering principles documented in [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

**Tech Stack**:
- **App**: Node.js 24, TypeScript 5, Express.js, React 18, Vite, TanStack Query
- **AI**: OpenAI GPT-4o-mini
- **Storage**: SQLite (audit log)
- **Deployment**: Docker, docker-compose

## Quick Start

### Prerequisites

- Node.js >= 24.0.0
- npm >= 10.0.0
- Docker & docker-compose (for containerized deployment)
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

4. **View logs**:
   ```bash
   npm run docker:logs
   ```

5. **Stop containers**:
   ```bash
   npm run docker:down
   ```

## Usage Workflow

1. **Create Snapshot**: Capture current budget state
2. **Generate Suggestions**: AI analyzes uncategorized transactions
3. **Review Suggestions**: Approve/reject each suggestion in the UI
4. **Create Sync Plan**: See what changes will be applied
5. **Execute Sync**: Apply approved suggestions to Actual Budget

See [`specs/001-actual-assist-app/quickstart.md`](specs/001-actual-assist-app/quickstart.md) for detailed usage guide.

## Project Structure

```
actual-assist/
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
└── specs/                # Feature specifications and planning
```

## Development Commands

```bash
# Run all tests
npm run test:all

# Run unit tests only
npm run test

# Run E2E tests
npm run test:e2e

# Build for production
npm run build

# Lint and format
npm run lint
npm run format
```

## Configuration

### Environment Variables

Required variables (see `.env.example`):
- `ACTUAL_SERVER_URL`: Your Actual Budget server URL
- `ACTUAL_PASSWORD`: Actual Budget password
- `ACTUAL_BUDGET_ID`: Budget file ID (UUID)
- `OPENAI_API_KEY`: OpenAI API key (starts with `sk-`)

Optional:
- `ACTUAL_SYNC_ID`: Sync ID for cloud-synced budgets
- `ACTUAL_ENCRYPTION_KEY`: Budget encryption key
- `NODE_ENV`: `development` | `production` | `test`
- `LOG_LEVEL`: `error` | `warn` | `info` | `debug`
- `JOB_TIMEOUT_MINUTES`: Minutes before a job is marked failed (default: 60)
- `JOB_TIMEOUT_CHECK_INTERVAL_MINUTES`: How often to scan for timed-out jobs (default: 5)
- `VITE_API_BASE_URL`: API base URL (defaults to `/api`)

## API Documentation

OpenAPI 3.0 specification: [`specs/001-actual-assist-app/contracts/api.yaml`](specs/001-actual-assist-app/contracts/api.yaml)

Key endpoints:
- `POST /api/snapshots` - Create budget snapshot
- `GET /api/suggestions/pending` - Get pending suggestions
- `POST /api/suggestions/:id/approve` - Approve suggestion
- `POST /api/sync/execute` - Execute sync plan

## License

MIT

## Contributing

This project follows strict engineering principles. Before contributing:
1. Read the constitution: [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
2. Review the feature spec: [`specs/001-actual-assist-app/spec.md`](specs/001-actual-assist-app/spec.md)
3. Ensure all tests pass: `npm run test:all`
4. Follow the established architecture (Domain/Service/Infra separation)

## Troubleshooting

**Database errors**: Delete `data/audit.db` and restart to reinitialize schema.

**Connection errors to Actual Budget**: Verify `ACTUAL_SERVER_URL` is reachable and credentials are correct.

**OpenAI errors**: Check API key is valid and has available quota.

**Docker networking issues**: Ensure port 3000 is not in use.

For more help, see the [quickstart guide](specs/001-actual-assist-app/quickstart.md) or open an issue.
