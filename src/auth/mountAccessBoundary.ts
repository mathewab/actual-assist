import type { Express, Router } from 'express';
import type { HttpAuth } from './httpAuth.js';

/** All legacy API routes are behind the same boundary, including future route groups. */
export function mountAccessBoundary(app: Express, auth: HttpAuth, machineRouter: Router) {
  // Bound session lookup/logout as well as bearer authentication before dispatch.
  app.use(['/api', '/mcp'], auth.requestLimiter);
  app.use('/api/auth', auth.sessionRouter);
  app.use(['/api', '/mcp'], auth.authenticate);
  app.use(machineRouter);
  app.use('/integrations', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  app.use('/api', auth.requirePermission('app:operate'));
  app.use('/api/job-events', auth.sessionStream);
}
