import type { Express, Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { HttpAuth } from './httpAuth.js';

/** All legacy API routes are behind the same boundary, including future route groups. */
export function mountAccessBoundary(app: Express, auth: HttpAuth, machineRouter: Router) {
  // This server uses static credentials, not OAuth. Discovery must not receive
  // the SPA's successful HTML fallback or advertise a nonexistent auth server.
  app.use(
    [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-authorization-server',
      '/.well-known/openid-configuration',
    ],
    (_req, res) => {
      res.status(404).json({ error: 'NOT_FOUND' });
    }
  );
  // Bound session lookup/logout as well as bearer authentication before dispatch.
  app.use(
    ['/api', '/mcp'],
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'RATE_LIMITED' },
    })
  );
  app.use('/api/auth', auth.sessionRouter);
  app.use(['/api', '/mcp'], auth.authenticate);
  app.use(machineRouter);
  app.use('/integrations', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  app.use('/api', auth.requirePermission('app:operate'));
  app.use('/api/job-events', auth.sessionStream);
}
