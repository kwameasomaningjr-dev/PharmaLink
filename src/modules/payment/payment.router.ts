import { Router, Request, Response, NextFunction } from 'express';
import { PaymentService, PaymentStatus } from './payment.service.js';
import { authenticateJwt, requireRoles } from '../../common/middleware.js';
import { sendSuccess } from '../../common/response.js';

export const paymentRouter = Router();

paymentRouter.post('/orders/:orderId/payments', authenticateJwt, requireRoles('CUSTOMER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await PaymentService.initiatePayment(req.user!.id, req.params.orderId, req.header('Idempotency-Key') || req.body.idempotency_key);
    return sendSuccess(res, payment, 201);
  } catch (err) {
    next(err);
  }
});

paymentRouter.get('/reconciliation/pending', authenticateJwt, requireRoles('PLATFORM_OPS'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await PaymentService.reconcile());
  } catch (err) {
    next(err);
  }
});

paymentRouter.get('/:id', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await PaymentService.getPayment(req.user!.id, req.params.id));
  } catch (err) {
    next(err);
  }
});

paymentRouter.post('/webhooks/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.rawBody || JSON.stringify(req.body);
    const payment = await PaymentService.handleWebhook(
      req.params.provider,
      payload,
      req.header('X-Provider-Signature'),
      {
        providerEventId: req.header('X-Provider-Event-Id') || '',
        providerReference: String(req.body.provider_reference || ''),
        status: String(req.body.status).toUpperCase() as PaymentStatus,
      }
    );
    return sendSuccess(res, payment);
  } catch (err) {
    next(err);
  }
});

paymentRouter.post('/:id/refund', authenticateJwt, requireRoles('PLATFORM_OPS'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await PaymentService.refundPayment(req.user!.id, req.params.id, req.body.amount_minor));
  } catch (err) {
    next(err);
  }
});
