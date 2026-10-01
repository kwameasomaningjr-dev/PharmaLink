import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import { AuditService } from '../audit/audit.service.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../common/errors.js';

export type PaymentStatus = 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

const webhookStatuses: PaymentStatus[] = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'];

function canTransitionPayment(current: PaymentStatus, next: PaymentStatus): boolean {
  if (current === next) return true;
  if (current === 'INITIATED') return ['PENDING', 'SUCCESS', 'FAILED'].includes(next);
  if (current === 'PENDING') return ['SUCCESS', 'FAILED'].includes(next);
  if (current === 'SUCCESS') return ['PARTIALLY_REFUNDED', 'REFUNDED'].includes(next);
  if (current === 'PARTIALLY_REFUNDED') return next === 'REFUNDED';
  return false;
}

export interface PaymentProvider {
  readonly name: string;
  initiate(input: { paymentId: string; amountMinor: number; currency: string; orderId: string; customerEmail?: string; callbackUrl?: string }): Promise<{
    status: PaymentStatus;
    providerReference: string | null;
    authorizationUrl?: string;
    accessCode?: string;
  }>;
  verifyWebhook(payload: string, signature: string | undefined): boolean;
}

class UnavailablePaymentProvider implements PaymentProvider {
  readonly name = 'unavailable';

  async initiate() {
    return { status: 'PENDING' as const, providerReference: null };
  }

  verifyWebhook() {
    return false;
  }
}

import { PaystackProvider } from './providers/paystack.provider.js';

export class PaymentService {
  private static provider: PaymentProvider = process.env.PAYSTACK_SECRET_KEY
    ? new PaystackProvider(process.env.PAYSTACK_SECRET_KEY, process.env.PAYSTACK_PUBLIC_KEY)
    : new UnavailablePaymentProvider();

  public static setProvider(provider: PaymentProvider) {
    this.provider = provider;
  }

