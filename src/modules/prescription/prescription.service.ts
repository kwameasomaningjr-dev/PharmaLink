import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../../database/connection.js';
import { Prescription, PrescriptionStatus } from '../../common/types.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationService } from '../notification/notification.service.js';

export interface UploadPrescriptionInput {
  order_id: string;
}

const allowedFileTypes = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
]);

function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR || './uploads');
}

function hasExpectedSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}

export interface ReviewPrescriptionInput {
  status: PrescriptionStatus;
  review_note?: string;
}

export class PrescriptionService {
  public static async uploadPrescriptionFile(
    customerId: string,
    orderId: string,
    file: { buffer: Buffer; mimetype: string; size: number }
  ): Promise<Prescription> {
    if (!orderId || !file) throw new ValidationError('Order ID and prescription file are required.');

    const extension = allowedFileTypes.get(file.mimetype);
    if (!extension || file.size <= 0 || file.size > 5 * 1024 * 1024 || !hasExpectedSignature(file.buffer, file.mimetype)) {
      throw new ValidationError('Prescription must be a valid PDF, JPEG, or PNG file smaller than 5 MB.');
    }

    // Verify order exists and belongs to customer
    const orderRes = await db.query(
      `SELECT * FROM orders WHERE id = $1 AND customer_id = $2`,
      [orderId, customerId]
    );

    if (orderRes.rowCount === 0) {
      throw new NotFoundError('Order');
    }

    const prescriptionId = uuidv4();
    const filename = `${prescriptionId}.${extension}`;
    const storageKey = `prescriptions/${filename}`;
    const directory = path.join(uploadRoot(), 'prescriptions');
    const filePath = path.join(directory, filename);

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, file.buffer, { flag: 'wx' });

    try {
      await db.query(
        `INSERT INTO prescriptions (
          id, order_id, customer_id, storage_key, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'UPLOADED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [prescriptionId, orderId, customerId, storageKey]
      );

      await AuditService.recordEvent({
        actorUserId: customerId,
        pharmacyId: orderRes.rows[0].pharmacy_id,
        eventType: 'PRESCRIPTION_UPLOADED',
        entityType: 'PRESCRIPTION',
        entityId: prescriptionId,
        metadata: { order_id: orderId, mime_type: file.mimetype, size_bytes: file.size },
      });
    } catch (err) {
      await fs.unlink(filePath).catch(() => undefined);
      throw err;
    }

    return (await db.query<Prescription>(`SELECT * FROM prescriptions WHERE id = $1`, [prescriptionId])).rows[0];
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

    if (userRole === 'PLATFORM_OPS') {
      throw new ForbiddenError('Platform operations cannot access prescription files or records.');
    }

    if (userRole === 'CUSTOMER' && prescription.customer_id !== actorUserId) {
      throw new ForbiddenError('You can only view your own prescriptions.');
    }
    if ((userRole === 'PHARMACY_ADMIN' || userRole === 'PHARMACY_STAFF') && orderPharmacyId !== pharmacyId) {
      throw new ForbiddenError('You can only view prescriptions for orders directed to your pharmacy.');
    }

    return prescription;
  }

  public static async getPrescriptionFile(
    prescriptionId: string,
    actorUserId: string,
    userRole: string,
    pharmacyId?: string
  ) {
    const prescription = await this.getPrescriptionById(prescriptionId, actorUserId, userRole, pharmacyId);
    if (!/^prescriptions\/[0-9a-f-]+\.(pdf|jpg|png)$/i.test(prescription.storage_key)) {
      throw new NotFoundError('Prescription file');
    }

    const root = uploadRoot();
    const filePath = path.resolve(root, prescription.storage_key.replaceAll('/', path.sep));
    if (!filePath.startsWith(`${root}${path.sep}`)) throw new ForbiddenError('Invalid prescription file path.');

    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundError('Prescription file');
    }

    const extension = path.extname(filePath).toLowerCase();
    const mimeType = extension === '.pdf' ? 'application/pdf' : extension === '.png' ? 'image/png' : 'image/jpeg';
    return { filePath, mimeType };
  }

  public static async listPendingForPharmacy(pharmacyId?: string) {
    const res = await db.query(
      `SELECT p.*, o.order_number, o.pharmacy_id, o.customer_id,
              u.first_name AS customer_first_name, u.last_name AS customer_last_name
       FROM prescriptions p
       JOIN orders o ON o.id = p.order_id
       JOIN users u ON u.id = p.customer_id
       WHERE ($1::uuid IS NULL OR o.pharmacy_id = $1)
         AND p.status IN ('UPLOADED', 'UNDER_REVIEW')
       ORDER BY p.created_at ASC
       LIMIT 100`,
      [pharmacyId || null]
    );

    return res.rows;
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
      channel: 'IN_APP',
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
