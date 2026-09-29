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
  if (process.env.NODE_ENV !== 'production') return;

  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32 || secret === DEVELOPMENT_JWT_SECRET) {
    throw new Error('JWT_SECRET must be a unique value of at least 32 characters in production.');
  }

  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (!corsOrigin || corsOrigin === '*') {
    throw new Error('CORS_ORIGIN must explicitly list the trusted production frontend origin(s).');
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

    // If user belongs to a pharmacy, enforce pharmacy tenancy context
    if (payload.pharmacy_id) {
      req.pharmacyId = payload.pharmacy_id;
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
    return next();
  }

  if (req.user.role !== 'PHARMACY_ADMIN' && req.user.role !== 'PHARMACY_STAFF') {
    return next(new ForbiddenError('Access restricted to verified pharmacy personnel'));
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
    if (!pharmacy || pharmacy.staff_status !== 'ACTIVE' || pharmacy.verification_status !== 'VERIFIED') {
      return next(new ForbiddenError('Access requires active staff membership at a verified pharmacy'));
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
