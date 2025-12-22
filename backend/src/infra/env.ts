import { z } from 'zod';

/**
 * Environment variable schema with strict validation
 * Enforces P7 (explicit error handling) and P4 (explicitness)
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3001'),
  
  // Actual Budget API credentials
  ACTUAL_SERVER_URL: z.string().url(),
  ACTUAL_PASSWORD: z.string().min(1),
  ACTUAL_BUDGET_ID: z.string().uuid(),
  ACTUAL_SYNC_ID: z.string().optional(),
  ACTUAL_ENCRYPTION_KEY: z.string().optional(),
  
  // OpenAI API
  OPENAI_API_KEY: z.string().regex(/^sk-/),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  
  // Data storage
  DATA_DIR: z.string().default('./data'),
  SQLITE_DB_PATH: z.string().default('./data/audit.db'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE: z.string().optional(),

  // Periodic Sync
  SYNC_INTERVAL_MINUTES: z.string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((n) => n >= 1, { message: 'SYNC_INTERVAL_MINUTES must be at least 1' })
    .default('360'),
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
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      console.error('\nCheck .env.example for required variables');
      process.exit(1);
    }
    throw error;
  }
}
