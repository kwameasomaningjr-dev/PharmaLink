import { PosWebhookAdapter, WebhookNormalizationResult, verifyHmacSha256 } from './base.adapter.js';
import { ValidationError } from '../../../common/errors.js';

export interface GenericPosPayload {
  pharmacy_id?: string;
  pharmacy_license?: string;
  items: Array<{
    medicine_name: string;
    quantity: number | string;
    unit_price?: number | string;
    external_product_id?: string;
  }>;
}

export class GenericPosAdapter implements PosWebhookAdapter {
  readonly providerName = 'generic';

  verifySignature(payload: string | Buffer, signature: string | undefined, secret: string): boolean {
    return verifyHmacSha256(payload, signature, secret);
  }

  normalizePayload(body: any): WebhookNormalizationResult {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Webhook payload must be a valid JSON object.');
    }

    const payload = body as GenericPosPayload;
    const pharmacyIdentifier = payload.pharmacy_id || payload.pharmacy_license;
    if (!pharmacyIdentifier) {
      throw new ValidationError('Payload must specify pharmacy_id or pharmacy_license.');
    }

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new ValidationError('Payload items must be a non-empty array.');
    }

    return {
      pharmacyIdentifier,
      items: payload.items,
      metadata: { provider: 'generic' },
    };
  }
}
