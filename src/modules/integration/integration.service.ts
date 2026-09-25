import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import { SyncStatus, SyncSourceType } from '../../common/types.js';
import { MedicineService } from '../medicine/medicine.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ValidationError, NotFoundError } from '../../common/errors.js';

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

export class IntegrationService {
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
        if (!isNaN(p) && p >= 0) {
          unitPriceMinor = Math.round(p * 100);
        }
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
    const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const nameIdx = header.findIndex((h) => h.includes('medicine') || h.includes('name') || h.includes('drug') || h.includes('item'));
    const qtyIdx = header.findIndex((h) => h.includes('qty') || h.includes('quantity') || h.includes('stock'));
    const priceIdx = header.findIndex((h) => h.includes('price') || h.includes('cost') || h.includes('unit'));
    const extIdIdx = header.findIndex((h) => h.includes('id') || h.includes('sku') || h.includes('code'));

    const rows: CSVImportRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
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
    const defaultPosItems: CSVImportRow[] = [
      { medicine_name: 'Paracetamol 500mg', quantity: 50, unit_price: 12.50, external_product_id: `${terminalId}-SKU-101` },
      { medicine_name: 'Amoxicillin 500mg', quantity: 30, unit_price: 45.00, external_product_id: `${terminalId}-SKU-102` },
      { medicine_name: 'Coartem 20mg/120mg', quantity: 40, unit_price: 35.00, external_product_id: `${terminalId}-SKU-103` },
      { medicine_name: 'Ibuprofen 400mg', quantity: 60, unit_price: 18.00, external_product_id: `${terminalId}-SKU-104` },
      { medicine_name: 'Cetirizine 10mg', quantity: 75, unit_price: 15.00, external_product_id: `${terminalId}-SKU-105` },
    ];
    return this.processFileImport(pharmacyId, defaultPosItems, actorUserId);
  }

  public static async getSyncHistory(pharmacyId: string) {
    const res = await db.query(
      `SELECT * FROM inventory_syncs WHERE pharmacy_id = $1 ORDER BY started_at DESC LIMIT 20`,
      [pharmacyId]
    );
    return res.rows;
  }
}
