import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import { Prescription, PrescriptionStatus } from '../../common/types.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationService } from '../notification/notification.service.js';

export interface UploadPrescriptionInput {
  order_id: string;
  storage_key: string;
}

export interface ReviewPrescriptionInput {
  status: PrescriptionStatus;
  review_note?: string;
}

export class PrescriptionService {
  public static async uploadPrescription(
    customerId: string,
    input: UploadPrescriptionInput
  ): Promise<Prescription> {
    if (!input.order_id || !input.storage_key) {
      throw new ValidationError('Order ID and storage key are required.');
    }

    // Verify order exists and belongs to customer
    const orderRes = await db.query(
      `SELECT * FROM orders WHERE id = $1 AND customer_id = $2`,
      [input.order_id, customerId]
    );

    if (orderRes.rowCount === 0) {
      throw new NotFoundError('Order');
    }

    const prescriptionId = uuidv4();
    await db.query(
      `INSERT INTO prescriptions (
        id, order_id, customer_id, storage_key, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'UPLOADED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [prescriptionId, input.order_id, customerId, input.storage_key]
    );

    await AuditService.recordEvent({
      actorUserId: customerId,
      pharmacyId: orderRes.rows[0].pharmacy_id,
      eventType: 'PRESCRIPTION_UPLOADED',
      entityType: 'PRESCRIPTION',
      entityId: prescriptionId,
      metadata: { order_id: input.order_id },
    });

    const res = await db.query<Prescription>(`SELECT * FROM prescriptions WHERE id = $1`, [
      prescriptionId,
    ]);
    return res.rows[0];
  }

  public static async getPrescriptionById(
    prescriptionId: string,
    actorUserId: string,
    userRole: string,
    pharmacyId?: string
  ): Promise<Prescription> {
    const res = await db.query<Prescription>(
      `SELECT p.*, o.pharmacy_id
       FROM prescriptions p
       JOIN orders o ON o.id = p.order_id
       WHERE p.id = $1`,
      [prescriptionId]
    );

    if (res.rowCount === 0) {
      throw new NotFoundError('Prescription');
    }

    const prescription = res.rows[0];
    const orderPharmacyId = (prescription as any).pharmacy_id;

    if (userRole === 'CUSTOMER' && prescription.customer_id !== actorUserId) {
      throw new ForbiddenError('You can only view your own prescriptions.');
    }
    if ((userRole === 'PHARMACY_ADMIN' || userRole === 'PHARMACY_STAFF') && orderPharmacyId !== pharmacyId) {
      throw new ForbiddenError('You can only view prescriptions for orders directed to your pharmacy.');
    }

    return prescription;
  }

  public static async reviewPrescription(
    prescriptionId: string,
    pharmacistUserId: string,
    pharmacyId: string,
    input: ReviewPrescriptionInput
  ): Promise<Prescription> {
    const validStatuses: PrescriptionStatus[] = ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CLARIFICATION_REQUIRED'];
    if (!validStatuses.includes(input.status)) {
      throw new ValidationError(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    const presRes = await db.query(
      `SELECT p.*, o.pharmacy_id, o.customer_id
       FROM prescriptions p
       JOIN orders o ON o.id = p.order_id
       WHERE p.id = $1`,
      [prescriptionId]
    );

    if (presRes.rowCount === 0) {
      throw new NotFoundError('Prescription');
    }

    const item = presRes.rows[0];
    if (item.pharmacy_id !== pharmacyId) {
      throw new ForbiddenError('You can only review prescriptions for your pharmacy.');
    }

    await db.query(
      `UPDATE prescriptions SET
        status = $1,
        reviewed_by = $2,
        review_note = $3,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [input.status, pharmacistUserId, input.review_note || null, prescriptionId]
    );

    await AuditService.recordEvent({
      actorUserId: pharmacistUserId,
      pharmacyId,
      eventType: `PRESCRIPTION_${input.status}`,
      entityType: 'PRESCRIPTION',
      entityId: prescriptionId,
      metadata: { review_note: input.review_note },
    });

    await NotificationService.queueNotification({
      userId: item.customer_id,
      type: `PRESCRIPTION_${input.status}`,
      channel: 'SMS',
      referenceType: 'PRESCRIPTION',
      referenceId: prescriptionId,
    });

    return (await db.query<Prescription>(`SELECT * FROM prescriptions WHERE id = $1`, [prescriptionId])).rows[0];
  }

  /**
   * Verifies if all prescription-required items in an order have approved prescriptions.
   */
  public static async checkPrescriptionApproval(orderId: string): Promise<boolean> {
    const res = await db.query(
      `SELECT COUNT(*) as unapproved_count
       FROM order_items oi
       JOIN medicines m ON m.id = oi.medicine_id
       LEFT JOIN prescriptions p ON p.order_id = oi.order_id AND p.status = 'APPROVED'
       WHERE oi.order_id = $1
         AND m.prescription_required = true
         AND p.id IS NULL`,
      [orderId]
    );

    return Number(res.rows[0].unapproved_count) === 0;
  }
}
