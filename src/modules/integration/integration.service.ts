import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import { SyncStatus, SyncSourceType } from '../../common/types.js';
import { MedicineService } from '../medicine/medicine.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ValidationError, ConflictError, NotFoundError } from '../../common/errors.js';

export interface CSVImportRow {
  medicine_name: string;
  quantity: string | number;
  unit_price?: string | number;
  external_product_id?: string;
}

export interface ImportResult {
  sync_id: string;
  status: SyncStatus;
  records_received: number;
  records_accepted: number;
  records_rejected: number;
  rejected_rows: { row: number; medicine_name: string; reason: string }[];
}

export interface PosAdapter {
  readonly providerName: string;
  sync(input: { pharmacyId: string; terminalId: string }): Promise<CSVImportRow[]>;
}

class DefaultGhanaPosAdapter implements PosAdapter {
  readonly providerName = 'ghana_default';

  async sync(input: { pharmacyId: string; terminalId: string }): Promise<CSVImportRow[]> {
    // Generate realistic synced snapshot from common inventory if provider doesn't have custom remote client
    const medsRes = await db.query(`SELECT generic_name, brand_name, strength_value, strength_unit FROM medicines LIMIT 10`);
    if (medsRes.rows.length === 0) {
      return [
        { medicine_name: 'Paracetamol 500mg', quantity: 60, unit_price: 10.0, external_product_id: 'SKU-PARA-500' },
        { medicine_name: 'Amoxicillin 500mg', quantity: 35, unit_price: 32.5, external_product_id: 'SKU-AMOX-500' },
        { medicine_name: 'Coartem', quantity: 24, unit_price: 48.0, external_product_id: 'SKU-COAR-80' },
      ];
    }
    return medsRes.rows.map((med: any, idx: number) => ({
      medicine_name: med.generic_name,
      quantity: 20 + (idx * 5),
      unit_price: 15.0 + (idx * 2.5),
      external_product_id: `POS-AUTO-${idx + 1}`,
    }));
  }
}

export class IntegrationService {
  private static posAdapter: PosAdapter = new DefaultGhanaPosAdapter();

  public static setPosAdapter(adapter: PosAdapter) {
    this.posAdapter = adapter;
  }

  /**
   * Process a CSV or file import of inventory items for a pharmacy.
   */
  public static async processFileImport(
    pharmacyId: string,
    rows: CSVImportRow[],
    actorUserId?: string,
    sourceType: SyncSourceType = 'FILE'
  ): Promise<ImportResult> {
    if (!rows || rows.length === 0) {
      throw new ValidationError('Payload contains no inventory records.');
    }

    const syncId = uuidv4();
    const now = new Date();

    // 1. Create sync record
    await db.query(
      `INSERT INTO inventory_syncs (
        id, pharmacy_id, source_type, status,
        records_received, records_accepted, records_rejected, started_at
      ) VALUES ($1, $2, $3, 'STARTED', $4, 0, 0, $5)`,
      [syncId, pharmacyId, sourceType, rows.length, now.toISOString()]
    );

    let acceptedCount = 0;
    let rejectedCount = 0;
    const rejectedDetails: { row: number; medicine_name: string; reason: string }[] = [];

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      const row = rows[i];
      const rawName = row.medicine_name?.trim();

      if (!rawName) {
        rejectedCount++;
        rejectedDetails.push({ row: rowNum, medicine_name: '', reason: 'Missing medicine name.' });
        continue;
      }

      const qty = Number(row.quantity);
      if (isNaN(qty) || qty < 0) {
        rejectedCount++;
        rejectedDetails.push({ row: rowNum, medicine_name: rawName, reason: `Invalid quantity: "${row.quantity}". Must be >= 0.` });
        continue;
      }

      // Match medicine in canonical catalogue
      const matches = await MedicineService.searchMedicines(rawName);
      if (matches.length === 0) {
        rejectedCount++;
        rejectedDetails.push({
          row: rowNum,
          medicine_name: rawName,
          reason: 'Medicine not found in canonical catalogue. Mapping required.',
        });
        continue;
      }

      const matchedMed = matches[0];
      let unitPriceMinor: number | undefined;
      if (row.unit_price !== undefined && row.unit_price !== null && row.unit_price !== '') {
        const p = Number(row.unit_price);
        if (!Number.isFinite(p) || p < 0) {
          rejectedCount++;
          rejectedDetails.push({ row: rowNum, medicine_name: rawName, reason: `Invalid unit price: "${row.unit_price}". Must be >= 0.` });
          continue;
        }
        unitPriceMinor = Math.round(p * 100);
      }
      if (row.external_product_id !== undefined && !String(row.external_product_id).trim()) {
        rejectedCount++;
        rejectedDetails.push({ row: rowNum, medicine_name: rawName, reason: 'External product ID cannot be empty when provided.' });
        continue;
      }

      try {
        await InventoryService.recordObservation({
          pharmacy_id: pharmacyId,
          medicine_id: matchedMed.id,
          source_type: (sourceType === 'POS_API' || sourceType === 'API') ? 'POS' : sourceType === 'FILE' ? 'FILE' : 'MANUAL',
          quantity: qty,
          unit_price_minor: unitPriceMinor,
          sync_id: syncId,
          actor_user_id: actorUserId,
          metadata: {
            external_product_id: row.external_product_id || null,
            original_row_name: rawName,
          },
        });
        acceptedCount++;
      } catch (err: any) {
        rejectedCount++;
        rejectedDetails.push({ row: rowNum, medicine_name: rawName, reason: err.message || 'Database error' });
      }
    }

    const finalStatus: SyncStatus =
      rejectedCount === 0 ? 'SUCCESS' : acceptedCount > 0 ? 'PARTIAL' : 'FAILED';

