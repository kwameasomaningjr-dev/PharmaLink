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
    const provider = req.params.provider.toLowerCase();
    const payload = req.rawBody || JSON.stringify(req.body);
    const signature = req.header('x-paystack-signature') || req.header('x-provider-signature');

    let providerEventId = req.header('X-Provider-Event-Id') || '';
    let providerReference = String(req.body.provider_reference || '');
    let status: PaymentStatus = String(req.body.status || '').toUpperCase() as PaymentStatus;

    if (provider === 'paystack' && req.body?.data) {
      providerReference = String(req.body.data.reference || providerReference);
      providerEventId = String(req.body.data.id || req.body.event || `evt_${Date.now()}`);
      if (req.body.event === 'charge.success' || req.body.data.status === 'success') {
        status = 'SUCCESS';
      } else if (req.body.data.status === 'failed') {
        status = 'FAILED';
      } else {
        status = 'PENDING';
      }
    }

    const payment = await PaymentService.handleWebhook(
      provider,
      payload,
      signature,
      {
        providerEventId: providerEventId || `evt_${Date.now()}`,
        providerReference,
        status,
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
