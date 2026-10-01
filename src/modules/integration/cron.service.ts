import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import { IntegrationService, ImportResult } from './integration.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotFoundError } from '../../common/errors.js';
import { SyncStatus } from '../../common/types.js';

export interface CronRunSummary {
  started_at: string;
  completed_at: string;
  connections_processed: number;
  connections_succeeded: number;
  connections_failed: number;
  results: Array<{
    connection_id: string;
    pharmacy_id: string;
    provider_name: string;
    status: SyncStatus;
    records_accepted?: number;
    error?: string;
  }>;
}

export class IntegrationCronService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;
  private static defaultIntervalMs = 15 * 60 * 1000; // 15 minutes

  /**
   * Start scheduled cron synchronization runner
   */
  public static start(intervalMs: number = this.defaultIntervalMs) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runScheduledSync().catch((err) => {
        console.error('[IntegrationCronService] Error during scheduled sync run:', err);
      });
    }, intervalMs);
    // Unref so it does not block Node process exit in tests
    if (this.timer.unref) this.timer.unref();
    console.log(`[IntegrationCronService] Scheduled inventory sync job started (Interval: ${intervalMs / 1000}s)`);
  }

  /**
   * Stop scheduled cron runner
   */
  public static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[IntegrationCronService] Scheduled inventory sync job stopped');
    }
  }

  /**
   * Run synchronization for all active connections
   */
  public static async runScheduledSync(): Promise<CronRunSummary> {
    if (this.isRunning) {
      console.log('[IntegrationCronService] Previous sync run still in progress, skipping tick.');
      return {
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        connections_processed: 0,
        connections_succeeded: 0,
        connections_failed: 0,
        results: [],
      };
    }

    this.isRunning = true;
    const startedAt = new Date().toISOString();
    const results: CronRunSummary['results'] = [];
    let succeeded = 0;
    let failed = 0;

    try {
      const connectionsRes = await db.query(
        `SELECT c.id, c.pharmacy_id, c.provider_name, c.provider_type, c.credentials_ref, c.status,
                p.display_name, p.license_number
         FROM integration_connections c
         JOIN pharmacies p ON c.pharmacy_id = p.id
         WHERE c.status != 'DISCONNECTED' AND p.verification_status = 'VERIFIED'
         ORDER BY c.last_sync_at ASC NULLS FIRST`
      );

      const connections = connectionsRes.rows;

      for (const conn of connections) {
        try {
          const syncResult = await this.syncConnection(conn.id);
          succeeded++;
          results.push({
            connection_id: conn.id,
            pharmacy_id: conn.pharmacy_id,
            provider_name: conn.provider_name,
            status: syncResult.status,
            records_accepted: syncResult.records_accepted,
          });
        } catch (err: any) {
          failed++;
          results.push({
            connection_id: conn.id,
            pharmacy_id: conn.pharmacy_id,
            provider_name: conn.provider_name,
            status: 'FAILED',
            error: err.message || 'Sync failed',
          });
        }
      }
    } finally {
      this.isRunning = false;
    }

    const completedAt = new Date().toISOString();

    await AuditService.recordEvent({
      actorUserId: null,
      eventType: 'INVENTORY_CRON_SYNC_COMPLETED',
      entityType: 'INTEGRATION_SYNC',
      entityId: uuidv4(),
      metadata: {
        started_at: startedAt,
        completed_at: completedAt,
        connections_processed: results.length,
        succeeded,
        failed,
      },
    });

    return {
      started_at: startedAt,
      completed_at: completedAt,
      connections_processed: results.length,
      connections_succeeded: succeeded,
      connections_failed: failed,
      results,
    };
  }

  /**
   * Run synchronization for a specific connection
   */
  public static async syncConnection(
    connectionId: string,
    actorUserId?: string
  ): Promise<ImportResult> {
    const connRes = await db.query(
      `SELECT c.*, p.display_name, p.license_number
       FROM integration_connections c
       JOIN pharmacies p ON c.pharmacy_id = p.id
       WHERE c.id = $1 LIMIT 1`,
      [connectionId]
    );

    if (connRes.rows.length === 0) {
      throw new NotFoundError(`Integration connection with ID "${connectionId}" not found`);
    }

    const conn = connRes.rows[0];

    try {
      // Delegate to IntegrationService POS/PMS sync
      const result = await IntegrationService.processPOSSync(
        conn.pharmacy_id,
        conn.provider_name,
        actorUserId
      );

      await db.query(
        `UPDATE integration_connections SET
          status = 'CONNECTED',
          last_sync_at = CURRENT_TIMESTAMP,
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [connectionId]
      );

      return result;
    } catch (err: any) {
      await db.query(
        `UPDATE integration_connections SET
          status = 'ERROR',
          last_error = $1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [err.message || 'Connection sync failed', connectionId]
      );
      throw err;
    }
  }
}
