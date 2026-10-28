import { PosWebhookAdapter, WebhookNormalizationResult, verifyHmacSha256 } from './base.adapter.js';
import { ValidationError } from '../../../common/errors.js';

export interface PrimeCarePayload {
  pharmacy_license?: string;
  pharmacy_id?: string;
  branch_code?: string;
  timestamp?: string;
  inventory_items: Array<{
    item_name: string;
    stock_level: number | string;
    selling_price_ghs?: number | string;
    item_code?: string;
    sku?: string;
  }>;
}

export class PrimeCareAdapter implements PosWebhookAdapter {
  readonly providerName = 'primecare';

  verifySignature(payload: string | Buffer, signature: string | undefined, secret: string): boolean {
    return verifyHmacSha256(payload, signature, secret);
  }

  normalizePayload(body: any): WebhookNormalizationResult {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('PrimeCare payload must be a JSON object.');
    }

    const payload = body as PrimeCarePayload;
    const pharmacyIdentifier = payload.pharmacy_id || payload.pharmacy_license;
    if (!pharmacyIdentifier) {
      throw new ValidationError('PrimeCare payload must contain pharmacy_id or pharmacy_license.');
    }

    const rawItems = payload.inventory_items || (body as any).items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ValidationError('PrimeCare payload contains no inventory items.');
    }

    const items = rawItems.map((item) => ({
      medicine_name: item.item_name || (item as any).name || '',
      quantity: item.stock_level ?? (item as any).qty ?? 0,
      unit_price: item.selling_price_ghs ?? (item as any).price,
      external_product_id: item.item_code || item.sku || (item as any).id,
    }));

    return {
      pharmacyIdentifier,
      items,
      metadata: {
        provider: 'primecare',
        branch_code: payload.branch_code || null,
        sync_timestamp: payload.timestamp || new Date().toISOString(),
      },
    };
  }
}
