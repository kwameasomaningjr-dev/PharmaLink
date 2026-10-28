import crypto from 'node:crypto';
import { PaymentProvider, PaymentStatus } from '../payment.service.js';
import { ValidationError } from '../../../common/errors.js';

export interface PaystackInitializeInput {
  paymentId: string;
  amountMinor: number;
  currency: string;
  orderId: string;
  customerEmail?: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaystackInitializeResponse {
  status: PaymentStatus;
  providerReference: string;
  authorizationUrl?: string;
  accessCode?: string;
}

export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack';

  constructor(
    private secretKey: string = process.env.PAYSTACK_SECRET_KEY || '',
    private publicKey: string = process.env.PAYSTACK_PUBLIC_KEY || ''
  ) {}

  public getPublicKey(): string {
    return this.publicKey;
  }

  async initiate(input: PaystackInitializeInput): Promise<PaystackInitializeResponse> {
    const email = input.customerEmail || 'customer@pharmalink.gh';
    const reference = `PL_PAY_${input.paymentId.replace(/-/g, '').slice(0, 12)}_${Date.now().toString(36)}`;
    const callbackUrl = input.callbackUrl || `${process.env.APP_URL || 'http://localhost:4000'}/`;

    // Simulation fallback in test environment without live key
    if (process.env.NODE_ENV === 'test' || !this.secretKey || this.secretKey.startsWith('mock_')) {
      return {
        status: 'PENDING',
        providerReference: reference,
        authorizationUrl: `https://checkout.paystack.com/mock_auth_${reference}`,
        accessCode: `mock_code_${reference}`,
      };
    }

    try {
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.secretKey}`,
        },
        body: JSON.stringify({
          email,
          amount: input.amountMinor, // Pesewas (1 GHS = 100 pesewas)
          currency: input.currency || 'GHS',
          reference,
          callback_url: callbackUrl,
          channels: ['mobile_money', 'card'],
          metadata: {
            payment_id: input.paymentId,
            order_id: input.orderId,
            ...(input.metadata || {}),
          },
        }),
      });

      const data: any = await response.json().catch(() => ({}));
      if (!response.ok || !data.status) {
        throw new Error(data.message || `Paystack initialization failed (HTTP ${response.status})`);
      }

      return {
        status: 'PENDING',
        providerReference: data.data?.reference || reference,
        authorizationUrl: data.data?.authorization_url,
        accessCode: data.data?.access_code,
      };
    } catch (err: any) {
      throw new Error(`Paystack error: ${err.message}`);
    }
  }

  verifyWebhook(payload: string | Buffer, signature: string | undefined): boolean {
    if (!signature || !this.secretKey) return false;
    try {
      const hash = crypto.createHmac('sha512', this.secretKey).update(payload).digest('hex');
      const sigBuf = Buffer.from(signature, 'hex');
      const hashBuf = Buffer.from(hash, 'hex');
      if (sigBuf.length !== hashBuf.length || sigBuf.length === 0) return false;
      return crypto.timingSafeEqual(sigBuf, hashBuf);
    } catch {
      return false;
    }
  }

  async verifyTransaction(reference: string): Promise<{ status: PaymentStatus; amount: number; raw: any }> {
    if (process.env.NODE_ENV === 'test' || !this.secretKey || this.secretKey.startsWith('mock_')) {
      return { status: 'SUCCESS', amount: 1000, raw: { reference, status: 'success' } };
    }

    try {
      const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { 'Authorization': `Bearer ${this.secretKey}` },
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Verification failed');
      }

      const txStatus = data.data?.status;
      const mappedStatus: PaymentStatus =
        txStatus === 'success' ? 'SUCCESS' : txStatus === 'failed' ? 'FAILED' : 'PENDING';

      return {
        status: mappedStatus,
        amount: data.data?.amount,
        raw: data.data,
      };
    } catch (err: any) {
      throw new Error(`Paystack verification failed: ${err.message}`);
    }
  }

  async refund(providerReference: string, amountMinor?: number): Promise<{ success: boolean; refundId: string }> {
    if (process.env.NODE_ENV === 'test' || !this.secretKey || this.secretKey.startsWith('mock_')) {
      return { success: true, refundId: `ref_${Date.now()}` };
    }

    try {
      const res = await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.secretKey}`,
        },
        body: JSON.stringify({
          transaction: providerReference,
          amount: amountMinor,
        }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || !data.status) {
        throw new Error(data.message || 'Refund failed');
      }
      return { success: true, refundId: data.data?.id || `ref_${Date.now()}` };
    } catch (err: any) {
      throw new Error(`Paystack refund failed: ${err.message}`);
    }
  }
}