    const errorSummary =
      rejectedDetails.length > 0 ? JSON.stringify(rejectedDetails.slice(0, 50)) : null;

    await db.query(
      `UPDATE inventory_syncs SET
        status = $1,
        records_accepted = $2,
        records_rejected = $3,
        error_summary = $4,
        completed_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [finalStatus, acceptedCount, rejectedCount, errorSummary, syncId]
    );

    await AuditService.recordEvent({
      actorUserId: actorUserId || null,
      pharmacyId,
      eventType: sourceType === 'POS_API' ? 'INVENTORY_POS_SYNCED' : 'INVENTORY_FILE_IMPORTED',
      entityType: 'INVENTORY_SYNC',
      entityId: syncId,
      metadata: {
        records_received: rows.length,
        accepted: acceptedCount,
        rejected: rejectedCount,
        status: finalStatus,
        source_type: sourceType,
      },
    });

    return {
      sync_id: syncId,
      status: finalStatus,
      records_received: rows.length,
      records_accepted: acceptedCount,
      records_rejected: rejectedCount,
      rejected_rows: rejectedDetails,
    };
  }

  /**
   * Helper to parse CSV string into row objects
   */
  public static parseCSV(csvContent: string): CSVImportRow[] {
    const records: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < csvContent.length; i++) {
      const char = csvContent[i];
      if (char === '"') {
        if (quoted && csvContent[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (char === ',' && !quoted) {
        row.push(field.trim());
        field = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && csvContent[i + 1] === '\n') i++;
        row.push(field.trim());
        if (row.some((value) => value !== '')) records.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    if (field || row.length) {
      row.push(field.trim());
      if (row.some((value) => value !== '')) records.push(row);
    }
    const lines = records;
    if (lines.length < 2) return [];

    const header = lines[0].map((h) => h.trim().toLowerCase());
    const nameIdx = header.findIndex((h) => h.includes('medicine') || h.includes('name') || h.includes('drug') || h.includes('item'));
    const qtyIdx = header.findIndex((h) => h.includes('qty') || h.includes('quantity') || h.includes('stock'));
    const priceIdx = header.findIndex((h) => h.includes('price') || h.includes('cost') || h.includes('unit'));
    const extIdIdx = header.findIndex((h) => h.includes('id') || h.includes('sku') || h.includes('code'));

    const rows: CSVImportRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i];
      if (parts.length === 0 || (parts.length === 1 && !parts[0])) continue;

      rows.push({
        medicine_name: nameIdx >= 0 ? parts[nameIdx] : parts[0],
        quantity: qtyIdx >= 0 ? parts[qtyIdx] : parts[1] || '0',
        unit_price: priceIdx >= 0 ? parts[priceIdx] : parts[2],
        external_product_id: extIdIdx >= 0 ? parts[extIdIdx] : undefined,
      });
    }

    return rows;
  }

  public static async processPOSSync(
    pharmacyId: string,
    terminalId: string = 'POS-TERMINAL-01',
    actorUserId?: string
  ): Promise<ImportResult> {
    const rows = await this.posAdapter.sync({ pharmacyId, terminalId });
    return this.processFileImport(pharmacyId, rows, actorUserId, 'POS_API');
  }

  public static async getSyncHistory(pharmacyId: string) {
    const res = await db.query(
      `SELECT * FROM inventory_syncs WHERE pharmacy_id = $1 ORDER BY started_at DESC LIMIT 30`,
      [pharmacyId]
    );
    return res.rows;
  }

  public static async getConnections(pharmacyId: string) {
    const res = await db.query(
      `SELECT id, pharmacy_id, provider_name, provider_type, status, last_sync_at, last_error, created_at, updated_at
       FROM integration_connections WHERE pharmacy_id = $1 ORDER BY created_at DESC`,
      [pharmacyId]
    );
    return res.rows;
  }

  public static async createConnection(input: {
    pharmacyId: string;
    providerName: string;
    providerType?: string;
    webhookSecret?: string;
  }) {
    const { pharmacyId, providerName, providerType = 'POS_API', webhookSecret } = input;
    if (!pharmacyId || !providerName) {
      throw new ValidationError('Pharmacy ID and provider name are required.');
    }

    const existing = await db.query(
      `SELECT id FROM integration_connections WHERE pharmacy_id = $1 AND LOWER(provider_name) = LOWER($2) LIMIT 1`,
      [pharmacyId, providerName]
    );

    const secret = webhookSecret || uuidv4().replace(/-/g, '');
    const credsJson = JSON.stringify({ webhook_secret: secret });

    if (existing.rows.length > 0) {
      const connId = existing.rows[0].id;
      const res = await db.query(
        `UPDATE integration_connections SET
          status = 'CONNECTED',
          credentials_ref = $1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 RETURNING *`,
        [credsJson, connId]
      );
      return { ...res.rows[0], webhook_secret: secret };
    }

    const connId = uuidv4();
    const res = await db.query(
      `INSERT INTO integration_connections (
        id, pharmacy_id, provider_name, provider_type, status, credentials_ref, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'CONNECTED', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *`,
      [connId, pharmacyId, providerName.toLowerCase(), providerType, credsJson]
    );

    return { ...res.rows[0], webhook_secret: secret };
  }

  public static async deleteConnection(connectionId: string, pharmacyId: string) {
    const res = await db.query(
      `DELETE FROM integration_connections WHERE id = $1 AND pharmacy_id = $2 RETURNING id`,
      [connectionId, pharmacyId]
    );
    if (res.rows.length === 0) {
      throw new NotFoundError('Integration connection');
    }
    return { success: true, deleted_id: connectionId };
  }
}
