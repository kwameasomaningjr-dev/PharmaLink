import { PosWebhookAdapter, WebhookNormalizationResult, verifyHmacSha256 } from './base.adapter.js';
import { ValidationError } from '../../../common/errors.js';

export interface RxPhotoPayload {
  facility_code?: string;
  pharmacy_id?: string;
  batch_id?: string;
  stock_records: Array<{
    brand_generic_name: string;
    available_qty: number | string;
    unit_cost_ghs?: number | string;
    bar_code?: string;
    ndc?: string;
  }>;
}

export class RxPhotoAdapter implements PosWebhookAdapter {
  readonly providerName = 'rxphoto';

  verifySignature(payload: string | Buffer, signature: string | undefined, secret: string): boolean {
    return verifyHmacSha256(payload, signature, secret);
  }

  normalizePayload(body: any): WebhookNormalizationResult {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('RxPhoto payload must be a JSON object.');
    }

    const payload = body as RxPhotoPayload;
    const pharmacyIdentifier = payload.pharmacy_id || payload.facility_code;
    if (!pharmacyIdentifier) {
      throw new ValidationError('RxPhoto payload must contain pharmacy_id or facility_code.');
    }

    const rawRecords = payload.stock_records || (body as any).inventory || (body as any).records;
    if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
      throw new ValidationError('RxPhoto payload contains no stock records.');
    }

    const items = rawRecords.map((item) => ({
      medicine_name: item.brand_generic_name || (item as any).medicine || (item as any).name || '',
      quantity: item.available_qty ?? (item as any).quantity ?? 0,
      unit_price: item.unit_cost_ghs ?? (item as any).unit_price,
      external_product_id: item.bar_code || item.ndc || (item as any).sku,
    }));

    return {
      pharmacyIdentifier,
      items,
      metadata: {
        provider: 'rxphoto',
        batch_id: payload.batch_id || null,
      },
    };
  }
}
