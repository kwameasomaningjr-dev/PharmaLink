import { Router, Request, Response, NextFunction } from 'express';
import { authRouter } from '../modules/auth/auth.router.js';
import { SearchService } from '../modules/availability/search.service.js';
import { MedicineService } from '../modules/medicine/medicine.service.js';
import { PharmacyService } from '../modules/pharmacy/pharmacy.service.js';
import { OrderService } from '../modules/order/order.service.js';
import { InventoryService } from '../modules/inventory/inventory.service.js';
import { PrescriptionService } from '../modules/prescription/prescription.service.js';
import { IntegrationService } from '../modules/integration/integration.service.js';
import { integrationRouter } from '../modules/integration/integration.router.js';
import { paymentRouter } from '../modules/payment/payment.router.js';
import { NotificationService } from '../modules/notification/notification.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { sendSuccess } from '../common/response.js';
import {
  authenticateJwt,
  optionalAuthenticateJwt,
  requirePharmacyStaff,
  requireRoles,
} from '../common/middleware.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../common/errors.js';
import multer from 'multer';

export const v1Router = Router();

const prescriptionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype));
  },
});

function handlePrescriptionUpload(req: Request, res: Response, next: NextFunction) {
  prescriptionUpload.single('file')(req, res, (err: any) => {
    if (err) return next(new ValidationError(err.message || 'Invalid prescription upload.'));
    next();
  });
}

v1Router.use('/payments', paymentRouter);
v1Router.use('/integrations', integrationRouter);

// ==========================================
// 1. AUTH ROUTES
// ==========================================
v1Router.use('/auth', authRouter);

// ==========================================
// 2. CUSTOMER & PUBLIC MEDICINE SEARCH ROUTES
// ==========================================
v1Router.get('/medicines/search', optionalAuthenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, latitude, longitude, radius_km, fulfillment_type, page, limit } = req.query;
    const result = await SearchService.search({
      q: q ? String(q) : undefined,
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
      radius_km: radius_km ? Number(radius_km) : undefined,
      fulfillment_type: fulfillment_type ? (String(fulfillment_type).toUpperCase() as any) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return sendSuccess(res, result.results, 200, { total: result.total });
  } catch (err) {
    next(err);
  }
});

v1Router.get('/medicines/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const med = await MedicineService.getMedicineById(req.params.id);
    if (!med) throw new NotFoundError('Medicine');
    return sendSuccess(res, med);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3. PHARMACIES PUBLIC & ONBOARDING ROUTES
// ==========================================
v1Router.get('/pharmacies', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await PharmacyService.listPharmacies('VERIFIED');
    return sendSuccess(res, list);
  } catch (err) {
    next(err);
  }
});

v1Router.get('/platform/pharmacies', authenticateJwt, requireRoles('PLATFORM_OPS'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawStatus = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const allowedStatuses = ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'];
    if (rawStatus && !allowedStatuses.includes(rawStatus)) {
      throw new ValidationError('Invalid pharmacy verification status.');
    }
    const list = await PharmacyService.listAllPharmacies(rawStatus as any);
    return sendSuccess(res, list);
  } catch (err) {
    next(err);
  }
});

v1Router.patch('/platform/pharmacies/:id/verification', authenticateJwt, requireRoles('PLATFORM_OPS'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = String(req.body?.verification_status || '').toUpperCase();
    const allowedStatuses = ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'];
    if (!allowedStatuses.includes(status)) {
      throw new ValidationError('verification_status must be PENDING, VERIFIED, REJECTED, or SUSPENDED.');
    }
    const pharmacy = await PharmacyService.updateVerificationStatus(
      req.params.id,
      status as any,
      req.user!.id
    );
    return sendSuccess(res, pharmacy);
  } catch (err) {
    next(err);
  }
});

v1Router.get('/platform/audit', authenticateJwt, requireRoles('PLATFORM_OPS'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedLimit = Number(req.query.limit || 30);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 30;
    const events = await AuditService.listEvents(undefined, undefined, undefined, limit);
    return sendSuccess(res, events);
  } catch (err) {
    next(err);
  }
});

