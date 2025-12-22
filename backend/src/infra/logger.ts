import winston from 'winston';
import type { Env } from './env.js';

/**
 * Structured logger with secret redaction (P7 - explicit error handling)
 * Logs to console in development, file + console in production
 */

const SECRET_PATTERNS = [
  /password[=:]\s*["']?([^"'\s]+)/gi,
  /api[_-]?key[=:]\s*["']?([^"'\s]+)/gi,
  /token[=:]\s*["']?([^"'\s]+)/gi,
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI API keys
];

/**
 * Redacts sensitive information from log messages
 */
function redactSecrets(obj: unknown): unknown {
  if (typeof obj === 'string') {
    let redacted = obj;
    SECRET_PATTERNS.forEach((pattern) => {
      redacted = redacted.replace(pattern, (match, secret) => {
        return match.replace(secret, '***REDACTED***');
      });
    });
    return redacted;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSecrets);
  }

  if (obj && typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Redact specific field names
      if (['password', 'apiKey', 'token', 'secret', 'encryptionKey'].includes(key)) {
        redacted[key] = '***REDACTED***';
      } else {
        redacted[key] = redactSecrets(value);
      }
    }
    return redacted;
  }

  return obj;
}

/**
 * Custom format that redacts secrets and formats as JSON
 */
const redactFormat = winston.format((info: any) => {
  const result: any = {
    ...info,
    message: redactSecrets(info.message),
  };
  if (info.meta) {
    result.meta = redactSecrets(info.meta);
  }
  return result;
})();

/**
 * Creates a Winston logger instance
 */
export function createLogger(env: Env): winston.Logger {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
  ];

  // Add file transport in production
  if (env.NODE_ENV === 'production' && env.LOG_FILE) {
    transports.push(
      new winston.transports.File({
        filename: env.LOG_FILE,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
      })
    );
  }

  return winston.createLogger({
    level: env.LOG_LEVEL,
    format: winston.format.combine(
      redactFormat,
      winston.format.errors({ stack: true }),
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports,
    exitOnError: false,
  });
}

/**
 * Global logger instance (initialized in server.ts)
 */
export let logger: winston.Logger;

export function setLogger(instance: winston.Logger): void {
  logger = instance;
}
