import express, { Router, type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import type { HttpAuth } from '../auth/httpAuth.js';
import type { ReportService } from '../services/ReportService.js';
import { ReportError } from '../domain/reports/Report.js';
export function createReportRouter(service: ReportService, auth: HttpAuth): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (auth.mode !== 'enforced') {
      res.status(503).json({ error: 'REPORTS_REQUIRE_ENFORCED_AUTH' });
      return;
    }
    next();
  });
  router.use(auth.requirePermission('budget:read'));
  router.get('/', (req, res) => {
    const query = z
      .strictObject({
        limit: z.coerce.number().int().min(1).max(100).default(100),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .parse(req.query);
    res.json({ reports: service.list(query.limit, query.offset) });
  });
  router.post(
    '/',
    auth.requirePermission('app:operate'),
    express.json({ limit: '4kb' }),
    async (req, res) => {
      const input = z
        .strictObject({
          month: z.string(),
          currency: z.string().length(3),
          requestKey: z.string().uuid(),
          supersedesId: z.string().uuid().optional(),
        })
        .parse(req.body);
      const report = await service.generate(input);
      res.status(201).json(service.detail(report.id));
    }
  );
  router.get('/:id', (req, res) => res.json(service.detail(z.uuid().parse(req.params.id))));
  router.get('/:id/observations', (req, res) =>
    res.json(service.explore(z.uuid().parse(req.params.id)))
  );
  router.get('/:id/transactions', (req, res) => {
    const query = z
      .strictObject({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
        observationId: z.string().max(100).optional(),
        categoryId: z.string().max(100).optional(),
        payeeId: z.string().max(100).optional(),
        month: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
          .optional(),
      })
      .parse(req.query);
    res.json(service.transactions(z.uuid().parse(req.params.id), query));
  });
  router.post(
    '/:id/notification',
    auth.requirePermission('app:operate'),
    express.json({ limit: '1kb' }),
    async (req, res) => {
      const { retry } = z.strictObject({ retry: z.boolean().default(false) }).parse(req.body ?? {});
      res.json({ status: await service.notify(z.uuid().parse(req.params.id), retry) });
    }
  );
  router.get('/:id/pdf', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const report = service.get(id);
    const bytes = await service.pdf(id);
    res.setHeader(
      'Content-Disposition',
      `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="report-${report.month}-v${report.version}.pdf"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('application/pdf').send(bytes);
  });
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status =
      error instanceof ReportError
        ? error.status
        : error instanceof z.ZodError || error?.type === 'entity.parse.failed'
          ? 400
          : error?.type === 'entity.too.large'
            ? 413
            : 503;
    res.status(status).json({
      error:
        error instanceof ReportError
          ? error.code
          : status === 400
            ? 'INVALID_REQUEST'
            : 'REPORT_UNAVAILABLE',
    });
  };
  router.use(errorHandler);
  return router;
}
