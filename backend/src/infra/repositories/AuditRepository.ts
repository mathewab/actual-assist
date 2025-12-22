import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import type { AuditEntry, AuditEventType } from '../../domain/entities/AuditEntry.js';
import { createAuditEntry } from '../../domain/entities/AuditEntry.js';
import { logger } from '../logger.js';

/**
 * Repository for AuditEntry persistence
 * P5 (Separation of concerns): Audit operations isolated from business logic
 */
export class AuditRepository {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Log an audit event
   * P7 (Explicit error handling): Audit failures should not crash the application
   */
  log(params: {
    eventType: AuditEventType;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): void {
    try {
      const entry = createAuditEntry(params);
      
      const sql = `
        INSERT INTO audit_log (event_type, entity_type, entity_id, metadata, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `;

      this.db.execute(sql, [
        entry.eventType,
        entry.entityType,
        entry.entityId,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        new Date().toISOString(),
      ]);

      logger.debug('Audit event logged', {
        eventType: entry.eventType,
        entityType: entry.entityType,
        entityId: entry.entityId,
      });
    } catch (error) {
      // Log but don't throw - audit failures should not break the app
      logger.error('Failed to log audit event', { params, error });
    }
  }

  /**
   * Get recent audit events
   */
  getRecent(limit = 100): AuditEntry[] {
    const sql = `
      SELECT * FROM audit_log
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const rows = this.db.query<any>(sql, [limit]);
    return rows.map(row => this.mapRowToAuditEntry(row));
  }

  /**
   * Get audit events for a specific entity
   */
  getByEntity(entityType: string, entityId: string): AuditEntry[] {
    const sql = `
      SELECT * FROM audit_log
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY timestamp DESC
    `;

    const rows = this.db.query<any>(sql, [entityType, entityId]);
    return rows.map(row => this.mapRowToAuditEntry(row));
  }

  /**
   * Get audit events by event type
   */
  getByEventType(eventType: AuditEventType): AuditEntry[] {
    const sql = `
      SELECT * FROM audit_log
      WHERE event_type = ?
      ORDER BY timestamp DESC
    `;

    const rows = this.db.query<any>(sql, [eventType]);
    return rows.map(row => this.mapRowToAuditEntry(row));
  }

  /**
   * Map database row to AuditEntry entity
   */
  private mapRowToAuditEntry(row: any): AuditEntry {
    return {
      id: row.id,
      eventType: row.event_type as AuditEventType,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      timestamp: new Date(row.timestamp),
    };
  }
}