v1Router.get('/pharmacies/me', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pharmacy = await PharmacyService.getPharmacyById(req.pharmacyId!);
    if (!pharmacy) throw new NotFoundError('Pharmacy');
    return sendSuccess(res, pharmacy);
  } catch (err) {
    next(err);
  }
});

v1Router.patch('/pharmacies/me', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await PharmacyService.updatePharmacy(req.pharmacyId!, req.body, req.user!.id);
    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

v1Router.post('/pharmacies', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pharmacy = await PharmacyService.createPharmacy(req.body, req.user!.id);
    return sendSuccess(res, pharmacy, 201);
  } catch (err) {
    next(err);
  }
});

v1Router.get('/pharmacies/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pharmacy = await PharmacyService.getPharmacyById(req.params.id);
    if (!pharmacy) throw new NotFoundError('Pharmacy');
    return sendSuccess(res, pharmacy);
  } catch (err) {
    next(err);
  }
});

v1Router.get('/pharmacies/:id/availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pharmacyId = req.params.id;
    const medicineId = req.query.medicine_id ? String(req.query.medicine_id) : undefined;
    const inventory = await InventoryService.getPharmacyInventory(pharmacyId);
    const filtered = medicineId ? inventory.filter((i) => i.medicine_id === medicineId) : inventory;
    return sendSuccess(res, filtered);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 4. CUSTOMER ORDER ROUTES
// ==========================================
v1Router.post('/orders', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await OrderService.createOrder(req.user!.id, req.body);
    return sendSuccess(res, order, 201);
  } catch (err) {
    next(err);
  }
});

v1Router.get('/orders', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await OrderService.listCustomerOrders(req.user!.id);
    return sendSuccess(res, orders);
  } catch (err) {
    next(err);
  }
});

v1Router.get('/orders/:id', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await OrderService.getOrderById(
      req.params.id,
      req.user!.id,
      req.user!.role,
      req.pharmacyId
    );
    return sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
});

v1Router.post('/orders/:id/cancel', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await OrderService.updateOrderStatus(req.params.id, 'CANCELLED', req.user!.id);
    return sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 5. PHARMACY OPERATIONAL ORDER ROUTES
// ==========================================
v1Router.get('/pharmacy/orders', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status ? (String(req.query.status).toUpperCase() as any) : undefined;
    const orders = await OrderService.listPharmacyOrders(req.pharmacyId!, status);
    return sendSuccess(res, orders);
  } catch (err) {
    next(err);
  }
});

v1Router.get('/pharmacy/orders/:id', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await OrderService.getOrderById(
      req.params.id,
      req.user!.id,
      req.user!.role,
      req.pharmacyId
    );
    return sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
});

v1Router.post('/pharmacy/orders/:id/accept', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await OrderService.acceptOrder(req.params.id, req.user!.id, req.pharmacyId!);
    return sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
});

v1Router.post('/pharmacy/orders/:id/reject', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rejection_reason } = req.body;
    const order = await OrderService.rejectOrder(
      req.params.id,
      req.user!.id,
      req.pharmacyId!,
      rejection_reason
    );
    return sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
});

v1Router.post('/pharmacy/orders/:id/status', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (!status) throw new ValidationError('Target status is required.');
    const order = await OrderService.updateOrderStatus(
      req.params.id,
      status,
      req.user!.id,
      req.pharmacyId
    );
    return sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 6. INVENTORY & CONFIRMATION ROUTES
// ==========================================
v1Router.get('/inventory', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inventory = await InventoryService.getPharmacyInventory(req.pharmacyId!);
    return sendSuccess(res, inventory);
  } catch (err) {
    next(err);
  }
});

v1Router.post('/inventory/confirm', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { medicine_id, physical_quantity, unit_price_minor, note } = req.body;
    if (!medicine_id || physical_quantity === undefined) {
      throw new ValidationError('Medicine ID and physical quantity are required.');
    }
    const inv = await InventoryService.confirmPhysicalStock({
      pharmacy_id: req.pharmacyId!,
      medicine_id,
      physical_quantity: Number(physical_quantity),
      unit_price_minor: unit_price_minor ? Number(unit_price_minor) : undefined,
      note,
      actor_user_id: req.user!.id,
    });
    return sendSuccess(res, inv);
  } catch (err) {
    next(err);
  }
});

