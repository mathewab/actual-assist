# Quickstart: Single App Refactor

**Feature**: /home/ashish/projects/actual-assist/specs/002-single-app-refactor/spec.md  
**Date**: 2025-12-24

## Prerequisites

- Node.js 20+
- npm 10+
- Docker (for containerized deployment)
- Actual Budget server URL and credentials
- OpenAI API key

## Local Development

1. Install dependencies from the repository root:
   ```bash
   npm install
   ```

2. Configure environment variables:
   - Copy the unified example environment file to `.env` at the repository root.
   - Fill in Actual Budget and OpenAI credentials.
   - Optionally set `VITE_API_BASE_URL` if you need a non-default API path.

3. Start the single app in development mode:
   ```bash
   npm run dev
   ```

4. Access the app:
   - UI and API are available from the same base URL (e.g., `http://localhost:3000`).

## Production Build

1. Build the single app:
   ```bash
   npm run build
   ```

2. Start the app:
   ```bash
   npm run start
   ```

## Containerized Deployment

1. Build the container image:
   ```bash
   npm run docker:build
   ```

2. Start the container:
   ```bash
   npm run docker:up
   ```

3. Confirm availability:
   - The UI loads in a browser.
   - The API responds from the same base URL.
