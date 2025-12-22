import type { Request, Response, NextFunction } from 'express';
import { isAppError } from '../domain/errors.js';
import { logger } from '../infra/logger.js';
import type { Env } from '../infra/env.js';

/**
 * Global error handler middleware
 * T046: Map domain errors to HTTP status codes, redact secrets, log with context
 * P7 (Explicit error handling): Central error handling with proper responses
 */
export function createErrorHandler(env: Env) {
  return (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    // Build context for logging (redact sensitive data per P7)
    const context = {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      // Redact request body for security
      body: redactSecrets(req.body),
    };

    if (isAppError(err)) {
      // Known application error - use specific status code and message
      logger.error('Application error', {
        code: err.code,
        message: err.message,
        details: redactSecrets(err.details),
        stack: env.NODE_ENV === 'development' ? err.stack : undefined,
        ...context,
      });

      res.status(err.statusCode).json({
        error: err.code,
        message: err.message,
        ...(err.details ? { details: redactSecrets(err.details) } : {}),
      });
    } else if (err.name === 'SyntaxError' && 'body' in err) {
      // JSON parsing error
      logger.warn('Invalid JSON in request', {
        message: err.message,
        ...context,
      });

      res.status(400).json({
        error: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
      });
    } else {
      // Unknown error - log full details but return generic message
      logger.error('Unexpected error', {
        message: err.message,
        name: err.name,
        stack: err.stack,
        ...context,
      });

      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: env.NODE_ENV === 'development' 
          ? err.message 
          : 'An unexpected error occurred',
      });
    }
  };
}

/**
 * Redact sensitive information from objects before logging
 * P7 (Explicit error handling): Never log secrets
 */
function redactSecrets(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // List of sensitive field patterns
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /auth/i,
    /credential/i,
    /private/i,
    /encryption/i,
  ];

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const isSensitive = sensitivePatterns.some((pattern) => pattern.test(key));

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSecrets(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ 
    error: 'NOT_FOUND',
    message: 'The requested resource was not found' 
  });
}
