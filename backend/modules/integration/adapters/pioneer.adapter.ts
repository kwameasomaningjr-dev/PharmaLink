import { PosWebhookAdapter, WebhookNormalizationResult, verifyHmacSha256 } from './base.adapter.js';
import { ValidationError } from '../../../common/errors.js';

export interface PioneerPayload {
  event_type: string;
  pharmacy_id?: string;
  store_license?: string;
  data: {
    products: Array<{
      product_name: string;
      on_hand_count: number | string;
      price?: number | string;
      product_id?: string;
      upc?: string;
    }>;
  };
}

export class PioneerAdapter implements PosWebhookAdapter {
  readonly providerName = 'pioneer';

  verifySignature(payload: string | Buffer, signature: string | undefined, secret: string): boolean {
    return verifyHmacSha256(payload, signature, secret);
  }

  normalizePayload(body: any): WebhookNormalizationResult {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Pioneer payload must be a JSON object.');
    }

    const payload = body as PioneerPayload;
    const pharmacyIdentifier = payload.pharmacy_id || payload.store_license;
    if (!pharmacyIdentifier) {
      throw new ValidationError('Pioneer payload must contain pharmacy_id or store_license.');
    }

    const products = payload.data?.products || (body as any).products;
    if (!Array.isArray(products) || products.length === 0) {
      throw new ValidationError('Pioneer payload contains no product records.');
    }

    const items = products.map((prod) => ({
      medicine_name: prod.product_name || (prod as any).name || '',
      quantity: prod.on_hand_count ?? (prod as any).quantity ?? 0,
      unit_price: prod.price ?? (prod as any).unit_price,
      external_product_id: prod.product_id || prod.upc,
    }));

    return {
      pharmacyIdentifier,
      items,
      metadata: {
        provider: 'pioneer',
        event_type: payload.event_type || 'inventory.updated',
      },
    };
  }
}
