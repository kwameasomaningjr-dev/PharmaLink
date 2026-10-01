import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';
import { IntegrationCronService } from '../src/modules/integration/cron.service.js';
import { db } from '../src/database/connection.js';

const app = createApp();
let pharmacyStaffToken = '';
let platformToken = '';
const pharmacyId = 'e1111111-1111-1111-1111-111111111111'; // East Legon Pharmacy

beforeAll(async () => {
  await seedDatabase();
  const staffLogin = await request(app).post('/v1/auth/login').send({
    identifier: 'admin@eastlegonrx.gh',
    password: 'Password123!',
  });
  pharmacyStaffToken = staffLogin.body.data.token;

  const opsLogin = await request(app).post('/v1/auth/login').send({
    identifier: 'ops@pharmalink.gh',
    password: 'Password123!',
  });
  platformToken = opsLogin.body.data.token;
});

describe('Ghana Pharmacy Management Software (PMS/POS) Webhooks & Cron Sync', () => {
  it('processes PrimeCare PMS inventory webhook successfully', async () => {
    const payload = {
      pharmacy_id: pharmacyId,
      branch_code: 'ACCRA-EAST-LEGON',
      timestamp: new Date().toISOString(),
      inventory_items: [
        {
          item_name: 'Cetirizine 10mg',
          stock_level: 45,
          selling_price_ghs: 15.5,
          sku: 'PC-CET-10',
        },
        {
          item_name: 'Amoxicillin 500mg',
          stock_level: 20,
          selling_price_ghs: 35.0,
          sku: 'PC-AMOX-500',
        },
      ],
    };

    const res = await request(app)
      .post('/v1/integrations/webhooks/primecare')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUCCESS');
    expect(res.body.data.records_accepted).toBe(2);
    expect(res.body.data.pharmacy_id).toBe(pharmacyId);
    expect(res.body.data.provider).toBe('primecare');

    // Verify inventory observation was recorded
    const inventory = await request(app)
      .get('/v1/inventory')
      .set('Authorization', `Bearer ${pharmacyStaffToken}`);
    expect(inventory.status).toBe(200);
    const cetirizine = inventory.body.data.find((item: any) =>
      item.generic_name?.includes('Cetirizine')
    );
    expect(cetirizine).toBeDefined();
    expect(Number(cetirizine.available_quantity)).toBe(45);
  });

  it('processes RxPhoto/RxSync inventory webhook successfully', async () => {
    const payload = {
      pharmacy_id: pharmacyId,
      batch_id: 'RX-BATCH-2026-09',
      stock_records: [
        {
          brand_generic_name: 'Coartem',
          available_qty: 30,
          unit_cost_ghs: 50.0,
          bar_code: 'RX-COAR-01',
        },
      ],
    };

    const res = await request(app)
      .post('/v1/integrations/webhooks/rxphoto')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUCCESS');
    expect(res.body.data.records_accepted).toBe(1);
    expect(res.body.data.provider).toBe('rxphoto');
  });

  it('processes PioneerRx PMS inventory webhook successfully', async () => {
    const payload = {
      event_type: 'inventory.updated',
      pharmacy_id: pharmacyId,
      data: {
        products: [
          {
            product_name: 'Cetirizine 10mg',
            on_hand_count: 18,
            price: 22.0,
            product_id: 'PIONEER-CET-10',
          },
        ],
      },
    };

    const res = await request(app)
      .post('/v1/integrations/webhooks/pioneer')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUCCESS');
    expect(res.body.data.records_accepted).toBe(1);
    expect(res.body.data.provider).toBe('pioneer');
  });

  it('verifies HMAC-SHA256 signature when webhook secret is configured and rejects invalid signatures', async () => {
    const webhookSecret = 'test_pms_secret_ghana_2026';

    // 1. Create connection with secret
    const connRes = await request(app)
      .post('/v1/integrations/connections')
      .set('Authorization', `Bearer ${pharmacyStaffToken}`)
      .send({
        provider_name: 'primecare',
        webhook_secret: webhookSecret,
      });
    expect(connRes.status).toBe(201);
    expect(connRes.body.data.webhook_secret).toBe(webhookSecret);

    const payload = {
      pharmacy_id: pharmacyId,
      inventory_items: [
        {
          item_name: 'Cetirizine 10mg',
          stock_level: 80,
          selling_price_ghs: 14.0,
        },
      ],
    };
    const rawPayload = JSON.stringify(payload);

    // Compute valid HMAC
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawPayload)
      .digest('hex');

    // 2. Send with valid signature
    const validRes = await request(app)
      .post('/v1/integrations/webhooks/primecare')
      .set('X-Hub-Signature-256', `sha256=${validSignature}`)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    expect(validRes.status).toBe(200);
    expect(validRes.body.data.status).toBe('SUCCESS');

    // 3. Send with tampered payload / invalid signature
    const invalidSignature = 'bad_tampered_signature_1234567890abcdef1234567890abcdef1234567890';
    const invalidRes = await request(app)
      .post('/v1/integrations/webhooks/primecare')
      .set('X-Hub-Signature-256', `sha256=${invalidSignature}`)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    expect(invalidRes.status).toBe(401);
    expect(invalidRes.body.error.code).toBe('UNAUTHORIZED');
  });

  it('supports connection management and manual sync triggering', async () => {
    // List connections
    const listRes = await request(app)
      .get('/v1/integrations/connections')
      .set('Authorization', `Bearer ${pharmacyStaffToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);

    const primecareConn = listRes.body.data.find(
      (c: any) => c.provider_name.toLowerCase() === 'primecare'
    );
    expect(primecareConn).toBeDefined();

    // Trigger on-demand sync for connection
    const syncRes = await request(app)
      .post(`/v1/integrations/connections/${primecareConn.id}/sync`)
      .set('Authorization', `Bearer ${pharmacyStaffToken}`);

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.data.status).toBe('SUCCESS');

    // View history
    const historyRes = await request(app)
      .get('/v1/integrations/history')
      .set('Authorization', `Bearer ${pharmacyStaffToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data.length).toBeGreaterThan(0);
  });

  it('executes scheduled cron job across verified pharmacies', async () => {
    const cronSummary = await IntegrationCronService.runScheduledSync();

    expect(cronSummary.connections_processed).toBeGreaterThan(0);
    expect(cronSummary.connections_succeeded).toBeGreaterThan(0);

    // Platform ops cron trigger endpoint
    const opsRes = await request(app)
      .post('/v1/integrations/cron/run')
      .set('Authorization', `Bearer ${platformToken}`);

    expect(opsRes.status).toBe(200);
    expect(opsRes.body.data.connections_processed).toBeGreaterThan(0);
  });
});
