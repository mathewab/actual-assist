import { validateCurrency } from '../domain/reports/Report.js';
import { z, ZodError } from 'zod';
import { credentialsSchema } from '../auth/principals.js';

/**
 * Environment variable schema with strict validation
 * Enforces P7 (explicit error handling) and P4 (explicitness)
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().default(3000),

    AUTH_MODE: z.enum(['legacy', 'enforced']).default('legacy'),
    MACHINE_API_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    AUTH_CREDENTIALS_JSON: z
      .string()
      .default('[]')
      .transform((value, context) => {
        try {
          const result = credentialsSchema.safeParse(JSON.parse(value));
          if (result.success) return result.data;
        } catch {
          /* Report only the config field, never credential contents. */
        }
        context.addIssue({ code: 'custom', message: 'Invalid named credential configuration' });
        return z.NEVER;
      }),
    AUTH_ALLOWED_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    AUTH_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(3600),
    // Reject obsolete activation rather than silently starting an unauthenticated deployment.
    INTEGRATIONS_ENABLED: z.enum(['true', 'false']).default('false'),

    // Actual Budget API credentials
    ACTUAL_SERVER_URL: z.string().url(),
    ACTUAL_PASSWORD: z.string().min(1),
    ACTUAL_BUDGET_ID: z.string().uuid(),
    ACTUAL_SYNC_ID: z.string().optional(),
    ACTUAL_ENCRYPTION_KEY: z.string().optional(),

    // AI Backend Selection
    AI_BACKEND: z.enum(['openai', 'google']).default('openai'),

    // OpenAI API
    OPENAI_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().regex(/^sk-/).optional()
    ),
    OPENAI_MODEL: z.string().default('gpt-4o-mini'),

    // Google AI (Gemini) API
    GOOGLE_AI_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional()
    ),
    GOOGLE_AI_MODEL: z.string().default('gemini-2.0-flash'),

    // Data storage
    DATA_DIR: z.string().default('./data'),
    SQLITE_DB_PATH: z.string().default('./data/audit.db'),

    // Monthly reports: opt-in only; no effect unless explicitly configured.
    REPORT_AI_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    REPORT_PUSH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    REPORT_SCHEDULE_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    REPORT_APP_ORIGIN: z.string().default(''),
    REPORT_PUSH_TOKEN: z.string().default(''),
    REPORT_PUSH_USER: z.string().default(''),
    REPORT_CURRENCY: z.string().default(''),
    REPORT_SCHEDULE_DAY: z.coerce.number().int().min(1).max(28).default(2),
    REPORT_SCHEDULE_HOUR: z.coerce.number().int().min(0).max(23).default(8),
    REPORT_TIMEZONE: z.string().default('UTC'),

    // Logging
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    LOG_FILE: z.string().optional(),

    // Periodic Sync
    SCHEDULED_SYNC_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    SYNC_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .min(1, { message: 'SYNC_INTERVAL_MINUTES must be at least 1' })
      .default(360),

    // Job timeout handling
    JOB_TIMEOUT_MINUTES: z.coerce
      .number()
      .int()
      .min(1, { message: 'JOB_TIMEOUT_MINUTES must be at least 1' })
      .default(60),
    JOB_TIMEOUT_CHECK_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .min(1, { message: 'JOB_TIMEOUT_CHECK_INTERVAL_MINUTES must be at least 1' })
      .default(5),

    // Rate limiting (API)
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().default(120),
  })
  .superRefine((env, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    if (
      (env.REPORT_AI_ENABLED || env.REPORT_PUSH_ENABLED || env.REPORT_SCHEDULE_ENABLED) &&
      env.AUTH_MODE !== 'enforced'
    )
      issue('AUTH_MODE', 'Report integrations require enforced authentication');
    if (
      env.REPORT_AI_ENABLED &&
      !(env.AI_BACKEND === 'google' ? env.GOOGLE_AI_API_KEY : env.OPENAI_API_KEY)
    )
      issue(
        'REPORT_AI_ENABLED',
        'Selected report AI provider must be configured; no provider fallback'
      );
    if (env.REPORT_PUSH_ENABLED) {
      if (!env.REPORT_PUSH_TOKEN || !env.REPORT_PUSH_USER)
        issue('REPORT_PUSH_ENABLED', 'Pushover token and user must be explicitly configured');
      try {
        const url = new URL(env.REPORT_APP_ORIGIN);
        if (
          url.protocol !== 'https:' ||
          url.origin !== env.REPORT_APP_ORIGIN ||
          !env.AUTH_ALLOWED_ORIGINS.includes(url.origin)
        )
          throw new Error();
      } catch {
        issue('REPORT_APP_ORIGIN', 'Report origin must be an existing allowed HTTPS app origin');
      }
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: env.REPORT_TIMEZONE });
    } catch {
      issue('REPORT_TIMEZONE', 'Expected an IANA timezone');
    }
    if (env.REPORT_SCHEDULE_ENABLED) {
      try {
        validateCurrency(env.REPORT_CURRENCY);
      } catch {
        issue(
          'REPORT_CURRENCY',
          'Configure the budget currency before enabling monthly scheduling'
        );
      }
    }
    if (env.INTEGRATIONS_ENABLED === 'true')
      issue(
        'INTEGRATIONS_ENABLED',
        'Migrate to AUTH_MODE=enforced and MACHINE_API_ENABLED; old routes are removed'
      );
    if (env.MACHINE_API_ENABLED && env.AUTH_MODE !== 'enforced')
      issue('AUTH_MODE', 'Machine access requires enforced authentication for all API routes');
    if (env.AUTH_MODE === 'enforced') {
      if (!env.AUTH_CREDENTIALS_JSON.some((c) => c.role === 'operator'))
        issue('AUTH_CREDENTIALS_JSON', 'Configure an explicit operator for UI access');
      if (!env.AUTH_ALLOWED_ORIGINS.length)
        issue('AUTH_ALLOWED_ORIGINS', 'Configure an exact UI origin');
      for (const origin of env.AUTH_ALLOWED_ORIGINS) {
        try {
          const url = new URL(origin);
          if (
            url.origin !== origin ||
            !['http:', 'https:'].includes(url.protocol) ||
            (env.NODE_ENV === 'production' && url.protocol !== 'https:')
          )
            throw new Error();
        } catch {
          issue('AUTH_ALLOWED_ORIGINS', 'Expected exact HTTP origins; production requires HTTPS');
        }
      }
      if (env.NODE_ENV === 'production' && !env.AUTH_COOKIE_SECURE)
        issue('AUTH_COOKIE_SECURE', 'Production sessions require secure cookies');
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates and parses environment variables
 * Exits process with code 1 if validation fails (fail-fast principle)
 */
export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('❌ Environment validation failed:');
      error.issues.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      console.error('\nCheck .env.example for required variables');
      process.exit(1);
    }
    throw error;
  }
}
