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
  | 'suggestions_generated_diff'
  | 'suggestion_approved'
  | 'suggestion_rejected'
  | 'suggestion_reset'
  | 'suggestion_retried'
  | 'sync_executed'
  | 'sync_failed'
  | 'templates_applied'
  | 'templates_apply_failed'
  | 'templates_apply_rolled_back'
  | 'payees_merged'
  | 'payees_merge_failed'
  | 'payees_merge_suggestions_generated'
  | 'payees_merge_suggestions_failed'
  | 'scheduled_sync_started'
  | 'scheduled_sync_completed'
  | 'scheduled_sync_failed'
  | 'llm_provider_changed'
  | 'llm_call_failed';

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
