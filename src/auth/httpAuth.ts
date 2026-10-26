import { requestContext } from '../infra/requestContext.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import express, { Router, type Request, type Response, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import {
  type AuthenticationProvider,
  type Principal,
  type Permission,
  permits,
} from './principals.js';

interface Session {
  principal: Principal;
  csrf: string;
  expires: number;
  streams: Set<Response>;
}
export type AuthEvent = 'auth_login' | 'auth_login_denied' | 'auth_logout';
export interface AuthOptions {
  mode: 'legacy' | 'enforced';
  origins: string[];
  secureCookie: boolean;
  ttlSeconds: number;
  provider: AuthenticationProvider;
  now?: () => number;
  audit: (event: AuthEvent, principalId?: string) => void;
}
const cookieName = 'actual_assist_session';
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
function cookieId(req: Request): string | undefined {
  return req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
}
function secretMatches(a: string, b: string): boolean {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function principalOf(res: Response): Principal {
  return res.locals.principal as Principal;
}

/** Opaque bounded in-memory sessions. Restart revokes all sessions; no forwarded identity trust. */
export function createHttpAuth(options: AuthOptions) {
  const now = options.now ?? Date.now;
  const sessions = new Map<string, Session>();
  const destroy = (id: string) => {
    const session = sessions.get(id);
    sessions.delete(id);
    for (const stream of session?.streams ?? []) stream.end();
  };
  const prune = () => {
    for (const [id, s] of sessions) if (s.expires <= now()) destroy(id);
  };
  const sessionFor = (req: Request) => {
    prune();
    return sessions.get(cookieId(req) ?? '');
  };
  const originAllowed = (req: Request, required = false) => {
    const origin = req.get('origin');
    return origin ? options.origins.includes(origin) : !required;
  };
  const deny = (res: Response, status: number, error: string) => {
    res.status(status).json({ error });
  };
  const cookieOptions = {
    httpOnly: true,
    secure: options.secureCookie,
    sameSite: 'strict' as const,
    path: '/api',
  };
  const sessionRouter = Router();
  sessionRouter.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  sessionRouter.get('/session', (req, res) => {
    if (options.mode === 'legacy') {
      res.json({ mode: 'legacy', authenticated: false });
      return;
    }
    const session = sessionFor(req);
    res.json(
      session
        ? {
            mode: 'enforced',
            authenticated: true,
            principal: session.principal,
            csrf: session.csrf,
            expiresAt: session.expires,
          }
        : { mode: 'enforced', authenticated: false }
    );
  });
  sessionRouter.post(
    '/login',
    rateLimit({
      windowMs: 60_000,
      limit: 5,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'RATE_LIMITED' },
    }),
    express.json({ limit: '2kb' }),
    async (req, res) => {
      if (options.mode !== 'enforced') {
        deny(res, 404, 'NOT_FOUND');
        return;
      }
      if (!originAllowed(req, true)) {
        deny(res, 403, 'FORBIDDEN_ORIGIN');
        return;
      }
      const token = req.body?.token;
      const principal =
        typeof token === 'string' && token.length <= 512
          ? await options.provider.authenticate(token)
          : null;
      if (!principal || !permits(principal, 'ui:session')) {
        options.audit('auth_login_denied');
        deny(res, 401, 'UNAUTHORIZED');
        return;
      }
      const oldId = cookieId(req);
      if (oldId) destroy(oldId);
      prune();
      if (sessions.size >= 1000) {
        deny(res, 503, 'SESSION_CAPACITY');
        return;
      }
      const id = randomBytes(32).toString('hex');
      const session: Session = {
        principal,
        csrf: randomBytes(32).toString('hex'),
        expires: now() + options.ttlSeconds * 1000,
        streams: new Set(),
      };
      sessions.set(id, session);
      options.audit('auth_login', principal.id);
      res.cookie(cookieName, id, { ...cookieOptions, maxAge: options.ttlSeconds * 1000 });
      res.json({
        mode: 'enforced',
        authenticated: true,
        principal,
        csrf: session.csrf,
        expiresAt: session.expires,
      });
    }
  );
  sessionRouter.post('/logout', (req, res) => {
    const session = sessionFor(req);
    if (!session) {
      res.clearCookie(cookieName, cookieOptions);
      res.sendStatus(204);
      return;
    }
    if (!originAllowed(req, true) || !secretMatches(req.get('x-csrf-token') ?? '', session.csrf)) {
      deny(res, 403, 'CSRF_REQUIRED');
      return;
    }
    destroy(cookieId(req)!);
    options.audit('auth_logout', session.principal.id);
    res.clearCookie(cookieName, cookieOptions);
    res.sendStatus(204);
  });
  sessionRouter.use((_req, res) => deny(res, 404, 'NOT_FOUND'));
  sessionRouter.use(((error: unknown, _req: Request, res: Response, _next: unknown) => {
    void error;
    deny(res, 400, 'INVALID_REQUEST');
  }) as express.ErrorRequestHandler);

  const authenticate: RequestHandler = async (req, res, next) => {
    if (options.mode === 'legacy') {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    if (!originAllowed(req)) {
      deny(res, 403, 'FORBIDDEN_ORIGIN');
      return;
    }
    const authorization = req.get('authorization');
    if (authorization !== undefined) {
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      const principal =
        token && token.length <= 512 ? await options.provider.authenticate(token) : null;
      if (!principal) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="actual-assist"');
        deny(res, 401, 'UNAUTHORIZED');
        return;
      }
      res.locals.principal = principal;
    } else {
      const session = sessionFor(req);
      if (!session) {
        deny(res, 401, 'UNAUTHORIZED');
        return;
      }
      if (
        !safeMethods.has(req.method) &&
        (!originAllowed(req, true) || !secretMatches(req.get('x-csrf-token') ?? '', session.csrf))
      ) {
        deny(res, 403, 'CSRF_REQUIRED');
        return;
      }
      res.locals.principal = session.principal;
      res.locals.session = session;
    }
    requestContext.run({ principalId: principalOf(res).id }, next);
  };
  const requirePermission =
    (permission: Permission): RequestHandler =>
    (_req, res, next) => {
      if (options.mode === 'legacy') {
        next();
        return;
      }
      const principal = principalOf(res);
      if (!principal || !permits(principal, permission)) {
        deny(res, 403, 'FORBIDDEN');
        return;
      }
      next();
    };
  const sessionStream: RequestHandler = (_req, res, next) => {
    const session = res.locals.session as Session | undefined;
    if (session) {
      session.streams.add(res);
      const timer = setTimeout(() => res.end(), Math.max(0, session.expires - now()));
      timer.unref();
      res.once('close', () => {
        clearTimeout(timer);
        session.streams.delete(res);
      });
    }
    next();
  };
  const requestLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED' },
  });
  return {
    mode: options.mode,
    requestLimiter,
    sessionRouter,
    authenticate,
    requirePermission,
    sessionStream,
    close: () => {
      for (const id of sessions.keys()) destroy(id);
    },
  };
}
export type HttpAuth = ReturnType<typeof createHttpAuth>;
