import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import { Pharmacy, PharmacyVerificationStatus } from '../../common/types.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../common/errors.js';
import { AuditService } from '../audit/audit.service.js';

export interface CreatePharmacyInput {
  legal_name: string;
  display_name: string;
  license_number?: string;
  address_line: string;
  city: string;
  region: string;
  latitude: number;
  longitude: number;
  phone: string;
  email?: string;
  opening_hours?: Record<string, any>;
  fulfillment_options?: {
    pickup: boolean;
    delivery: boolean;
    delivery_base_fee_minor?: number;
    delivery_radius_km?: number;
    response_window_minutes?: number;
  };
}

export class PharmacyService {
  public static async createPharmacy(input: CreatePharmacyInput, creatorUserId: string): Promise<Pharmacy> {
    if (!input.legal_name || !input.display_name || !input.address_line || !input.city || !input.region || !input.phone) {
      throw new ValidationError('Legal name, display name, address, city, region and phone are required.');
    }
    if (input.latitude === undefined || input.longitude === undefined) {
      throw new ValidationError('Coordinates (latitude and longitude) are required.');
    }

    const pharmacyId = uuidv4();
    const defaultHours = input.opening_hours || {
      mon_fri: '08:00 - 20:00',
      saturday: '08:00 - 18:00',
      sunday: 'Closed',
    };
    const defaultFulfillment = input.fulfillment_options || {
      pickup: true,
      delivery: false,
      delivery_base_fee_minor: 0,
      delivery_radius_km: 0,
      response_window_minutes: 15,
    };

    await db.query(
      `INSERT INTO pharmacies (
        id, legal_name, display_name, license_number, verification_status,
        address_line, city, region, latitude, longitude, phone, email,
        opening_hours, fulfillment_options
      ) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        pharmacyId,
        input.legal_name.trim(),
        input.display_name.trim(),
        input.license_number?.trim() || null,
        input.address_line.trim(),
        input.city.trim(),
        input.region.trim(),
        input.latitude,
        input.longitude,
        input.phone.trim(),
        input.email?.trim() || null,
        JSON.stringify(defaultHours),
        JSON.stringify(defaultFulfillment),
      ]
    );

    // Link creator as ADMIN
    await db.query(
      `INSERT INTO pharmacy_users (id, pharmacy_id, user_id, role, status)
       VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE')
       ON CONFLICT (pharmacy_id, user_id) DO NOTHING`,
      [uuidv4(), pharmacyId, creatorUserId]
    );

    // Update user role to PHARMACY_ADMIN if needed
    await db.query(`UPDATE users SET role = 'PHARMACY_ADMIN' WHERE id = $1 AND role = 'CUSTOMER'`, [creatorUserId]);

    await AuditService.recordEvent({
      actorUserId: creatorUserId,
      pharmacyId,
      eventType: 'PHARMACY_ONBOARDED',
      entityType: 'PHARMACY',
      entityId: pharmacyId,
      metadata: { display_name: input.display_name },
    });

    return (await this.getPharmacyById(pharmacyId))!;
  }

  public static async getPharmacyById(id: string): Promise<Pharmacy | null> {
    const res = await db.query(`SELECT * FROM pharmacies WHERE id = $1`, [id]);
    if (res.rowCount === 0) return null;
    return res.rows[0];
  }

  public static async updatePharmacy(
    pharmacyId: string,
    updates: Partial<CreatePharmacyInput> & { verification_status?: PharmacyVerificationStatus },
    actorUserId: string
  ): Promise<Pharmacy> {
    const existing = await this.getPharmacyById(pharmacyId);
    if (!existing) {
      throw new NotFoundError('Pharmacy');
    }

    const legal_name = updates.legal_name ?? existing.legal_name;
    const display_name = updates.display_name ?? existing.display_name;
    const license_number = updates.license_number ?? existing.license_number;
    const address_line = updates.address_line ?? existing.address_line;
    const city = updates.city ?? existing.city;
    const region = updates.region ?? existing.region;
    const latitude = updates.latitude ?? existing.latitude;
    const longitude = updates.longitude ?? existing.longitude;
    const phone = updates.phone ?? existing.phone;
    const email = updates.email ?? existing.email;
    const opening_hours = updates.opening_hours ? JSON.stringify(updates.opening_hours) : JSON.stringify(existing.opening_hours);
    const fulfillment_options = updates.fulfillment_options
      ? JSON.stringify(updates.fulfillment_options)
      : JSON.stringify(existing.fulfillment_options);
    const verification_status = updates.verification_status ?? existing.verification_status;

    await db.query(
      `UPDATE pharmacies SET
        legal_name = $1, display_name = $2, license_number = $3, address_line = $4,
        city = $5, region = $6, latitude = $7, longitude = $8, phone = $9, email = $10,
        opening_hours = $11, fulfillment_options = $12, verification_status = $13,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $14`,
      [
        legal_name,
        display_name,
        license_number,
        address_line,
        city,
        region,
        latitude,
        longitude,
        phone,
        email,
        opening_hours,
        fulfillment_options,
        verification_status,
        pharmacyId,
      ]
    );

    await AuditService.recordEvent({
      actorUserId,
      pharmacyId,
      eventType: 'PHARMACY_UPDATED',
      entityType: 'PHARMACY',
      entityId: pharmacyId,
      metadata: { updates },
    });

    return (await this.getPharmacyById(pharmacyId))!;
  }

  public static async listPharmacies(verificationStatus = 'VERIFIED') {
    const res = await db.query(
      `SELECT id, display_name, address_line, city, region, latitude, longitude, phone, fulfillment_options, opening_hours, verification_status
       FROM pharmacies
       WHERE verification_status = $1
       ORDER BY display_name ASC`,
      [verificationStatus]
    );
    return res.rows;
  }
}
