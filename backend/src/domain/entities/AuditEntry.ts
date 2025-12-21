/**
 * AuditEntry entity - immutable audit log record
 * P1 (Single Responsibility): Records what happened, when, and why
 */
export interface AuditEntry {
  id: number; // Auto-increment from SQLite
  eventType: AuditEventType;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
}

export type AuditEventType =
  | 'snapshot_created'
  | 'suggestions_generated'
  | 'suggestion_approved'
  | 'suggestion_rejected'
  | 'sync_plan_created'
  | 'sync_executed'
  | 'sync_failed';

/**
 * Factory function to create a new AuditEntry
 * P4 (Explicitness): All audit fields explicitly captured
 */
export function createAuditEntry(params: {
  eventType: AuditEventType;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Omit<AuditEntry, 'id' | 'timestamp'> {
  return {
    eventType: params.eventType,
    entityType: params.entityType,
    entityId: params.entityId,
    metadata: params.metadata || null,
  };
}
