import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../backend/app.js';
import { assertSecurityConfiguration } from '../backend/common/middleware.js';
import { db } from '../backend/database/connection.js';
import { seedDatabase } from '../backend/database/seed.js';
import { PaymentService } from '../backend/modules/payment/payment.service.js';
import { PaystackProvider } from '../backend/modules/payment/providers/paystack.provider.js';

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

describe('security and production readiness guards', () => {
  it('fails closed in production when JWT_SECRET is missing, short, or uses the dev default', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';

      delete process.env.JWT_SECRET;
      expect(() => assertSecurityConfiguration()).toThrow(/JWT_SECRET/);

      process.env.JWT_SECRET = 'too-short-secret';
      expect(() => assertSecurityConfiguration()).toThrow(/JWT_SECRET/);

      process.env.JWT_SECRET = 'pharmalink_dev_jwt_secret_key_change_in_production_min_32_chars';
      expect(() => assertSecurityConfiguration()).toThrow(/JWT_SECRET/);

      process.env.JWT_SECRET = 'production_unique_32_plus_char_signing_secret_value_12345';
      expect(() => assertSecurityConfiguration()).not.toThrow();
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prevSecret;
    }
  });

  it('skips demo user seeding in production unless ALLOW_DEMO_SEED=true', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevAllow = process.env.ALLOW_DEMO_SEED;
    const prevEmbedded = process.env.ALLOW_EMBEDDED_DB_IN_PROD;
    const querySpy = vi.spyOn(db, 'query');
    const execSpy = vi.spyOn(db, 'exec');
    try {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_EMBEDDED_DB_IN_PROD = 'true';
      delete process.env.ALLOW_DEMO_SEED;

      await seedDatabase(true);

      const userInserts = querySpy.mock.calls.filter(([sql]) =>
        typeof sql === 'string' && sql.includes('INSERT INTO users')
      );
      const userDeletes = execSpy.mock.calls.filter(([sql]) =>
        typeof sql === 'string' && sql.includes('DELETE FROM users')
      );
      expect(userInserts).toHaveLength(0);
      expect(userDeletes).toHaveLength(0);
    } finally {
      querySpy.mockRestore();
      execSpy.mockRestore();
      process.env.NODE_ENV = prevEnv;
      if (prevAllow === undefined) delete process.env.ALLOW_DEMO_SEED;
      else process.env.ALLOW_DEMO_SEED = prevAllow;
      if (prevEmbedded === undefined) delete process.env.ALLOW_EMBEDDED_DB_IN_PROD;
      else process.env.ALLOW_EMBEDDED_DB_IN_PROD = prevEmbedded;
    }
  });

  it('refuses Paystack mock simulation in production without a live secret key', async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const provider = new PaystackProvider('mock_test_key', 'pk_live_placeholder');

      await expect(
        provider.initiate({
          paymentId: 'pay-1',
          amountMinor: 2500,
          currency: 'GHS',
          orderId: 'ord-1',
        })
      ).rejects.toThrow(/PAYSTACK_SECRET_KEY/);

      await expect(provider.verifyTransaction('PL_PAY_123')).rejects.toThrow(/PAYSTACK_SECRET_KEY/);
      await expect(provider.refund('PL_PAY_123', 2500)).rejects.toThrow(/PAYSTACK_SECRET_KEY/);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('validates payment amount, currency, and ownership during verification', async () => {
    const originalProvider = PaymentService.getProvider();
    try {
      let stubAmount = 100; // Deliberately wrong underpayment
      let stubCurrency = 'GHS';
      PaymentService.setProvider({
        name: 'paystack',
        getPublicKey: () => 'pk_live_configured_from_server',
        async initiate({ paymentId }) {
          return {
            status: 'PENDING',
            providerReference: `REF_${paymentId}`,
            authorizationUrl: 'https://checkout.paystack.com/test',
          };
        },
        verifyWebhook() {
          return false;
        },
        async verifyTransaction() {
          return {
            status: 'SUCCESS',
            amount: stubAmount,
            currency: stubCurrency,
            raw: {},
          };
        },
      } as any);

      const initRes = await request(app)
        .post(`/v1/payments/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `sec-pay-${Date.now()}`);

      expect(initRes.status).toBe(201);
      expect(initRes.body.data.public_key).toBe('pk_live_configured_from_server');
      const ref = initRes.body.data.provider_reference;
      const expectedMinor = Number(initRes.body.data.amount_minor);

      // 1. Rejects unknown reference
      const unknownRes = await request(app)
        .post('/v1/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reference: 'UNKNOWN_REF_999' });
      expect(unknownRes.status).toBe(404);

      // 2. Rejects tampered/underpaid amount
      const mismatchRes = await request(app)
        .post('/v1/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reference: ref });
      expect(mismatchRes.status).toBe(409);
      expect(mismatchRes.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');

      // 3. Rejects mismatched currency
      stubAmount = expectedMinor;
      stubCurrency = 'USD';
      const currencyMismatchRes = await request(app)
        .post('/v1/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reference: ref });
      expect(currencyMismatchRes.status).toBe(409);

      // 4. Succeeds when exact amount & currency match
      stubCurrency = 'GHS';
      const okRes = await request(app)
        .post('/v1/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reference: ref });
      expect(okRes.status).toBe(200);
      expect(okRes.body.data.status).toBe('SUCCESS');
    } finally {
      PaymentService.setProvider(originalProvider);
    }
  });

  it('rate limits excessive authentication attempts when enabled', async () => {
    const prevFlag = process.env.TEST_RATE_LIMIT;
    const prevMax = process.env.AUTH_RATE_LIMIT_MAX;
    try {
      process.env.TEST_RATE_LIMIT = 'true';
      process.env.AUTH_RATE_LIMIT_MAX = '2';
      const rateLimitedApp = createApp();

      const first = await request(rateLimitedApp).post('/v1/auth/login').send({
        identifier: 'kwame.customer@gmail.com',
        password: 'wrong-password',
      });
      const second = await request(rateLimitedApp).post('/v1/auth/login').send({
        identifier: 'kwame.customer@gmail.com',
        password: 'wrong-password',
      });
      const third = await request(rateLimitedApp).post('/v1/auth/login').send({
        identifier: 'kwame.customer@gmail.com',
        password: 'wrong-password',
      });

      expect(first.status).toBe(401);
      expect(second.status).toBe(401);
      expect(third.status).toBe(429);
      expect(third.body.error.code).toBe('RATE_LIMITED');
    } finally {
      if (prevFlag === undefined) delete process.env.TEST_RATE_LIMIT;
      else process.env.TEST_RATE_LIMIT = prevFlag;
      if (prevMax === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
      else process.env.AUTH_RATE_LIMIT_MAX = prevMax;
    }
  });

  it('uses valid PWA manifest shortcuts, real PNG icons, and contains no hardcoded Paystack keys in frontend source', () => {
    const manifestPath = path.resolve(process.cwd(), 'frontend/public/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const shortcutUrls = (manifest.shortcuts || []).map((s: any) => s.url);

    expect(shortcutUrls).toEqual(['/medicines', '/pharmacies', '/prescriptions']);

    const icons = manifest.icons || [];
    expect(icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of icons) {
      const iconPath = path.resolve(process.cwd(), 'frontend/public', String(icon.src).replace(/^\/+/, ''));
      expect(fs.existsSync(iconPath)).toBe(true);
      const buf = fs.readFileSync(iconPath);
      expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const [expectedW, expectedH] = String(icon.sizes).split('x').map(Number);
      expect(buf.readUInt32BE(16)).toBe(expectedW);
      expect(buf.readUInt32BE(20)).toBe(expectedH);
    }

    const appJsxPath = path.resolve(process.cwd(), 'frontend/src/App.jsx');
    const appJsx = fs.readFileSync(appJsxPath, 'utf8');
    expect(appJsx).not.toMatch(/pk_(test|live)_[a-zA-Z0-9]+/);
    expect(appJsx).not.toMatch(/sk_(test|live)_[a-zA-Z0-9]+/);
  });
});

