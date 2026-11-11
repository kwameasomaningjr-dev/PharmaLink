import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../backend/app.js';
import { PrivateStorage, buildSignedS3Request } from '../backend/common/object-storage.js';
import { assertDatabaseConfiguredForRuntime } from '../backend/database/connection.js';
import { seedDatabase } from '../backend/database/seed.js';
import { IntegrationCronService } from '../backend/modules/integration/cron.service.js';

const app = createApp();
let customerToken = '';
let orderId = '';

beforeAll(async () => {
  await seedDatabase();
  const login = await request(app).post('/v1/auth/login').send({
    identifier: 'kwame.customer@gmail.com',
    password: 'Password123!',
  });
  expect(login.status).toBe(200);
  customerToken = login.body.data.token;

  const orderRes = await request(app)
    .post('/v1/orders')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({
      pharmacy_id: 'e1111111-1111-1111-1111-111111111111',
      fulfillment_type: 'PICKUP',
      items: [{ medicine_id: 'a1111111-1111-1111-1111-111111111111', quantity: 1 }],
    });
  expect(orderRes.status).toBe(201);
  orderId = orderRes.body.data.id;
});

describe('Option A PaaS, PostgreSQL, and Object Storage readiness', () => {
  it('requires DATABASE_URL in production unless explicitly opted into embedded mode', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevDb = process.env.DATABASE_URL;
    const prevAllow = process.env.ALLOW_EMBEDDED_DB_IN_PROD;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;
      delete process.env.ALLOW_EMBEDDED_DB_IN_PROD;
      expect(() => assertDatabaseConfiguredForRuntime()).toThrow(/DATABASE_URL/);

      process.env.DATABASE_URL = 'postgresql://user:pass@frankfurt-db.example.com:5432/pharmalink';
      expect(() => assertDatabaseConfiguredForRuntime()).not.toThrow();
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevDb;
      if (prevAllow === undefined) delete process.env.ALLOW_EMBEDDED_DB_IN_PROD;
      else process.env.ALLOW_EMBEDDED_DB_IN_PROD = prevAllow;
    }
  });

  it('reports /health status, DB reachability, storage mode, and 503 during startup', async () => {
    const okRes = await request(app).get('/health');
    expect(okRes.status).toBe(200);
    expect(okRes.body.status).toBe('ok');
    expect(okRes.body.database).toBe('connected');
    expect(okRes.body.storage).toBe('local');

    const startingApp = createApp(() => false);
    const startingRes = await request(startingApp).get('/health');
    expect(startingRes.status).toBe(503);
    expect(startingRes.body.status).toBe('starting');
  });

  it('stores, reads, and deletes private objects locally while rejecting path traversal', async () => {
    const key = `prescriptions/test-${Date.now()}.png`;
    const samplePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await expect(PrivateStorage.putObject('../escape.png', samplePng, 'image/png')).rejects.toThrow();
    await expect(PrivateStorage.getObject('../../etc/passwd')).rejects.toThrow();

    try {
      await PrivateStorage.putObject(key, samplePng, 'image/png');
      const loaded = await PrivateStorage.getObject(key);
      expect(loaded).toEqual(samplePng);
    } finally {
      await PrivateStorage.deleteObject(key);
    }

    const afterDelete = await PrivateStorage.getObject(key);
    expect(afterDelete).toBeNull();
  });

  it('signs S3 / Cloudflare R2 SigV4 requests and executes put/get/delete via object storage', async () => {
    const prevEndpoint = process.env.OBJECT_STORAGE_ENDPOINT;
    const prevBucket = process.env.OBJECT_STORAGE_BUCKET;
    const prevRegion = process.env.OBJECT_STORAGE_REGION;
    const prevKey = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
    const prevSecret = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;

    const samplePayload = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
    const signed = buildSignedS3Request({
      method: 'PUT',
      config: {
        endpoint: 'https://account-123.r2.cloudflarestorage.com',
        bucket: 'pharmalink-private-uploads',
        region: 'auto',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      },
      storageKey: 'prescriptions/rx-123.pdf',
      body: samplePayload,
      contentType: 'application/pdf',
      now: new Date('2026-11-11T12:00:00.000Z'),
    });

    expect(signed.url).toBe('https://account-123.r2.cloudflarestorage.com/pharmalink-private-uploads/prescriptions/rx-123.pdf');
    expect(signed.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=test-access-key\/20261111\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(signed.headers['x-amz-date']).toBe('20261111T120000Z');

    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response(null, { status: 200 });
      if (init?.method === 'GET') return new Response(new Uint8Array(samplePayload), { status: 200 });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response(null, { status: 404 });
    });

    const prevFetch = globalThis.fetch;
    try {
      process.env.OBJECT_STORAGE_ENDPOINT = 'https://account-123.r2.cloudflarestorage.com';
      process.env.OBJECT_STORAGE_BUCKET = 'pharmalink-private-uploads';
      process.env.OBJECT_STORAGE_REGION = 'auto';
      process.env.OBJECT_STORAGE_ACCESS_KEY_ID = 'test-access-key';
      process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = 'test-secret-key';
      globalThis.fetch = fetchMock as any;

      expect(PrivateStorage.mode()).toBe('s3');
      await PrivateStorage.putObject('prescriptions/rx-123.pdf', samplePayload, 'application/pdf');
      const fetched = await PrivateStorage.getObject('prescriptions/rx-123.pdf');
      expect(fetched).toEqual(samplePayload);
      await PrivateStorage.deleteObject('prescriptions/rx-123.pdf');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevEndpoint === undefined) delete process.env.OBJECT_STORAGE_ENDPOINT;
      else process.env.OBJECT_STORAGE_ENDPOINT = prevEndpoint;
      if (prevBucket === undefined) delete process.env.OBJECT_STORAGE_BUCKET;
      else process.env.OBJECT_STORAGE_BUCKET = prevBucket;
      if (prevRegion === undefined) delete process.env.OBJECT_STORAGE_REGION;
      else process.env.OBJECT_STORAGE_REGION = prevRegion;
      if (prevKey === undefined) delete process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
      else process.env.OBJECT_STORAGE_ACCESS_KEY_ID = prevKey;
      if (prevSecret === undefined) delete process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
      else process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = prevSecret;
    }
  });

  it('streams prescription files with private no-store cache headers to protect edge privacy', async () => {
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const uploadRes = await request(app)
      .post('/v1/prescriptions')
      .set('Authorization', `Bearer ${customerToken}`)
      .field('order_id', orderId)
      .attach('file', validPng, { filename: 'rx.png', contentType: 'image/png' });

    expect(uploadRes.status).toBe(201);
    const rxId = uploadRes.body.data.id;
    const storageKey = uploadRes.body.data.storage_key;

    try {
      const fileRes = await request(app)
        .get(`/v1/prescriptions/${rxId}/file`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(fileRes.status).toBe(200);
      expect(fileRes.headers['cache-control']).toBe('private, no-store');
      expect(fileRes.headers['x-content-type-options']).toBe('nosniff');
      expect(fileRes.headers['content-type']).toContain('image/png');
    } finally {
      if (storageKey) {
        await PrivateStorage.deleteObject(storageKey);
      }
    }
  });

  it('executes expiration sweeps cleanly through advisory-lock wrapper', async () => {
    const result = await IntegrationCronService.runExpirationSweeps();
    expect(typeof result.expired_orders).toBe('number');
    expect(typeof result.expired_reservations).toBe('number');
  });
});
