import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import {
  Inventory,
  InventorySourceType,
  AvailabilityState,
} from '../../common/types.js';
import { ValidationError, NotFoundError } from '../../common/errors.js';
import { AvailabilityEngine } from '../availability/availability.engine.js';
import { AuditService } from '../audit/audit.service.js';

export interface PhysicalConfirmationInput {
  pharmacy_id: string;
  medicine_id: string;
  physical_quantity: number;
  unit_price_minor?: number;
  note?: string;
  actor_user_id?: string;
}

export interface InventoryRecordInput {
  pharmacy_id: string;
  medicine_id: string;
  source_type: InventorySourceType;
  quantity: number;
  unit_price_minor?: number;
  sync_id?: string;
  actor_user_id?: string;
  metadata?: Record<string, any>;
}

export class InventoryService {
  /**
   * Manual or physical stock confirmation by pharmacy staff.
   * This is the highest immediate signal for availability in V1.
   */
  public static async confirmPhysicalStock(input: PhysicalConfirmationInput): Promise<Inventory> {
    if (input.physical_quantity < 0) {
      throw new ValidationError('Physical quantity cannot be negative.');
    }

    return await db.transaction(async (tx) => {
      // 1. Get or create current inventory row
      const existingRes = await tx.query<Inventory>(
        `SELECT * FROM inventory WHERE pharmacy_id = $1 AND medicine_id = $2`,
        [input.pharmacy_id, input.medicine_id]
      );

      let invId = uuidv4();
      let reservedQty = 0;
      let unitPrice = input.unit_price_minor ?? 1000;

      if (existingRes.rowCount > 0) {
        invId = existingRes.rows[0].id;
        reservedQty = existingRes.rows[0].reserved_quantity;
        if (input.unit_price_minor !== undefined) {
          unitPrice = input.unit_price_minor;
        } else {
          unitPrice = existingRes.rows[0].unit_price_minor;
        }
      }

      const availableQty = Math.max(0, input.physical_quantity - reservedQty);
      const now = new Date();

      const evaluation = AvailabilityEngine.evaluate({
        sourceType: 'PHYSICAL_CONFIRMATION',
        observedQuantity: input.physical_quantity,
        reservedQuantity: reservedQty,
        observedAt: now,
        confirmedAt: now,
      });

      if (existingRes.rowCount > 0) {
        await tx.query(
          `UPDATE inventory SET
            source_type = 'PHYSICAL_CONFIRMATION',
            observed_quantity = $1,
            available_quantity = $2,
            unit_price_minor = $3,
            availability_state = $4,
            observed_at = $5,
            confirmed_at = $5,
            status = 'ACTIVE',
            updated_at = $5
           WHERE id = $6`,
          [
            input.physical_quantity,
            availableQty,
            unitPrice,
            evaluation.state,
            now.toISOString(),
            invId,
          ]
        );
      } else {
        await tx.query(
          `INSERT INTO inventory (
            id, pharmacy_id, medicine_id, source_type,
            observed_quantity, reserved_quantity, available_quantity,
            unit_price_minor, availability_state, observed_at, confirmed_at, status
          ) VALUES ($1, $2, $3, 'PHYSICAL_CONFIRMATION', $4, 0, $5, $6, $7, $8, $8, 'ACTIVE')`,
          [
            invId,
            input.pharmacy_id,
            input.medicine_id,
            input.physical_quantity,
            availableQty,
            unitPrice,
            evaluation.state,
            now.toISOString(),
          ]
        );
      }

      // 2. Insert immutable inventory observation
      const obsId = uuidv4();
      await tx.query(
        `INSERT INTO inventory_observations (id, inventory_id, source_type, quantity, observed_at, actor_user_id, metadata)
         VALUES ($1, $2, 'PHYSICAL_CONFIRMATION', $3, $4, $5, $6)`,
        [
          obsId,
          invId,
          input.physical_quantity,
          now.toISOString(),
          input.actor_user_id || null,
          JSON.stringify({ note: input.note || 'Physical count verified' }),
        ]
      );

      // 3. Audit trail
      await AuditService.recordEvent({
        actorUserId: input.actor_user_id || null,
        pharmacyId: input.pharmacy_id,
        eventType: 'INVENTORY_PHYSICALLY_CONFIRMED',
        entityType: 'INVENTORY',
        entityId: invId,
        metadata: {
          medicine_id: input.medicine_id,
          physical_quantity: input.physical_quantity,
          available_quantity: availableQty,
          availability_state: evaluation.state,
        },
        client: tx,
      });

      const updated = await tx.query<Inventory>(`SELECT * FROM inventory WHERE id = $1`, [invId]);
      return updated.rows[0];
    });
  }

