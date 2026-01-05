import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import cors from 'cors';
import dotenv from 'dotenv';
import { validateEnv } from './infra/env.js';
import { createLogger, setLogger } from './infra/logger.js';
import rateLimit from 'express-rate-limit';
import { DatabaseAdapter } from './infra/DatabaseAdapter.js';
import { runMigrations } from './infra/migrations.js';
import { ActualBudgetAdapter } from './infra/ActualBudgetAdapter.js';
import { createLLMRouter } from './infra/llm/createLLMRouter.js';
import { AppConfigRepository } from './infra/repositories/AppConfigRepository.js';
import { SuggestionRepository } from './infra/repositories/SuggestionRepository.js';
import { AuditRepository } from './infra/repositories/AuditRepository.js';
import { PayeeCacheRepository } from './infra/repositories/PayeeCacheRepository.js';
import { PayeeMergeClusterRepository } from './infra/repositories/PayeeMergeClusterRepository.js';
import { PayeeMergeClusterMetaRepository } from './infra/repositories/PayeeMergeClusterMetaRepository.js';
import { PayeeMergeHiddenGroupRepository } from './infra/repositories/PayeeMergeHiddenGroupRepository.js';
import { PayeeMergePayeeSnapshotRepository } from './infra/repositories/PayeeMergePayeeSnapshotRepository.js';
import { JobRepository } from './infra/repositories/JobRepository.js';
import { JobStepRepository } from './infra/repositories/JobStepRepository.js';
import { JobEventRepository } from './infra/repositories/JobEventRepository.js';
import { SnapshotService } from './services/SnapshotService.js';
import { SuggestionService } from './services/SuggestionService.js';
import { SyncService } from './services/SyncService.js';
import { JobService } from './services/JobService.js';
import { JobEventBus } from './services/JobEventBus.js';
import { JobOrchestrator } from './services/JobOrchestrator.js';
import { JobTimeoutService } from './services/JobTimeoutService.js';
import { PayeeMergeService } from './services/PayeeMergeService.js';
import { LLMConfigService } from './services/LLMConfigService.js';
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
await runMigrations(env);
const actualBudget = new ActualBudgetAdapter(env);
const appConfigRepo = new AppConfigRepository(db);
const llm = createLLMRouter(env, appConfigRepo);

// Initialize repositories
const suggestionRepo = new SuggestionRepository(db);
const auditRepo = new AuditRepository(db);
const payeeCache = new PayeeCacheRepository(db);
const payeeMergeClusterRepo = new PayeeMergeClusterRepository(db);
const payeeMergeClusterMetaRepo = new PayeeMergeClusterMetaRepository(db);
const payeeMergePayeeSnapshotRepo = new PayeeMergePayeeSnapshotRepository(db);
const payeeMergeHiddenGroupRepo = new PayeeMergeHiddenGroupRepository(db);
const jobRepo = new JobRepository(db);
const jobStepRepo = new JobStepRepository(db);
const jobEventRepo = new JobEventRepository(db);
const jobEventBus = new JobEventBus();
const llmConfigService = new LLMConfigService(env, appConfigRepo, llm, auditRepo);

// Initialize services
const snapshotService = new SnapshotService(actualBudget, auditRepo, suggestionRepo);
const suggestionService = new SuggestionService(
  actualBudget,
  llm,
  suggestionRepo,
  auditRepo,
  payeeCache
);
const syncService = new SyncService(actualBudget, suggestionRepo, auditRepo);
const jobService = new JobService(jobRepo, jobStepRepo, jobEventRepo, jobEventBus);
const payeeMergeService = new PayeeMergeService(
  actualBudget,
  payeeMergeClusterRepo,
  payeeMergeClusterMetaRepo,
  payeeMergePayeeSnapshotRepo,
  payeeMergeHiddenGroupRepo,
  llm,
  auditRepo
);
const jobOrchestrator = new JobOrchestrator(
  jobService,
  syncService,
  suggestionService,
  snapshotService,
  payeeMergeService
);
const jobTimeoutService = new JobTimeoutService(jobRepo, jobStepRepo, jobService);

// Initialize Actual Budget connection
await actualBudget.initialize();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
});

// Only rate-limit API traffic so Vite dev asset requests don't get throttled.
app.use('/api', apiLimiter);

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
  suggestionService,
  syncService,
  jobService,
  jobOrchestrator,
  jobEventBus,
  auditRepo,
  actualBudget,
  payeeMergeService,
  defaultBudgetId: env.ACTUAL_SYNC_ID || env.ACTUAL_BUDGET_ID || null,
  llmConfigService,
});
app.use('/api', apiRouter);

if (env.NODE_ENV === 'production') {
  const uiDistPath = path.resolve(__dirname, '../ui');
  app.use(express.static(uiDistPath));

  app.get(/.*/, (req: Request, res: Response, next: NextFunction) => {
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

  app.get(/.*/, async (req: Request, res: Response, next: NextFunction) => {
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

let jobTimeoutInterval: ReturnType<typeof setInterval> | null = null;

// Start server
const server = app.listen(env.PORT, () => {
  loggerInstance.info(`Server started`, {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
  });

  // Start periodic sync scheduler if interval is configured
  if (env.SYNC_INTERVAL_MINUTES > 0) {
    startScheduler(env, jobOrchestrator, env.ACTUAL_BUDGET_ID);
    loggerInstance.info('Periodic sync scheduler enabled', {
      intervalMinutes: env.SYNC_INTERVAL_MINUTES,
    });
  }

  // Start job timeout checks
  if (env.JOB_TIMEOUT_MINUTES > 0) {
    const checkIntervalMs = env.JOB_TIMEOUT_CHECK_INTERVAL_MINUTES * 60 * 1000;
    const runTimeoutCheck = () => {
      const { jobsFailed, stepsFailed } = jobTimeoutService.failTimedOutJobs(
        env.JOB_TIMEOUT_MINUTES
      );
      if (jobsFailed > 0 || stepsFailed > 0) {
        loggerInstance.info('Timed out jobs marked failed', {
          timeoutMinutes: env.JOB_TIMEOUT_MINUTES,
          jobsFailed,
          stepsFailed,
        });
      }
    };

    runTimeoutCheck();
    jobTimeoutInterval = setInterval(runTimeoutCheck, checkIntervalMs);
    jobTimeoutInterval.unref?.();

    loggerInstance.info('Job timeout monitor enabled', {
      timeoutMinutes: env.JOB_TIMEOUT_MINUTES,
      checkIntervalMinutes: env.JOB_TIMEOUT_CHECK_INTERVAL_MINUTES,
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  loggerInstance.info('SIGTERM received, shutting down gracefully');
  if (jobTimeoutInterval) {
    clearInterval(jobTimeoutInterval);
    jobTimeoutInterval = null;
  }
  server.close(() => {
    loggerInstance.info('Server closed');
    process.exit(0);
  });
});

export { app };
