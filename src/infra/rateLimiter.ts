import type { Request, Response, NextFunction } from 'express';

type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

export function createRateLimiter({ windowMs, max }: RateLimitOptions) {
  if (windowMs <= 0 || max <= 0) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const hits = new Map<string, RateLimitState>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const existing = hits.get(key);

    if (!existing || now >= existing.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      existing.count += 1;
      if (existing.count > max) {
        const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', String(existing.resetAt));
        return res.status(429).json({
          error: 'rate_limited',
          message: 'Too many requests. Please retry later.',
        });
      }
    }

    const current = hits.get(key);
    if (current) {
      const remaining = Math.max(0, max - current.count);
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(current.resetAt));
    }

    next();
  };
}
