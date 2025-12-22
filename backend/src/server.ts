import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { validateEnv } from './infra/env.js';
import { createLogger, setLogger } from './infra/logger.js';
import { isAppError } from './domain/errors.js';
import { DatabaseAdapter } from './infra/DatabaseAdapter.js';
import { ActualBudgetAdapter } from './infra/ActualBudgetAdapter.js';
import { OpenAIAdapter } from './infra/OpenAIAdapter.js';
import { SuggestionRepository } from './infra/repositories/SuggestionRepository.js';
import { AuditRepository } from './infra/repositories/AuditRepository.js';
import { SnapshotService } from './services/SnapshotService.js';
import { SuggestionService } from './services/SuggestionService.js';
import { SyncService } from './services/SyncService.js';
import { createApiRouter } from './api/index.js';
import type { Request, Response, NextFunction } from 'express';

// Load environment variables
dotenv.config();

// Validate environment (fail-fast)
const env = validateEnv();

// Initialize logger
const loggerInstance = createLogger(env);
setLogger(loggerInstance);

// Initialize infrastructure adapters (P6 - dependency discipline)
const db = new DatabaseAdapter(env);
const actualBudget = new ActualBudgetAdapter(env);
const openai = new OpenAIAdapter(env);

// Initialize repositories
const suggestionRepo = new SuggestionRepository(db);
const auditRepo = new AuditRepository(db);

// Initialize services
const snapshotService = new SnapshotService(actualBudget, auditRepo);
const suggestionService = new SuggestionService(actualBudget, openai, suggestionRepo, auditRepo);
const syncService = new SyncService(actualBudget, suggestionRepo, auditRepo);

// Initialize Actual Budget connection
await actualBudget.initialize();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  loggerInstance.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount API routes
const apiRouter = createApiRouter({
  snapshotService,
  suggestionService,
  syncService,
  auditRepo,
});
app.use('/api', apiRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler (P7 - explicit error handling)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (isAppError(err)) {
    loggerInstance.error('Application error', {
      code: err.code,
      message: err.message,
      details: err.details,
      stack: err.stack,
    });
    
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  } else {
    loggerInstance.error('Unexpected error', {
      message: err.message,
      stack: err.stack,
    });
    
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    });
  }
});

// Start server
const server = app.listen(env.PORT, () => {
  loggerInstance.info(`Server started`, {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  loggerInstance.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    loggerInstance.info('Server closed');
    process.exit(0);
  });
});

export { app };
