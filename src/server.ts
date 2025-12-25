import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import cors from 'cors';
import dotenv from 'dotenv';
import { validateEnv } from './infra/env.js';
import { createLogger, setLogger } from './infra/logger.js';
import { DatabaseAdapter } from './infra/DatabaseAdapter.js';
import { ActualBudgetAdapter } from './infra/ActualBudgetAdapter.js';
import { OpenAIAdapter } from './infra/OpenAIAdapter.js';
import { SuggestionRepository } from './infra/repositories/SuggestionRepository.js';
import { AuditRepository } from './infra/repositories/AuditRepository.js';
import { PayeeCacheRepository } from './infra/repositories/PayeeCacheRepository.js';
import { SnapshotService } from './services/SnapshotService.js';
import { SuggestionService } from './services/SuggestionService.js';
import { SyncService } from './services/SyncService.js';
import { createApiRouter } from './api/index.js';
import { createErrorHandler, notFoundHandler } from './api/errorHandler.js';
import { startScheduler } from './scheduler/SyncScheduler.js';
import type { Request, Response, NextFunction } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const payeeCache = new PayeeCacheRepository(db);

// Initialize services
const snapshotService = new SnapshotService(actualBudget, auditRepo, suggestionRepo);
const suggestionService = new SuggestionService(
  actualBudget,
  openai,
  suggestionRepo,
  auditRepo,
  payeeCache
);
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

// Readiness endpoint
app.get('/ready', async (_req: Request, res: Response) => {
  try {
    db.queryOne('SELECT 1 as ok');
    if (!actualBudget.isInitialized()) {
      return res.status(503).json({ status: 'not-ready' });
    }
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not-ready' });
  }
});

// Mount API routes
const apiRouter = createApiRouter({
  snapshotService,
  suggestionService,
  syncService,
  auditRepo,
  actualBudget,
});
app.use('/api', apiRouter);

if (env.NODE_ENV === 'production') {
  const uiDistPath = path.resolve(__dirname, '../ui');
  app.use(express.static(uiDistPath));

  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(uiDistPath, 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  app.use(vite.middlewares);

  app.get('*', async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    try {
      const templatePath = path.resolve(__dirname, 'ui', 'index.html');
      const template = await readFile(templatePath, 'utf-8');
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (error) {
      if (error instanceof Error) {
        vite.ssrFixStacktrace(error);
      }
      next(error);
    }
  });
}

// 404 handler
app.use(notFoundHandler);

// Global error handler (P7 - explicit error handling, T046)
app.use(createErrorHandler(env));

// Start server
const server = app.listen(env.PORT, () => {
  loggerInstance.info(`Server started`, {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
  });

  // Start periodic sync scheduler if interval is configured
  if (env.SYNC_INTERVAL_MINUTES > 0) {
    startScheduler(env, suggestionService, env.ACTUAL_BUDGET_ID);
    loggerInstance.info('Periodic sync scheduler enabled', {
      intervalMinutes: env.SYNC_INTERVAL_MINUTES,
    });
  }
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
