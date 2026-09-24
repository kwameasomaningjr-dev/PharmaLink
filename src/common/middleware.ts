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
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'pharmalink_dev_jwt_secret_key_change_in_production_min_32_chars';

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
    JWT_SECRET,
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
    const payload = jwt.verify(token, JWT_SECRET) as any;
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
      const payload = jwt.verify(token, JWT_SECRET) as any;
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

export function requirePharmacyStaff(req: Request, _res: Response, next: NextFunction) {
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

  req.pharmacyId = req.user.pharmacy_id;
  next();
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