v1Router.post('/inventory/import', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { csv_content, rows } = req.body;
    let importRows = rows;
    if (!importRows && csv_content) {
      importRows = IntegrationService.parseCSV(csv_content);
    }
    if (!importRows || !Array.isArray(importRows)) {
      throw new ValidationError('csv_content string or rows array is required.');
    }

    const result = await IntegrationService.processFileImport(
      req.pharmacyId!,
      importRows,
      req.user!.id
    );
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

v1Router.post('/inventory/pos-sync', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { terminal_id } = req.body;
    const result = await IntegrationService.processPOSSync(
      req.pharmacyId!,
      terminal_id || 'POS-TERMINAL-01',
      req.user!.id
    );
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

v1Router.get('/integrations', authenticateJwt, requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [connections, history] = await Promise.all([
      IntegrationService.getConnections(req.pharmacyId!),
      IntegrationService.getSyncHistory(req.pharmacyId!),
    ]);
    return sendSuccess(res, {
      connections,
      sync_history: history,
    });
  } catch (err) {
    next(err);
  }
});

v1Router.get('/notifications', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await NotificationService.getUserNotifications(req.user!.id));
  } catch (err) {
    next(err);
  }
});

v1Router.get('/notifications/preferences', authenticateJwt, requireRoles('CUSTOMER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await NotificationService.getUserPreferences(req.user!.id));
  } catch (err) {
    next(err);
  }
});

v1Router.patch('/notifications/preferences', authenticateJwt, requireRoles('CUSTOMER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enabled = req.body?.browser_push_enabled;
    if (typeof enabled !== 'boolean') throw new ValidationError('browser_push_enabled must be a boolean.');
    return sendSuccess(res, await NotificationService.updateUserPreferences(req.user!.id, enabled));
  } catch (err) {
    next(err);
  }
});

v1Router.patch('/notifications/:id/read', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await NotificationService.markAsRead(req.params.id, req.user!.id));
  } catch (err) {
    next(err);
  }
});

v1Router.post('/notifications/:id/retry', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await NotificationService.retryForUser(req.params.id, req.user!.id));
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 7. PRESCRIPTION ROUTES
// ==========================================
v1Router.get('/prescriptions/pending', authenticateJwt, requireRoles('PHARMACY_ADMIN', 'PHARMACY_STAFF'), requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prescriptions = await PrescriptionService.listPendingForPharmacy(
      req.user?.role === 'PLATFORM_OPS' ? undefined : req.pharmacyId
    );
    return sendSuccess(res, prescriptions);
  } catch (err) {
    next(err);
  }
});

v1Router.post('/prescriptions', authenticateJwt, handlePrescriptionUpload, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prescription = await PrescriptionService.uploadPrescriptionFile(req.user!.id, req.body.order_id, req.file!);
    return sendSuccess(res, prescription, 201);
  } catch (err) {
    next(err);
  }
});

v1Router.get('/prescriptions/:id', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prescription = await PrescriptionService.getPrescriptionById(
      req.params.id,
      req.user!.id,
      req.user!.role,
      req.pharmacyId
    );
    return sendSuccess(res, prescription);
  } catch (err) {
    next(err);
  }
});

v1Router.get('/prescriptions/:id/file', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = await PrescriptionService.getPrescriptionFile(
      req.params.id,
      req.user!.id,
      req.user!.role,
      req.pharmacyId
    );
    return res.sendFile(file.filePath, { headers: { 'Content-Type': file.mimeType, 'Content-Disposition': 'inline' } });
  } catch (err) {
    next(err);
  }
});

v1Router.post('/prescriptions/:id/review', authenticateJwt, requireRoles('PHARMACY_ADMIN', 'PHARMACY_STAFF'), requirePharmacyStaff, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prescription = await PrescriptionService.reviewPrescription(
      req.params.id,
      req.user!.id,
      req.pharmacyId!,
      req.body
    );
    return sendSuccess(res, prescription);
  } catch (err) {
    next(err);
  }
});
