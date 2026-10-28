import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import { Pharmacy, PharmacyVerificationStatus } from '../../common/types.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { calculateDistanceKm } from '../../common/geo.js';

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
  superintendent_name?: string;
  superintendent_phone?: string;
  pcg_number?: string;
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
        opening_hours, fulfillment_options,
        superintendent_name, superintendent_phone, pcg_number
      ) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
        input.superintendent_name?.trim() || null,
        input.superintendent_phone?.trim() || null,
        input.pcg_number?.trim() || null,
      ]
    );

    // Keep the applicant separate from active pharmacy staff until verification.
    await db.query(
      `INSERT INTO pharmacy_users (id, pharmacy_id, user_id, role, status)
       VALUES ($1, $2, $3, 'ADMIN', 'INVITED')
       ON CONFLICT (pharmacy_id, user_id) DO NOTHING`,
      [uuidv4(), pharmacyId, creatorUserId]
    );

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
    const superintendent_name = updates.superintendent_name !== undefined ? updates.superintendent_name : existing.superintendent_name;
    const superintendent_phone = updates.superintendent_phone !== undefined ? updates.superintendent_phone : existing.superintendent_phone;
    const pcg_number = updates.pcg_number !== undefined ? updates.pcg_number : existing.pcg_number;
    const verification_status = updates.verification_status ?? existing.verification_status;

    await db.query(
      `UPDATE pharmacies SET
        legal_name = $1, display_name = $2, license_number = $3, address_line = $4,
        city = $5, region = $6, latitude = $7, longitude = $8, phone = $9, email = $10,
        opening_hours = $11, fulfillment_options = $12, verification_status = $13,
        superintendent_name = $14, superintendent_phone = $15, pcg_number = $16,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $17`,
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
        superintendent_name,
        superintendent_phone,
        pcg_number,
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

  public static async listPharmacies(verificationStatus = 'VERIFIED', userLat?: number, userLng?: number) {
    const res = await db.query(
      `SELECT p.id, p.legal_name, p.display_name, p.license_number, p.address_line, p.city, p.region,
              p.latitude, p.longitude, p.phone, p.email, p.fulfillment_options, p.opening_hours,
              p.verification_status, p.created_at, p.updated_at,
              COALESCE(COUNT(DISTINCT CASE WHEN i.status = 'ACTIVE' THEN i.medicine_id END), 0)::int as active_inventory_count
       FROM pharmacies p
       LEFT JOIN inventory i ON i.pharmacy_id = p.id
       WHERE p.verification_status = $1
       GROUP BY p.id
       ORDER BY p.display_name ASC`,
      [verificationStatus]
    );

    const items = res.rows.map((row) => {
      const fulfillment_options = typeof row.fulfillment_options === 'string'
        ? JSON.parse(row.fulfillment_options)
        : (row.fulfillment_options || { pickup: true, delivery: false });

      const opening_hours = typeof row.opening_hours === 'string'
        ? JSON.parse(row.opening_hours)
        : (row.opening_hours || {});

      let distance_km: number | null = null;
      if (userLat !== undefined && userLng !== undefined && row.latitude !== null && row.longitude !== null) {
        distance_km = calculateDistanceKm(
          Number(userLat),
          Number(userLng),
          Number(row.latitude),
          Number(row.longitude)
        );
      }

      return {
        ...row,
        latitude: row.latitude !== null ? Number(row.latitude) : null,
        longitude: row.longitude !== null ? Number(row.longitude) : null,
        fulfillment_options,
        opening_hours,
        distance_km,
        active_inventory_count: Number(row.active_inventory_count || 0),
      };
    });

    if (userLat !== undefined && userLng !== undefined) {
      items.sort((a, b) => {
        if (a.distance_km === null) return 1;
        if (b.distance_km === null) return -1;
        return a.distance_km - b.distance_km;
      });
    }

    return items;
  }

  public static async listAllPharmacies(verificationStatus?: PharmacyVerificationStatus) {
    const params: string[] = [];
    let where = '';
    if (verificationStatus) {
      params.push(verificationStatus);
      where = 'WHERE verification_status = $1';
    }

    const res = await db.query(
      `SELECT id, legal_name, display_name, license_number, address_line, city, region,
              latitude, longitude, phone, email, fulfillment_options, opening_hours,
              verification_status, created_at, updated_at
       FROM pharmacies
       ${where}
       ORDER BY updated_at DESC, display_name ASC`,
      params
    );
    return res.rows;
  }

  public static async updateVerificationStatus(
    pharmacyId: string,
    verificationStatus: PharmacyVerificationStatus,
    actorUserId: string
  ): Promise<Pharmacy> {
    const pharmacy = await this.getPharmacyById(pharmacyId);
    if (!pharmacy) throw new NotFoundError('Pharmacy');

    const allowedStatuses: PharmacyVerificationStatus[] = ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'];
    if (!allowedStatuses.includes(verificationStatus)) {
      throw new ValidationError('Invalid pharmacy verification status.');
    }

    await db.query(
      `UPDATE pharmacies
       SET verification_status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [verificationStatus, pharmacyId]
    );

    await AuditService.recordEvent({
      actorUserId,
      pharmacyId,
      eventType: 'PHARMACY_VERIFICATION_UPDATED',
      entityType: 'PHARMACY',
      entityId: pharmacyId,
      metadata: {
        previous_status: pharmacy.verification_status,
        new_status: verificationStatus,
      },
    });

    return (await this.getPharmacyById(pharmacyId))!;
  }

  // =========================================================================
  // Staff Management (PHARMACY_ADMIN only)
  // =========================================================================

  /**
   * Lists all staff members associated with a pharmacy, including their user details.
   */
  public static async listPharmacyStaff(pharmacyId: string): Promise<any[]> {
    const res = await db.query(
      `SELECT pu.id, pu.user_id, pu.role AS pharmacy_role, pu.status AS staff_status,
              pu.created_at,
              u.first_name, u.last_name, u.email, u.phone, u.status AS user_status
       FROM pharmacy_users pu
       JOIN users u ON u.id = pu.user_id
       WHERE pu.pharmacy_id = $1
       ORDER BY pu.role ASC, u.first_name ASC`,
      [pharmacyId]
    );
    return res.rows;
  }

  /**
   * Invites a new staff member to a pharmacy.
   * If a user with the given email already exists, they are linked to the pharmacy.
   * Otherwise, a new INVITED user account is created with a random unusable password
   * — they must complete onboarding (e.g., password-reset link) before they can log in.
   */
  public static async inviteStaff(
    pharmacyId: string,
    adminUserId: string,
    input: {
      email?: string;
      phone?: string;
      first_name: string;
      last_name?: string;
      role?: 'ADMIN' | 'STAFF';
    }
  ): Promise<any> {
    if (!input.email && !input.phone) {
      throw new ValidationError('Email or phone number is required to invite a staff member.');
    }
    if (!input.first_name?.trim()) {
      throw new ValidationError('First name is required.');
    }

    const role: 'ADMIN' | 'STAFF' = input.role === 'ADMIN' ? 'ADMIN' : 'STAFF';
    const cleanEmail = input.email ? input.email.toLowerCase().trim() : null;
    const cleanPhone = input.phone?.trim() || null;

    // Check if user already exists in the platform
    let userId: string | null = null;
    if (cleanEmail) {
      const existing = await db.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
        [cleanEmail]
      );
      if (existing.rowCount > 0) userId = existing.rows[0].id;
    }
    if (!userId && cleanPhone) {
      const existing = await db.query(
        `SELECT id FROM users WHERE phone = $1`,
        [cleanPhone]
      );
      if (existing.rowCount > 0) userId = existing.rows[0].id;
    }

    if (!userId) {
      // Create a placeholder INVITED account. The raw password is a secure random
      // UUID hash — the user cannot log in until they complete the invite flow.
      userId = uuidv4();
      const bcrypt = await import('bcryptjs');
      const tempHash = await bcrypt.default.hash(uuidv4(), 8);
      await db.query(
        `INSERT INTO users (id, email, phone, password_hash, role, first_name, last_name, status)
         VALUES ($1, $2, $3, $4, 'PHARMACY_STAFF', $5, $6, 'INVITED')`,
        [
          userId,
          cleanEmail,
          cleanPhone,
          tempHash,
          input.first_name.trim(),
          input.last_name?.trim() || null,
        ]
      );
    }

    // Link to pharmacy (upsert: if already linked, refresh role + status)
    await db.query(
      `INSERT INTO pharmacy_users (id, pharmacy_id, user_id, role, status)
       VALUES ($1, $2, $3, $4, 'INVITED')
       ON CONFLICT (pharmacy_id, user_id) DO UPDATE
         SET role = EXCLUDED.role, status = 'INVITED'`,
      [uuidv4(), pharmacyId, userId, role]
    );

    await AuditService.recordEvent({
      actorUserId: adminUserId,
      pharmacyId,
      eventType: 'STAFF_INVITED',
      entityType: 'PHARMACY_USER',
      entityId: userId,
      metadata: { role, email: cleanEmail },
    });

    return {
      user_id: userId,
      pharmacy_id: pharmacyId,
      role,
      status: 'INVITED',
      email: cleanEmail,
      phone: cleanPhone,
      first_name: input.first_name.trim(),
    };
  }

  /**
   * Updates a staff member's pharmacy role or status.
   * Prevents an admin from demoting or disabling themselves.
   */
  public static async updateStaffMember(
    pharmacyId: string,
    adminUserId: string,
    staffUserId: string,
    updates: { role?: 'ADMIN' | 'STAFF'; status?: 'ACTIVE' | 'DISABLED' }
  ): Promise<any> {
    const existing = await db.query(
      `SELECT pu.*, u.first_name, u.last_name, u.email, u.phone
       FROM pharmacy_users pu JOIN users u ON u.id = pu.user_id
       WHERE pu.pharmacy_id = $1 AND pu.user_id = $2`,
      [pharmacyId, staffUserId]
    );
    if (existing.rowCount === 0) throw new NotFoundError('Staff member');

    if (staffUserId === adminUserId) {
      if (updates.role === 'STAFF') {
        throw new ValidationError(
          'You cannot demote your own Admin role. Assign another Admin first.'
        );
      }
      if (updates.status === 'DISABLED') {
        throw new ValidationError(
          'You cannot disable your own account. Contact another Admin or Platform Ops.'
        );
      }
    }

    const newRole = updates.role ?? existing.rows[0].role;
    const newStatus = updates.status ?? existing.rows[0].status;

    await db.query(
      `UPDATE pharmacy_users SET role = $1, status = $2 WHERE pharmacy_id = $3 AND user_id = $4`,
      [newRole, newStatus, pharmacyId, staffUserId]
    );

    await AuditService.recordEvent({
      actorUserId: adminUserId,
      pharmacyId,
      eventType: 'STAFF_UPDATED',
      entityType: 'PHARMACY_USER',
      entityId: staffUserId,
      metadata: { new_role: newRole, new_status: newStatus },
    });

    const updated = await db.query(
      `SELECT pu.id, pu.user_id, pu.role AS pharmacy_role, pu.status AS staff_status,
              u.first_name, u.last_name, u.email, u.phone
       FROM pharmacy_users pu JOIN users u ON u.id = pu.user_id
       WHERE pu.pharmacy_id = $1 AND pu.user_id = $2`,
      [pharmacyId, staffUserId]
    );
    return updated.rows[0];
  }

  /**
   * Removes a staff member from a pharmacy.
   * An admin cannot remove themselves.
   */
  public static async removeStaffMember(
    pharmacyId: string,
    adminUserId: string,
    staffUserId: string
  ): Promise<void> {
    if (staffUserId === adminUserId) {
      throw new ValidationError(
        'You cannot remove yourself from the pharmacy. Transfer Admin rights first.'
      );
    }
    const existing = await db.query(
      `SELECT id FROM pharmacy_users WHERE pharmacy_id = $1 AND user_id = $2`,
      [pharmacyId, staffUserId]
    );
    if (existing.rowCount === 0) throw new NotFoundError('Staff member');

    await db.query(
      `DELETE FROM pharmacy_users WHERE pharmacy_id = $1 AND user_id = $2`,
      [pharmacyId, staffUserId]
    );

    await AuditService.recordEvent({
      actorUserId: adminUserId,
      pharmacyId,
      eventType: 'STAFF_REMOVED',
      entityType: 'PHARMACY_USER',
      entityId: staffUserId,
      metadata: {},
    });
  }
}

