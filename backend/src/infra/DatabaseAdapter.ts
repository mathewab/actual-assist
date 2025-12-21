import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseError } from '../domain/errors.js';
import { logger } from './logger.js';
import type { Env } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * SQLite database adapter following P5 (separation of concerns)
 * Domain layer never imports this - accessed via dependency injection
 */
export class DatabaseAdapter {
  private db: Database.Database;

  constructor(env: Env) {
    try {
      this.db = new Database(env.SQLITE_DB_PATH);
      this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
      this.initializeSchema();
      logger.info('Database initialized', { path: env.SQLITE_DB_PATH });
    } catch (error) {
      throw new DatabaseError('Failed to initialize database', { error });
    }
  }

  private initializeSchema(): void {
    try {
      const schemaPath = join(__dirname, 'db', 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);
      logger.info('Database schema initialized');
    } catch (error) {
      throw new DatabaseError('Failed to initialize database schema', { error });
    }
  }

  /**
   * Execute a query with parameters
   * P7 (Explicit error handling): Wraps errors in DatabaseError
   */
  query<T>(sql: string, params: unknown[] = []): T[] {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as T[];
    } catch (error) {
      logger.error('Database query failed', { sql, error });
      throw new DatabaseError('Query execution failed', { sql, error });
    }
  }

  /**
   * Execute a single-row query
   */
  queryOne<T>(sql: string, params: unknown[] = []): T | null {
    try {
      const stmt = this.db.prepare(sql);
      return (stmt.get(...params) as T) || null;
    } catch (error) {
      logger.error('Database queryOne failed', { sql, error });
      throw new DatabaseError('QueryOne execution failed', { sql, error });
    }
  }

  /**
   * Execute an INSERT/UPDATE/DELETE statement
   * Returns the number of affected rows
   */
  execute(sql: string, params: unknown[] = []): number {
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...params);
      return result.changes;
    } catch (error) {
      logger.error('Database execute failed', { sql, error });
      throw new DatabaseError('Execute failed', { sql, error });
    }
  }

  /**
   * Execute multiple statements in a transaction
   * P7 (Explicit error handling): Rolls back on any error
   */
  transaction<T>(fn: () => T): T {
    const txn = this.db.transaction(fn);
    try {
      return txn();
    } catch (error) {
      logger.error('Transaction failed, rolling back', { error });
      throw new DatabaseError('Transaction failed', { error });
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('Database connection closed');
  }
}