  public static async initiatePayment(customerId: string, orderId: string, idempotencyKey: string) {
    if (!idempotencyKey?.trim()) throw new ValidationError('An idempotency key is required.');

    const orderRes = await db.query(
      `SELECT * FROM orders WHERE id = $1 AND customer_id = $2`,
      [orderId, customerId]
    );
    if (orderRes.rowCount === 0) throw new NotFoundError('Order');
    const order = orderRes.rows[0];

    const normalizedKey = idempotencyKey.trim();
    const existing = await db.query(`SELECT * FROM payments WHERE idempotency_key = $1`, [normalizedKey]);
    if (existing.rowCount > 0) {
      if (existing.rows[0].order_id !== orderId) {
        throw new ConflictError('IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for another order.');
      }
      return existing.rows[0];
    }

    const paymentId = uuidv4();
    try {
      await db.query(
        `INSERT INTO payments
         (id, order_id, provider, provider_reference, amount_minor, currency, status, idempotency_key)
         VALUES ($1, $2, $3, NULL, $4, $5, 'INITIATED', $6)`,
        [paymentId, orderId, this.provider.name, order.total_minor, order.currency, normalizedKey]
      );
    } catch (error: any) {
      if (error?.code !== '23505') throw error;
      const concurrent = await db.query(`SELECT * FROM payments WHERE idempotency_key = $1`, [normalizedKey]);
      if (concurrent.rowCount === 0) throw error;
      if (concurrent.rows[0].order_id !== orderId) {
        throw new ConflictError('IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for another order.');
      }
      return concurrent.rows[0];
    }

    let providerResult: Awaited<ReturnType<PaymentProvider['initiate']>>;
    try {
      providerResult = await this.provider.initiate({
        paymentId,
        amountMinor: order.total_minor,
        currency: order.currency,
        orderId,
      });
    } catch (error) {
      await db.query(`UPDATE payments SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [paymentId]);
      throw error;
    }

    if (providerResult.status !== 'PENDING' && providerResult.status !== 'SUCCESS' && providerResult.status !== 'FAILED') {
      throw new ValidationError('Payment provider returned an unsupported status.');
    }

    await db.query(
      `UPDATE payments
       SET provider_reference = $1, status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [providerResult.providerReference, providerResult.status, paymentId]
    );

    await AuditService.recordEvent({
      actorUserId: customerId,
      pharmacyId: order.pharmacy_id,
      eventType: 'PAYMENT_INITIATED',
      entityType: 'PAYMENT',
      entityId: paymentId,
      metadata: { status: providerResult.status, provider: this.provider.name, idempotency_key: normalizedKey },
    });

    const payment = (await db.query(`SELECT * FROM payments WHERE id = $1`, [paymentId])).rows[0];
    return {
      ...payment,
      authorization_url: providerResult.authorizationUrl,
      access_code: providerResult.accessCode,
    };
  }

  public static async getPayment(customerId: string, paymentId: string) {
    const res = await db.query(
      `SELECT p.* FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE p.id = $1 AND o.customer_id = $2`,
      [paymentId, customerId]
    );
    if (res.rowCount === 0) throw new NotFoundError('Payment');
    return res.rows[0];
  }

  public static async handleWebhook(providerName: string, payload: string, signature: string | undefined, event: {
    providerEventId: string;
    providerReference: string;
    status: PaymentStatus;
  }) {
    if (providerName !== this.provider.name || !this.provider.verifyWebhook(payload, signature)) {
      throw new ForbiddenError('Webhook signature could not be verified.');
    }
    if (!event.providerEventId) throw new ValidationError('Provider event ID is required.');
    if (!event.providerReference?.trim()) throw new ValidationError('Provider reference is required.');
    if (!webhookStatuses.includes(event.status)) throw new ValidationError('Webhook status is not supported.');

    return db.transaction(async (client) => {
      const paymentRes = await client.query(
        `SELECT * FROM payments
         WHERE provider = $1 AND provider_reference = $2
         FOR UPDATE`,
        [providerName, event.providerReference.trim()]
      );
      if (paymentRes.rowCount === 0) throw new NotFoundError('Payment');
      const payment = paymentRes.rows[0];

      const eventInsert = await client.query(
        `INSERT INTO payment_webhook_events (id, provider, provider_event_id, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (provider, provider_event_id) DO NOTHING`,
        [uuidv4(), providerName, event.providerEventId, payload]
      );
      if (eventInsert.rowCount === 0) return payment;

      if (!canTransitionPayment(payment.status as PaymentStatus, event.status)) {
        throw new ConflictError('INVALID_PAYMENT_TRANSITION', `Cannot change payment from ${payment.status} to ${event.status}.`);
      }

      await client.query(
        `UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [event.status, payment.id]
      );
      await AuditService.recordEvent({
        pharmacyId: null,
        eventType: `PAYMENT_${event.status}`,
        entityType: 'PAYMENT',
        entityId: payment.id,
        metadata: { provider: providerName, provider_reference: event.providerReference },
        client,
      });
      return (await client.query(`SELECT * FROM payments WHERE id = $1`, [payment.id])).rows[0];
    });
  }

  public static async refundPayment(actorUserId: string, paymentId: string, amountMinor?: number) {
    const paymentRes = await db.query(
      `SELECT p.*, o.pharmacy_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1`,
      [paymentId]
    );
    if (paymentRes.rowCount === 0) throw new NotFoundError('Payment');
    const payment = paymentRes.rows[0];
    if (payment.status !== 'SUCCESS' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw new ConflictError('PAYMENT_NOT_REFUNDABLE', 'Only successful payments can be refunded.');
    }
    const refundAmount = amountMinor ?? payment.amount_minor;
    if (!Number.isInteger(refundAmount) || refundAmount <= 0 || refundAmount > payment.amount_minor) {
      throw new ValidationError('Refund amount must be a positive integer not greater than the payment amount.');
    }

    // No live provider is configured. Keep the payment unchanged rather than claiming a refund.
    throw new ConflictError('PAYMENT_PROVIDER_UNAVAILABLE', 'Refunds are unavailable until a payment provider is configured.', {
      payment_id: paymentId,
      requested_by: actorUserId,
      requested_amount_minor: refundAmount,
    });
  }

  public static async reconcile() {
    return (await db.query(
      `SELECT * FROM payments WHERE status IN ('INITIATED', 'PENDING') ORDER BY created_at ASC LIMIT 100`
    )).rows;
  }

  public static createTestSignature(payload: string, secret: string) {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }
}
