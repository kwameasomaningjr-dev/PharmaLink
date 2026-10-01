import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AppError, UnauthorizedError, ForbiddenError } from './errors.js';
import { sendError } from './response.js';
import { UserRole } from './types.js';
import { db } from '../database/connection.js';

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  first_name: string;
  last_name: string | null;
  pharmacy_id?: string;
  pharmacy_role?: 'ADMIN' | 'STAFF';
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: AuthUser;
      pharmacyId?: string;
      rawBody?: string;
    }
  }
}

const DEVELOPMENT_JWT_SECRET = 'pharmalink_dev_jwt_secret_key_change_in_production_min_32_chars';

function getJwtSecret(): string {
  return process.env.JWT_SECRET?.trim() || DEVELOPMENT_JWT_SECRET;
}

export function assertSecurityConfiguration(): void {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32 || secret === DEVELOPMENT_JWT_SECRET) {
    if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
      console.warn('[Security] Warning: JWT_SECRET should be set in production environment variables.');
    }
  }

  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (!corsOrigin || corsOrigin === '*') {
    if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
      console.warn('[Security] Warning: CORS_ORIGIN is wildcard (*).');
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const reqId = (req.headers['x-request-id'] as string) || `req_${uuidv4()}`;
  req.requestId = reqId;
  res.locals.requestId = reqId;
  res.setHeader('x-request-id', reqId);
  next();
}

export function generateToken(user: AuthUser, expiresIn = '7d'): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      pharmacy_id: user.pharmacy_id,
      pharmacy_role: user.pharmacy_role,
    },
    getJwtSecret(),
    { expiresIn: expiresIn as any }
  );
}

export async function authenticateJwt(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid Authorization header'));
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as any;
    req.user = {
      id: payload.id,
      email: payload.email,
      phone: payload.phone,
      role: payload.role,
      first_name: payload.first_name,
      last_name: payload.last_name,
      pharmacy_id: payload.pharmacy_id,
      pharmacy_role: payload.pharmacy_role,
    };

    // If pharmacy_id is not in payload or user role is pharmacy staff/admin, fetch latest association from DB
    if (!req.user.pharmacy_id && (req.user.role === 'PHARMACY_ADMIN' || req.user.role === 'PHARMACY_STAFF')) {
      const pRes = await db.query(
        `SELECT pu.pharmacy_id, pu.role as pharmacy_staff_role
         FROM pharmacy_users pu
         WHERE pu.user_id = $1 AND pu.status = 'ACTIVE' LIMIT 1`,
        [req.user.id]
      );
      if (pRes.rowCount > 0) {
        req.user.pharmacy_id = pRes.rows[0].pharmacy_id;
        req.user.pharmacy_role = pRes.rows[0].pharmacy_staff_role;
      }
    }

    if (req.user.pharmacy_id) {
      req.pharmacyId = req.user.pharmacy_id;
    }

    next();
  } catch (err) {
    return next(new UnauthorizedError('Token is invalid or expired'));
  }
}

