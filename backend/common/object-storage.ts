import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ForbiddenError } from './errors.js';

export type StorageMode = 's3' | 'local';

interface ObjectStorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function getS3Config(): ObjectStorageConfig | null {
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT?.trim();
  const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    bucket,
    region: process.env.OBJECT_STORAGE_REGION?.trim() || 'auto',
    accessKeyId,
    secretAccessKey,
  };
}

function localUploadRoot(): string {
  if (process.env.UPLOAD_DIR?.trim()) return path.resolve(process.env.UPLOAD_DIR.trim());
  if (
    process.env.VERCEL ||
    process.env.NODE_ENV === 'production' ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  ) {
    return '/tmp/uploads';
  }
  return path.resolve('./uploads');
}

function normalizeStorageKey(storageKey: string): string {
  const clean = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('..') || /[\0\r\n]/.test(clean)) {
    throw new ForbiddenError('Invalid storage key.');
  }
  return clean;
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function encodeUriPath(rawPath: string): string {
  return rawPath
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
}

export function buildSignedS3Request(params: {
  method: 'GET' | 'PUT' | 'DELETE';
  config: ObjectStorageConfig;
  storageKey: string;
  body?: Buffer;
  contentType?: string;
  now?: Date;
}): { url: string; headers: Record<string, string> } {
  const cleanKey = normalizeStorageKey(params.storageKey);
  const endpointUrl = new URL(params.config.endpoint);
  const basePath = endpointUrl.pathname.replace(/\/+$/, '');
  const canonicalUri = encodeUriPath(`${basePath}/${params.config.bucket}/${cleanKey}`);
  const targetUrl = `${endpointUrl.origin}${canonicalUri}`;

  const now = params.now || new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const bodyData = params.body ?? Buffer.alloc(0);
  const payloadHash = sha256Hex(bodyData);

  const canonicalHeadersMap: Record<string, string> = {
    host: endpointUrl.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (params.contentType) {
    canonicalHeadersMap['content-type'] = params.contentType;
  }

  const sortedHeaderKeys = Object.keys(canonicalHeadersMap).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${canonicalHeadersMap[k].trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    params.method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${params.config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${params.config.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, params.config.region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${params.config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    Authorization: authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (params.contentType) {
    headers['Content-Type'] = params.contentType;
  }

  return { url: targetUrl, headers };
}

export class PrivateStorage {
  public static isConfigured(): boolean {
    return getS3Config() !== null;
  }

  public static mode(): StorageMode {
    return this.isConfigured() ? 's3' : 'local';
  }

  public static async putObject(storageKey: string, buffer: Buffer, mimeType: string): Promise<void> {
    const cleanKey = normalizeStorageKey(storageKey);
    const s3 = getS3Config();

    if (s3) {
      const signed = buildSignedS3Request({
        method: 'PUT',
        config: s3,
        storageKey: cleanKey,
        body: buffer,
        contentType: mimeType,
      });
      const response = await fetch(signed.url, {
        method: 'PUT',
        headers: signed.headers,
        body: new Uint8Array(buffer),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Object storage upload failed (${response.status}): ${text.slice(0, 200)}`);
      }
      return;
    }

    const root = localUploadRoot();
    const filePath = path.resolve(root, cleanKey.replaceAll('/', path.sep));
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      throw new ForbiddenError('Invalid storage file path.');
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer, { flag: 'wx' });
  }

  public static async getObject(storageKey: string): Promise<Buffer | null> {
    const cleanKey = normalizeStorageKey(storageKey);
    const s3 = getS3Config();

    if (s3) {
      const signed = buildSignedS3Request({
        method: 'GET',
        config: s3,
        storageKey: cleanKey,
      });
      const response = await fetch(signed.url, {
        method: 'GET',
        headers: signed.headers,
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Object storage fetch failed (${response.status}): ${text.slice(0, 200)}`);
      }
      return Buffer.from(await response.arrayBuffer());
    }

    const root = localUploadRoot();
    const filePath = path.resolve(root, cleanKey.replaceAll('/', path.sep));
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      throw new ForbiddenError('Invalid storage file path.');
    }
    try {
      return await fs.readFile(filePath);
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }

  public static async deleteObject(storageKey: string): Promise<void> {
    const cleanKey = normalizeStorageKey(storageKey);
    const s3 = getS3Config();

    if (s3) {
      const signed = buildSignedS3Request({
        method: 'DELETE',
        config: s3,
        storageKey: cleanKey,
      });
      const response = await fetch(signed.url, {
        method: 'DELETE',
        headers: signed.headers,
      });
      if (!response.ok && response.status !== 404) {
        const text = await response.text().catch(() => '');
        throw new Error(`Object storage delete failed (${response.status}): ${text.slice(0, 200)}`);
      }
      return;
    }

    const root = localUploadRoot();
    const filePath = path.resolve(root, cleanKey.replaceAll('/', path.sep));
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      return;
    }
    await fs.unlink(filePath).catch(() => undefined);
  }
}
