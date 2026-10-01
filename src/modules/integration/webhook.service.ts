import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import { PosWebhookAdapter } from './adapters/base.adapter.js';
import { PrimeCareAdapter } from './adapters/primecare.adapter.js';
import { RxPhotoAdapter } from './adapters/rxphoto.adapter.js';
import { PioneerAdapter } from './adapters/pioneer.adapter.js';
import { GenericPosAdapter } from './adapters/generic.adapter.js';
import { IntegrationService, ImportResult } from './integration.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ValidationError, NotFoundError, UnauthorizedError } from '../../common/errors.js';

export class WebhookService {
  private static adapters = new Map<string, PosWebhookAdapter>([
    ['primecare', new PrimeCareAdapter() as PosWebhookAdapter],
    ['rxphoto', new RxPhotoAdapter() as PosWebhookAdapter],
    ['pioneer', new PioneerAdapter() as PosWebhookAdapter],
    ['generic', new GenericPosAdapter() as PosWebhookAdapter],
  ]);

  public static registerAdapter(adapter: PosWebhookAdapter) {
    this.adapters.set(adapter.providerName.toLowerCase(), adapter);
  }

  public static getAdapter(providerName: string): PosWebhookAdapter | undefined {
    return this.adapters.get(providerName.toLowerCase());
  }

  public static async processWebhook(
    providerName: string,
    rawBody: string | Buffer,
    parsedBody: any,
    headers: Record<string, string | string[] | undefined> = {}
  ): Promise<ImportResult & { pharmacy_id: string; provider: string }> {
    const adapter = this.getAdapter(providerName);
    if (!adapter) {
      throw new ValidationError(`Unsupported PMS/POS provider: "${providerName}". Supported: ${Array.from(this.adapters.keys()).join(', ')}`);
    }

    // 1. Normalize payload
    const normalized = adapter.normalizePayload(parsedBody);

    // 2. Resolve pharmacy
    let pharmacyId = normalized.pharmacyIdentifier;
    let pharmacyRes = await db.query(
      `SELECT id, display_name, license_number FROM pharmacies WHERE id::text = $1 OR license_number = $1 LIMIT 1`,
      [pharmacyId]
    );

    if (pharmacyRes.rows.length === 0) {
      // Also try case-insensitive license lookup
      pharmacyRes = await db.query(
        `SELECT id, display_name, license_number FROM pharmacies WHERE LOWER(license_number) = LOWER($1) LIMIT 1`,
        [pharmacyId]
      );
    }

    if (pharmacyRes.rows.length === 0) {
      throw new NotFoundError(`Pharmacy with identifier "${pharmacyId}" not found`);
    }

    const pharmacy = pharmacyRes.rows[0];
    pharmacyId = pharmacy.id;

    // 3. Lookup connection & verify HMAC signature if secret configured
    const connRes = await db.query(
      `SELECT * FROM integration_connections WHERE pharmacy_id = $1 AND LOWER(provider_name) = LOWER($2) LIMIT 1`,
      [pharmacyId, providerName]
    );

    let connection = connRes.rows[0];
    const signatureHeader = (
      headers['x-hub-signature-256'] ||
      headers['x-signature'] ||
      headers['x-pharmalink-signature'] ||
      headers['x-signature-sha256']
    ) as string | undefined;

    const apiKeyHeader = (headers['x-api-key'] || headers['x-pharmalink-token']) as string | undefined;

    if (connection && connection.credentials_ref) {
      let secret = connection.credentials_ref;
      try {
        const creds = JSON.parse(connection.credentials_ref);
        secret = creds.webhook_secret || creds.secret || creds.api_key || connection.credentials_ref;
      } catch {}

      if (signatureHeader) {
        const isValid = adapter.verifySignature(rawBody, signatureHeader, secret);
        if (!isValid) {
          throw new UnauthorizedError('HMAC-SHA256 signature verification failed.');
        }
      } else if (apiKeyHeader && apiKeyHeader !== secret) {
        throw new UnauthorizedError('Webhook API key does not match configured connection secret.');
      }
    }

    // If no connection recorded yet, record the new connection
    if (!connection) {
      const newConnId = uuidv4();
      await db.query(
        `INSERT INTO integration_connections (
          id, pharmacy_id, provider_name, provider_type, status, last_sync_at, created_at, updated_at
        ) VALUES ($1, $2, $3, 'POS_API', 'CONNECTED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [newConnId, pharmacyId, providerName.toLowerCase()]
      );
    }

    // 4. Ingest inventory observations
    try {
      const importResult = await IntegrationService.processFileImport(
        pharmacyId,
        normalized.items,
        undefined, // System / Webhook actor
        'POS_API'
      );

      // 5. Update connection status
      await db.query(
        `UPDATE integration_connections SET
          status = 'CONNECTED',
          last_sync_at = CURRENT_TIMESTAMP,
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
         WHERE pharmacy_id = $1 AND LOWER(provider_name) = LOWER($2)`,
        [pharmacyId, providerName.toLowerCase()]
      );

      // 6. Audit logging
      await AuditService.recordEvent({
        actorUserId: null,
        pharmacyId,
        eventType: 'INVENTORY_WEBHOOK_RECEIVED',
        entityType: 'INVENTORY_SYNC',
        entityId: importResult.sync_id,
        metadata: {
          provider: providerName,
          records_received: importResult.records_received,
          records_accepted: importResult.records_accepted,
          records_rejected: importResult.records_rejected,
          status: importResult.status,
          ...(normalized.metadata || {}),
        },
      });

      return {
        ...importResult,
        pharmacy_id: pharmacyId,
        provider: providerName,
      };
    } catch (err: any) {
      await db.query(
        `UPDATE integration_connections SET
          status = 'ERROR',
          last_error = $1,
          updated_at = CURRENT_TIMESTAMP
         WHERE pharmacy_id = $2 AND LOWER(provider_name) = LOWER($3)`,
        [err.message || 'Webhook sync processing failed', pharmacyId, providerName.toLowerCase()]
      );
      throw err;
    }
  }
}
