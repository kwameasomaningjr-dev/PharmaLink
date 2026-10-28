import { Router, Request, Response, NextFunction } from 'express';
import { WebhookService } from './webhook.service.js';
import { IntegrationService } from './integration.service.js';
import { IntegrationCronService } from './cron.service.js';
import { sendSuccess } from '../../common/response.js';
import { authenticateJwt, requirePharmacyStaff, requireRoles } from '../../common/middleware.js';
import { ValidationError } from '../../common/errors.js';

export const integrationRouter = Router();

// ==========================================
// 1. PUBLIC / HMAC-PROTECTED WEBHOOK ENDPOINTS
// ==========================================
integrationRouter.post('/webhooks/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = req.params.provider;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const result = await WebhookService.processWebhook(
      provider,
      rawBody,
      req.body,
      req.headers
    );
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. PHARMACY STAFF CONNECTION MANAGEMENT
// ==========================================
integrationRouter.get(
  '/connections',
  authenticateJwt,
  requirePharmacyStaff,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connections = await IntegrationService.getConnections(req.pharmacyId!);
      return sendSuccess(res, connections);
    } catch (err) {
      next(err);
    }
  }
);

integrationRouter.post(
  '/connections',
  authenticateJwt,
  requirePharmacyStaff,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { provider_name, provider_type, webhook_secret } = req.body;
      if (!provider_name) {
        throw new ValidationError('provider_name is required (e.g. primecare, rxphoto, pioneer, generic).');
      }
      const connection = await IntegrationService.createConnection({
        pharmacyId: req.pharmacyId!,
        providerName: provider_name,
        providerType: provider_type || 'POS_API',
        webhookSecret: webhook_secret,
      });
      return sendSuccess(res, connection, 201);
    } catch (err) {
      next(err);
    }
  }
);

integrationRouter.delete(
  '/connections/:id',
  authenticateJwt,
  requirePharmacyStaff,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await IntegrationService.deleteConnection(req.params.id, req.pharmacyId!);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

integrationRouter.post(
  '/connections/:id/sync',
  authenticateJwt,
  requirePharmacyStaff,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await IntegrationCronService.syncConnection(req.params.id, req.user!.id);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

integrationRouter.get(
  '/history',
  authenticateJwt,
  requirePharmacyStaff,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const history = await IntegrationService.getSyncHistory(req.pharmacyId!);
      return sendSuccess(res, history);
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 3. SCHEDULED CRON RUNNER TRIGGER
// ==========================================
integrationRouter.post(
  '/cron/run',
  authenticateJwt,
  requireRoles('PLATFORM_OPS'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await IntegrationCronService.runScheduledSync();
      return sendSuccess(res, summary);
    } catch (err) {
      next(err);
    }
  }
);
