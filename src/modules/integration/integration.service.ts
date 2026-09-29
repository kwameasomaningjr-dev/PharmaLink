import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import { SyncStatus, SyncSourceType } from '../../common/types.js';
import { MedicineService } from '../medicine/medicine.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ValidationError, ConflictError } from '../../common/errors.js';

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

class UnavailablePosAdapter implements PosAdapter {
  readonly providerName = 'unavailable';

  async sync(): Promise<CSVImportRow[]> {
    throw new ConflictError('POS_PROVIDER_UNAVAILABLE', 'No live POS provider is configured. Use CSV import or configure a POS adapter.');
  }
}

export class IntegrationService {
  private static posAdapter: PosAdapter = new UnavailablePosAdapter();

  public static setPosAdapter(adapter: PosAdapter) {
    this.posAdapter = adapter;
  }
  /**
   * Process a CSV or file import of inventory items for a pharmacy.
   */
  public static async processFileImport(
    pharmacyId: string,
    rows: CSVImportRow[],
    actorUserId?: string
  ): Promise<ImportResult> {
    if (!rows || rows.length === 0) {
      throw new ValidationError('File contains no inventory records.');
    }

    const syncId = uuidv4();
    const now = new Date();

    // 1. Create sync record
    await db.query(
      `INSERT INTO inventory_syncs (
        id, pharmacy_id, source_type, status,
        records_received, records_accepted, records_rejected, started_at
      ) VALUES ($1, $2, 'FILE', 'STARTED', $3, 0, 0, $4)`,
      [syncId, pharmacyId, rows.length, now.toISOString()]
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
      if (row.unit_price !== undefined) {
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
          source_type: 'FILE',
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
      eventType: 'INVENTORY_FILE_IMPORTED',
      entityType: 'INVENTORY_SYNC',
      entityId: syncId,
      metadata: {
        records_received: rows.length,
        accepted: acceptedCount,
        rejected: rejectedCount,
        status: finalStatus,
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
    return this.processFileImport(pharmacyId, rows, actorUserId);
  }

  public static async getSyncHistory(pharmacyId: string) {
    const res = await db.query(
      `SELECT * FROM inventory_syncs WHERE pharmacy_id = $1 ORDER BY started_at DESC LIMIT 20`,
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
}
