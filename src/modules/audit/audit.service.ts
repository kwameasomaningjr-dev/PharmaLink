import { v4 as uuidv4 } from 'uuid';
import { db, DatabaseClient } from '../../database/connection.js';

export interface RecordAuditParams {
  actorUserId?: string | null;
  pharmacyId?: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
  client?: DatabaseClient;
}

export class AuditService {
  public static async recordEvent(params: RecordAuditParams): Promise<void> {
    const {
      actorUserId = null,
      pharmacyId = null,
      eventType,
      entityType,
      entityId,
      metadata = {},
      client = db,
    } = params;

    const id = uuidv4();
    try {
      await client.query(
        `INSERT INTO audit_events (id, actor_user_id, pharmacy_id, event_type, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, actorUserId, pharmacyId, eventType, entityType, entityId, JSON.stringify(metadata)]
      );
    } catch (err) {
      // Never let audit log failure break the primary transaction silently, but log loudly
      console.error('[AuditService] Failed to record audit event:', err);
    }
  }

  public static async listEvents(entityType?: string, entityId?: string, pharmacyId?: string, limit = 50) {
    let sql = `SELECT * FROM audit_events WHERE 1=1`;
    const params: any[] = [];

    if (entityType) {
      params.push(entityType);
      sql += ` AND entity_type = $${params.length}`;
    }
    if (entityId) {
      params.push(entityId);
      sql += ` AND entity_id = $${params.length}`;
    }
    if (pharmacyId) {
      params.push(pharmacyId);
      sql += ` AND pharmacy_id = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await db.query(sql, params);
    return res.rows;
  }
}
