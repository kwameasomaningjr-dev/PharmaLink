import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../../database/connection.js';
import {
  ComplianceDocumentType,
  ComplianceReviewStatus,
  PharmacyComplianceDocument,
  UserRole,
} from '../../common/types.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../common/errors.js';
import { AuditService } from '../audit/audit.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_DOCUMENT_TYPES: ComplianceDocumentType[] = [
  'FDA_LICENSE',
  'PCG_CERTIFICATE',
  'SUPERINTENDENT_ID',
];

const ALLOWED_MIME_TYPES = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the base upload directory.
 * Compliance files are stored under `uploads/compliance/` — never in the public web root.
 */
function uploadRoot(): string {
  if (process.env.UPLOAD_DIR) return path.resolve(process.env.UPLOAD_DIR);
  if (
    process.env.VERCEL ||
    process.env.NODE_ENV === 'production' ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  ) {
    return '/tmp/uploads';
  }
  return path.resolve('./uploads');
}

/**
 * Validates file magic bytes against declared MIME type to prevent content-type spoofing.
 */
function hasMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 5) return false;
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString().startsWith('%PDF-');
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (mimeType === 'image/png')
    return buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return false;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ComplianceService {
  /**
   * Uploads a compliance document for a pharmacy.
   * File is written to disk with a UUID-based key; DB record links pharmacy to the key.
   */
  public static async uploadDocument(
    pharmacyId: string,
    actorUserId: string,
    documentType: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string; size: number }
  ): Promise<PharmacyComplianceDocument> {
    if (!ALLOWED_DOCUMENT_TYPES.includes(documentType as ComplianceDocumentType)) {
      throw new ValidationError(
        `document_type must be one of: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`
      );
    }
    const extension = ALLOWED_MIME_TYPES.get(file.mimetype);
    if (!extension) {
      throw new ValidationError('Compliance document must be a PDF, JPEG, or PNG file.');
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError('File must be greater than 0 bytes and no larger than 10 MB.');
    }
    if (!hasMagicBytes(file.buffer, file.mimetype)) {
      throw new ValidationError('File content does not match declared MIME type.');
    }

    const docId = uuidv4();
    const storageKey = `compliance/${pharmacyId}/${docId}.${extension}`;
    const directory = path.join(uploadRoot(), 'compliance', pharmacyId);
    const filePath = path.join(directory, `${docId}.${extension}`);

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, file.buffer, { flag: 'wx' });

    try {
      await db.query(
        `INSERT INTO pharmacy_compliance_documents
           (id, pharmacy_id, document_type, storage_key, original_filename,
            file_size_bytes, mime_type, uploaded_by, review_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')`,
        [
          docId,
          pharmacyId,
          documentType,
          storageKey,
          file.originalname || null,
          file.size,
          file.mimetype,
          actorUserId,
        ]
      );
    } catch (err) {
      // Roll back the file write if the DB insert fails to avoid orphaned files.
      await fs.unlink(filePath).catch(() => {});
      throw err;
    }

    await AuditService.recordEvent({
      actorUserId,
      pharmacyId,
      eventType: 'COMPLIANCE_DOCUMENT_UPLOADED',
      entityType: 'PHARMACY_COMPLIANCE_DOCUMENT',
      entityId: docId,
      metadata: { document_type: documentType, file_size_bytes: file.size },
    });

    return (await this.getDocumentById(docId, pharmacyId))!;
  }

  /**
   * Fetches a single compliance document record.
   * Scopes to pharmacyId when provided for access control.
   */
  public static async getDocumentById(
    docId: string,
    pharmacyId?: string
  ): Promise<PharmacyComplianceDocument | null> {
    const params: any[] = [docId];
    let where = 'WHERE id = $1';
    if (pharmacyId) {
      params.push(pharmacyId);
      where += ' AND pharmacy_id = $2';
    }
    const res = await db.query(
      `SELECT * FROM pharmacy_compliance_documents ${where}`,
      params
    );
    return res.rowCount > 0 ? (res.rows[0] as PharmacyComplianceDocument) : null;
  }

  /**
   * Lists all compliance documents for a specific pharmacy (most recent first).
   */
  public static async listDocumentsForPharmacy(
    pharmacyId: string
  ): Promise<PharmacyComplianceDocument[]> {
    const res = await db.query(
      `SELECT * FROM pharmacy_compliance_documents
       WHERE pharmacy_id = $1
       ORDER BY created_at DESC`,
      [pharmacyId]
    );
    return res.rows as PharmacyComplianceDocument[];
  }

  /**
   * Lists all PENDING compliance documents across all pharmacies (PLATFORM_OPS dashboard).
   * Returns pharmacy context alongside document metadata.
   */
  public static async listPendingDocuments(): Promise<any[]> {
    const res = await db.query(
      `SELECT pcd.*,
              p.display_name  AS pharmacy_name,
              p.license_number,
              p.verification_status AS pharmacy_verification_status
       FROM pharmacy_compliance_documents pcd
       JOIN pharmacies p ON p.id = pcd.pharmacy_id
       WHERE pcd.review_status = 'PENDING'
       ORDER BY pcd.created_at ASC`
    );
    return res.rows;
  }

  /**
   * Records an OPS review decision on a compliance document.
   * Rejections MUST include a review_note explaining the reason.
   */
  public static async reviewDocument(
    docId: string,
    actorUserId: string,
    reviewStatus: string,
    reviewNote?: string
  ): Promise<PharmacyComplianceDocument> {
    const allowedStatuses: ComplianceReviewStatus[] = ['APPROVED', 'REJECTED'];
    if (!allowedStatuses.includes(reviewStatus as ComplianceReviewStatus)) {
      throw new ValidationError('review_status must be APPROVED or REJECTED.');
    }
    if (reviewStatus === 'REJECTED' && !reviewNote?.trim()) {
      throw new ValidationError(
        'A review_note explaining the rejection reason is required.'
      );
    }

    const existing = await this.getDocumentById(docId);
    if (!existing) throw new NotFoundError('Compliance document');

    await db.query(
      `UPDATE pharmacy_compliance_documents
       SET review_status = $1, reviewed_by = $2, review_note = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [reviewStatus, actorUserId, reviewNote?.trim() || null, docId]
    );

    await AuditService.recordEvent({
      actorUserId,
      pharmacyId: existing.pharmacy_id,
      eventType: 'COMPLIANCE_DOCUMENT_REVIEWED',
      entityType: 'PHARMACY_COMPLIANCE_DOCUMENT',
      entityId: docId,
      metadata: {
        previous_status: existing.review_status,
        new_status: reviewStatus,
        review_note: reviewNote || null,
        document_type: existing.document_type,
      },
    });

    return (await this.getDocumentById(docId))!;
  }

  /**
   * Returns the resolved file path and MIME type for streaming a compliance document.
   * PLATFORM_OPS can access any document; pharmacy staff can only access their own.
   */
  public static async streamDocumentFile(
    docId: string,
    actorUserId: string,
    role: UserRole,
    actorPharmacyId?: string
  ): Promise<{ filePath: string; mimeType: string }> {
    const doc = await this.getDocumentById(docId);
    if (!doc) throw new NotFoundError('Compliance document');

    // Strict access control: PLATFORM_OPS sees all; ADMIN sees only their own pharmacy.
    if (role !== 'PLATFORM_OPS' && doc.pharmacy_id !== actorPharmacyId) {
      throw new ForbiddenError('Access denied to this document');
    }

    const filePath = path.join(uploadRoot(), doc.storage_key);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundError('Document file not found on storage');
    }

    return { filePath, mimeType: doc.mime_type || 'application/octet-stream' };
  }
}