export function optionalAuthenticateJwt(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = jwt.verify(token, getJwtSecret()) as any;
      req.user = {
        id: payload.id,
        email: payload.email,
        phone: payload.phone,
        role: payload.role,
        first_name: payload.first_name,
        last_name: payload.last_name,
        pharmacy_id: payload.pharmacy_id,
        pharmacy_role: payload.pharmacy_role,
      };
      if (payload.pharmacy_id) {
        req.pharmacyId = payload.pharmacy_id;
      }
    } catch {
      // Ignore invalid token for optional auth
    }
  }
  next();
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires one of roles: ${allowedRoles.join(', ')}`));
    }
    next();
  };
}

export async function requirePharmacyStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new UnauthorizedError());
  }

  if (req.user.role === 'PLATFORM_OPS') {
    const overrideId = (req.headers['x-pharmacy-id'] as string) || (req.body && req.body.pharmacy_id) || req.user.pharmacy_id;
    if (overrideId) req.pharmacyId = overrideId;
    return next();
  }

  if (req.user.role !== 'PHARMACY_ADMIN' && req.user.role !== 'PHARMACY_STAFF') {
    return next(new ForbiddenError('Access restricted to verified pharmacy personnel'));
  }

  // 1. Look up user's active or existing pharmacy association
  if (!req.user.pharmacy_id) {
    const pRes = await db.query(
      `SELECT pu.pharmacy_id, pu.role as pharmacy_staff_role, pu.status as staff_status
       FROM pharmacy_users pu
       WHERE pu.user_id = $1
       ORDER BY CASE WHEN pu.status = 'ACTIVE' THEN 1 ELSE 2 END
       LIMIT 1`,
      [req.user.id]
    );
    if (pRes.rowCount > 0) {
      req.user.pharmacy_id = pRes.rows[0].pharmacy_id;
      req.user.pharmacy_role = pRes.rows[0].pharmacy_staff_role;
      req.pharmacyId = req.user.pharmacy_id;
    }
  }

  // 2. Check header or body pharmacy context for admin role
  if (!req.user.pharmacy_id) {
    const candidateId = (req.headers['x-pharmacy-id'] as string) || (req.body && req.body.pharmacy_id);
    if (candidateId) {
      const pCheck = await db.query(`SELECT id FROM pharmacies WHERE id = $1`, [candidateId]);
      if (pCheck.rowCount > 0) {
        await db.query(
          `INSERT INTO pharmacy_users (id, pharmacy_id, user_id, role, status)
           VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE')
           ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET status = 'ACTIVE'`,
          [uuidv4(), candidateId, req.user.id]
        );
        req.user.pharmacy_id = candidateId;
        req.user.pharmacy_role = 'ADMIN';
        req.pharmacyId = candidateId;
      }
    }
  }

  // 3. Fallback for PHARMACY_ADMIN: associate with matching or default verified pharmacy
  if (!req.user.pharmacy_id && req.user.role === 'PHARMACY_ADMIN') {
    const firstP = await db.query(`SELECT id FROM pharmacies WHERE verification_status = 'VERIFIED' LIMIT 1`);
    if (firstP.rowCount > 0) {
      const fallbackId = firstP.rows[0].id;
      await db.query(
        `INSERT INTO pharmacy_users (id, pharmacy_id, user_id, role, status)
         VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE')
         ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET status = 'ACTIVE'`,
        [uuidv4(), fallbackId, req.user.id]
      );
      req.user.pharmacy_id = fallbackId;
      req.user.pharmacy_role = 'ADMIN';
      req.pharmacyId = fallbackId;
    }
  }

  if (!req.user.pharmacy_id) {
    return next(new ForbiddenError('No pharmacy associated with this account'));
  }

  try {
    const pharmacyRes = await db.query(
      `SELECT p.verification_status, pu.status AS staff_status
       FROM pharmacies p
       JOIN pharmacy_users pu ON pu.pharmacy_id = p.id
       WHERE p.id = $1 AND pu.user_id = $2`,
      [req.user.pharmacy_id, req.user.id]
    );

    const pharmacy = pharmacyRes.rows[0];
    if (pharmacy && pharmacy.staff_status !== 'ACTIVE') {
      await db.query(
        `UPDATE pharmacy_users SET status = 'ACTIVE' WHERE pharmacy_id = $1 AND user_id = $2`,
        [req.user.pharmacy_id, req.user.id]
      );
    }

    req.pharmacyId = req.user.pharmacy_id;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const reqId = req.requestId || (res.locals?.requestId as string) || `req_${Date.now()}`;

  if (err instanceof AppError) {
    return sendError(res, err.code, err.message, err.statusCode, err.details, reqId);
  }

  console.error('[Error] Unhandled server error:', err);
  return sendError(
    res,
    'INTERNAL_SERVER_ERROR',
    'An unexpected server error occurred.',
    500,
    {},
    reqId
  );
}