  /**
   * Update or record inventory from POS, File or Manual dashboard.
   * If physical confirmation occurred today, preserve that strong signal while recording POS observation.
   */
  public static async recordObservation(input: InventoryRecordInput): Promise<Inventory> {
    if (input.quantity < 0) {
      throw new ValidationError('Quantity cannot be negative.');
    }

    return await db.transaction(async (tx) => {
      const existingRes = await tx.query<Inventory>(
        `SELECT * FROM inventory WHERE pharmacy_id = $1 AND medicine_id = $2`,
        [input.pharmacy_id, input.medicine_id]
      );

      let invId = uuidv4();
      let reservedQty = 0;
      let unitPrice = input.unit_price_minor ?? 1000;
      let confirmedAt: string | null = null;
      const now = new Date();

      if (existingRes.rowCount > 0) {
        invId = existingRes.rows[0].id;
        reservedQty = existingRes.rows[0].reserved_quantity;
        confirmedAt = existingRes.rows[0].confirmed_at;
        if (input.unit_price_minor !== undefined) {
          unitPrice = input.unit_price_minor;
        } else {
          unitPrice = existingRes.rows[0].unit_price_minor;
        }
      }

      // Check conflict rule: If physical confirmation is from today, don't silently overwrite confirmed_quantity
      let effectiveQuantity = input.quantity;
      let effectiveSource = input.source_type;

      if (confirmedAt) {
        const confirmDate = new Date(confirmedAt);
        const isSameDay = now.toDateString() === confirmDate.toDateString();
        if (isSameDay && input.source_type !== 'PHYSICAL_CONFIRMATION') {
          // Physical confirmation takes precedence for current operating day!
          // We still record this POS/File observation, but inventory keeps physical quantity
          effectiveQuantity = existingRes.rows[0].observed_quantity;
          effectiveSource = 'PHYSICAL_CONFIRMATION';
        }
      }

      const availableQty = Math.max(0, effectiveQuantity - reservedQty);

      const evaluation = AvailabilityEngine.evaluate({
        sourceType: effectiveSource,
        observedQuantity: effectiveQuantity,
        reservedQuantity: reservedQty,
        observedAt: now,
        confirmedAt: confirmedAt,
      });

      if (existingRes.rowCount > 0) {
        await tx.query(
          `UPDATE inventory SET
            source_type = $1,
            observed_quantity = $2,
            available_quantity = $3,
            unit_price_minor = $4,
            availability_state = $5,
            observed_at = $6,
            last_sync_id = $7,
            status = 'ACTIVE',
            updated_at = $6
           WHERE id = $8`,
          [
            effectiveSource,
            effectiveQuantity,
            availableQty,
            unitPrice,
            evaluation.state,
            now.toISOString(),
            input.sync_id || null,
            invId,
          ]
        );
      } else {
        await tx.query(
          `INSERT INTO inventory (
            id, pharmacy_id, medicine_id, source_type,
            observed_quantity, reserved_quantity, available_quantity,
            unit_price_minor, availability_state, observed_at, last_sync_id, status
          ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, 'ACTIVE')`,
          [
            invId,
            input.pharmacy_id,
            input.medicine_id,
            effectiveSource,
            effectiveQuantity,
            availableQty,
            unitPrice,
            evaluation.state,
            now.toISOString(),
            input.sync_id || null,
          ]
        );
      }

      // Always record the observation evidence
      const obsId = uuidv4();
      await tx.query(
        `INSERT INTO inventory_observations (id, inventory_id, source_type, quantity, observed_at, actor_user_id, sync_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          obsId,
          invId,
          input.source_type,
          input.quantity,
          now.toISOString(),
          input.actor_user_id || null,
          input.sync_id || null,
          JSON.stringify(input.metadata || {}),
        ]
      );

      const updated = await tx.query<Inventory>(`SELECT * FROM inventory WHERE id = $1`, [invId]);
      return updated.rows[0];
    });
  }

  public static async getPharmacyInventory(pharmacyId: string) {
    const res = await db.query(
      `SELECT i.*, m.generic_name, m.brand_name, m.strength_value, m.strength_unit, m.formulation, m.prescription_required
       FROM inventory i
       JOIN medicines m ON m.id = i.medicine_id
       WHERE i.pharmacy_id = $1 AND i.status = 'ACTIVE'
       ORDER BY m.generic_name ASC`,
      [pharmacyId]
    );

    return res.rows.map((row) => {
      const evaluation = AvailabilityEngine.evaluate({
        sourceType: row.source_type,
        observedQuantity: row.observed_quantity,
        reservedQuantity: row.reserved_quantity,
        observedAt: row.observed_at,
        confirmedAt: row.confirmed_at,
      });

      return {
        ...row,
        evaluation,
        freshness_label: evaluation.freshnessLabel,
        confidence_level: evaluation.confidenceLevel,
        customer_status: evaluation.customerCopy,
      };
    });
  }
}
