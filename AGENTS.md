# actual-assist Development Guidelines

Last updated: 2026-01-02

## Project Summary
Single-app Actual Budget assistant (Express API + React UI) with AI-driven category/payee suggestions, duplicate payee merge tooling, and budget template management.

## Active Technologies
- Node.js 24.x, TypeScript 5.x (ES modules)
- Express 5, React 19, Vite 7, TanStack Query, MUI + Tailwind
- @actual-app/api, OpenAI SDK (Responses API), zod, winston
- SQLite via better-sqlite3 with knex migrations

## Project Structure

```text
docs/
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

Node.js 24.x with TypeScript 5.x (ES modules): Follow standard conventions.

## Documentation
- Follow [`.specify/memory/constitution.md`](.specify/memory/constitution.md) for engineering principles and documentation guidance.

## Product Expectations
- Jobs and audit coverage are required for all features (ensure job tracking and audit logging remain supported across workflows).
