import knex from 'knex';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';
import type { Env } from './env.js';

export async function runMigrations(env: Env): Promise<void> {
  const dbPath = env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'audit.db');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const migrationRunner = knex({
    client: 'better-sqlite3',
    connection: {
      filename: dbPath,
    },
    migrations: {
      directory: path.join(__dirname, 'db', 'migrations'),
      extension: 'cjs',
    },
    useNullAsDefault: true,
  });

  try {
    const [batch, log] = await migrationRunner.migrate.latest();
    if (log.length > 0) {
      logger.info('Database migrations applied', { batch, migrations: log });
    } else {
      logger.info('Database migrations up to date');
    }
  } finally {
    await migrationRunner.destroy();
  }
}
