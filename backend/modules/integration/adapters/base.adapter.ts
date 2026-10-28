import crypto from 'node:crypto';
import { CSVImportRow } from '../integration.service.js';
import { ValidationError } from '../../../common/errors.js';

export interface WebhookNormalizationResult {
  pharmacyIdentifier: string; // pharmacy ID or license number
  items: CSVImportRow[];
  metadata?: Record<string, any>;
}

export interface PosWebhookAdapter {
  readonly providerName: string;
  verifySignature(payload: string | Buffer, signature: string | undefined, secret: string): boolean;
  normalizePayload(body: any): WebhookNormalizationResult;
}

export function verifyHmacSha256(rawBody: string | Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const cleanSignature = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(cleanSignature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}
