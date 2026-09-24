import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import { User, UserRole } from '../../common/types.js';
import { ValidationError, UnauthorizedError, ConflictError } from '../../common/errors.js';
import { generateToken, AuthUser } from '../../common/middleware.js';
import { AuditService } from '../audit/audit.service.js';

export interface RegisterInput {
  email?: string;
  phone?: string;
  password: string;
  first_name: string;
  last_name?: string;
  role?: UserRole;
  pharmacy_id?: string;
}

export interface LoginInput {
  identifier: string; // email or phone
  password: string;
}

export class AuthService {
  public static async register(input: RegisterInput): Promise<{ user: Partial<User>; token: string }> {
    if (!input.email && !input.phone) {
      throw new ValidationError('At least an email address or phone number is required.');
    }
    if (!input.password || input.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long.');
    }
    if (!input.first_name || input.first_name.trim() === '') {
      throw new ValidationError('First name is required.');
    }

    // Check existing
    if (input.email) {
      const exist = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [input.email]);
      if (exist.rowCount > 0) {
        throw new ConflictError('USER_EXISTS', 'A user with this email address already exists.');
      }
    }
    if (input.phone) {
      const existPhone = await db.query('SELECT id FROM users WHERE phone = $1', [input.phone]);
      if (existPhone.rowCount > 0) {
        throw new ConflictError('USER_EXISTS', 'A user with this phone number already exists.');
      }
    }

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(input.password, 10);
    const role: UserRole = input.role || 'CUSTOMER';

    await db.query(
      `INSERT INTO users (id, email, phone, password_hash, role, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')`,
      [
        userId,
        input.email?.toLowerCase().trim() || null,
        input.phone?.trim() || null,
        passwordHash,
        role,
        input.first_name.trim(),
        input.last_name?.trim() || null,
      ]
    );

    let pharmacyRole: 'ADMIN' | 'STAFF' | undefined;
    if (input.pharmacy_id && (role === 'PHARMACY_ADMIN' || role === 'PHARMACY_STAFF')) {
      pharmacyRole = role === 'PHARMACY_ADMIN' ? 'ADMIN' : 'STAFF';
      await db.query(
        `INSERT INTO pharmacy_users (id, pharmacy_id, user_id, role, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')`,
        [uuidv4(), input.pharmacy_id, userId, pharmacyRole]
      );
    }

    await AuditService.recordEvent({
      actorUserId: userId,
      pharmacyId: input.pharmacy_id || null,
      eventType: 'USER_REGISTERED',
      entityType: 'USER',
      entityId: userId,
      metadata: { role, email: input.email },
    });

    const authUser: AuthUser = {
      id: userId,
      email: input.email || null,
      phone: input.phone || null,
      role,
      first_name: input.first_name,
      last_name: input.last_name || null,
      pharmacy_id: input.pharmacy_id,
      pharmacy_role: pharmacyRole,
    };

    const token = generateToken(authUser);

    return {
      user: {
        id: userId,
        email: input.email || null,
        phone: input.phone || null,
        role,
        first_name: input.first_name,
        last_name: input.last_name || null,
        status: 'ACTIVE',
      },
      token,
    };
  }

  public static async login(input: LoginInput): Promise<{ user: Partial<User>; pharmacy?: any; token: string }> {
    if (!input.identifier || !input.password) {
      throw new ValidationError('Email/phone and password are required.');
    }

    const identifier = input.identifier.trim();
    const isEmail = identifier.includes('@');
    const param = isEmail ? identifier.toLowerCase() : identifier;
    const sql = isEmail
      ? `SELECT id, email, phone, password_hash, role, first_name, last_name, status FROM users WHERE email = $1`
      : `SELECT id, email, phone, password_hash, role, first_name, last_name, status FROM users WHERE phone = $1`;
    const userRes = await db.query(sql, [param]);

    if (userRes.rowCount === 0) {
      throw new UnauthorizedError('Invalid email/phone or password.');
    }

    const row = userRes.rows[0];
    const match = await bcrypt.compare(input.password, row.password_hash);
    if (!match) {
      throw new UnauthorizedError('Invalid email/phone or password.');
    }

    if (row.status !== 'ACTIVE') {
      throw new UnauthorizedError('Your account has been suspended or deactivated.');
    }

    let pharmacyInfo: any = null;
    if (row.role === 'PHARMACY_ADMIN' || row.role === 'PHARMACY_STAFF') {
      const pRes = await db.query(
        `SELECT pu.pharmacy_id, pu.role as pharmacy_staff_role, p.display_name as pharmacy_name, p.verification_status as pharmacy_verification_status
         FROM pharmacy_users pu
         JOIN pharmacies p ON p.id = pu.pharmacy_id
         WHERE pu.user_id = $1 AND pu.status = 'ACTIVE' LIMIT 1`,
        [row.id]
      );
      if (pRes.rowCount > 0) {
        pharmacyInfo = pRes.rows[0];
      }
    }

    const authUser: AuthUser = {
      id: row.id,
      email: row.email,
      phone: row.phone,
      role: row.role,
      first_name: row.first_name,
      last_name: row.last_name,
      pharmacy_id: pharmacyInfo?.pharmacy_id || undefined,
      pharmacy_role: pharmacyInfo?.pharmacy_staff_role || undefined,
    };

    const token = generateToken(authUser);

    await AuditService.recordEvent({
      actorUserId: row.id,
      pharmacyId: pharmacyInfo?.pharmacy_id || null,
      eventType: 'USER_LOGIN',
      entityType: 'USER',
      entityId: row.id,
    });

    return {
      user: {
        id: row.id,
        email: row.email,
        phone: row.phone,
        role: row.role,
        first_name: row.first_name,
        last_name: row.last_name,
        status: row.status,
      },
      pharmacy: pharmacyInfo
        ? {
            id: pharmacyInfo.pharmacy_id,
            display_name: pharmacyInfo.pharmacy_name,
            verification_status: pharmacyInfo.pharmacy_verification_status,
            role: pharmacyInfo.pharmacy_staff_role,
          }
        : undefined,
      token,
    };
  }

  public static async getMe(userId: string) {
    const res = await db.query(
      `SELECT u.id, u.email, u.phone, u.role, u.first_name, u.last_name, u.status,
              pu.pharmacy_id, pu.role as pharmacy_staff_role, p.display_name as pharmacy_name, p.verification_status as pharmacy_verification_status
       FROM users u
       LEFT JOIN pharmacy_users pu ON pu.user_id = u.id AND pu.status = 'ACTIVE'
       LEFT JOIN pharmacies p ON p.id = pu.pharmacy_id
       WHERE u.id = $1`,
      [userId]
    );

    if (res.rowCount === 0) {
      throw new UnauthorizedError('User not found.');
    }

    const row = res.rows[0];
    return {
      user: {
        id: row.id,
        email: row.email,
        phone: row.phone,
        role: row.role,
        first_name: row.first_name,
        last_name: row.last_name,
        status: row.status,
      },
      pharmacy: row.pharmacy_id
        ? {
            id: row.pharmacy_id,
            display_name: row.pharmacy_name,
            verification_status: row.pharmacy_verification_status,
            role: row.pharmacy_staff_role,
          }
        : null,
    };
  }
}
