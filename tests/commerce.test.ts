import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';
import { IntegrationService } from '../src/modules/integration/integration.service.js';
import { NotificationService } from '../src/modules/notification/notification.service.js';
import { db } from '../src/database/connection.js';

const app = createApp();
let customerToken = '';
let platformToken = '';
let orderId = '';

beforeAll(async () => {
  await seedDatabase();
  const login = await request(app).post('/v1/auth/login').send({
    identifier: 'kwame.customer@gmail.com',
    password: 'Password123!',
  });
  customerToken = login.body.data.token;
  const platformLogin = await request(app).post('/v1/auth/login').send({
    identifier: 'ops@pharmalink.gh',
    password: 'Password123!',
  });
  platformToken = platformLogin.body.data.token;
  const order = await request(app).post('/v1/orders')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({
      pharmacy_id: 'e1111111-1111-1111-1111-111111111111',
      fulfillment_type: 'PICKUP',
      items: [{ medicine_id: 'a1111111-1111-1111-1111-111111111111', quantity: 1 }],
    });
  orderId = order.body.data.id;
});

describe('owned commerce and integration contracts', () => {
  it('supports owned in-app notifications with read state', async () => {
    const notifications = await request(app)
      .get('/v1/notifications')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(notifications.status).toBe(200);
    const submitted = notifications.body.data.find((item: any) =>
      item.type === 'ORDER_SUBMITTED' && item.reference_id === orderId
    );
    expect(submitted).toBeDefined();
    expect(submitted.channel).toBe('IN_APP');
    expect(submitted.read_at).toBeNull();

    const marked = await request(app)
      .patch(`/v1/notifications/${submitted.id}/read`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(marked.status).toBe(200);
    expect(marked.body.data.read_at).not.toBeNull();
  });

  it('persists browser notification opt-in for the signed-in customer only', async () => {
    const initial = await request(app)
      .get('/v1/notifications/preferences')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(initial.status).toBe(200);
    expect(initial.body.data.browser_push_enabled).toBe(false);

    const updated = await request(app)
      .patch('/v1/notifications/preferences')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ browser_push_enabled: true });
    expect(updated.status).toBe(200);
    expect(updated.body.data.browser_push_enabled).toBe(true);

    const persisted = await request(app)
      .get('/v1/notifications/preferences')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(persisted.body.data.browser_push_enabled).toBe(true);

    const invalid = await request(app)
      .patch('/v1/notifications/preferences')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ browser_push_enabled: 'yes' });
    expect(invalid.status).toBe(422);

    const nonCustomer = await request(app)
      .get('/v1/notifications/preferences')
      .set('Authorization', `Bearer ${platformToken}`);
    expect(nonCustomer.status).toBe(403);
  });

  it('keeps payment initiation idempotent and explicitly pending without a provider', async () => {
    const first = await request(app)
      .post(`/v1/payments/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', 'commerce-test-payment-1');
    const second = await request(app)
      .post(`/v1/payments/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', 'commerce-test-payment-1');

    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe('PENDING');
    expect(first.body.data.provider).toBe('unavailable');
    expect(second.body.data.id).toBe(first.body.data.id);

    const concurrent = await Promise.all([
      request(app)
        .post(`/v1/payments/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', 'commerce-test-payment-concurrent'),
      request(app)
        .post(`/v1/payments/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', 'commerce-test-payment-concurrent'),
    ]);
    expect(concurrent[0].body.data.id).toBe(concurrent[1].body.data.id);
  });

  it('rejects unverifiable payment webhooks', async () => {
    const response = await request(app)
      .post('/v1/payments/webhooks/unavailable')
      .send({ provider_reference: 'missing', status: 'SUCCESS' });
    expect(response.status).toBe(403);
  });

  it('queues notifications and records provider failures instead of claiming delivery', async () => {
    const id = await NotificationService.queueNotification({
      userId: 'c0000000-0000-0000-0000-000000000006',
      type: 'COMMERCE_TEST',
      referenceType: 'ORDER',
      referenceId: orderId,
    });
    const duplicateId = await NotificationService.queueNotification({
      userId: 'c0000000-0000-0000-0000-000000000006',
      type: 'COMMERCE_TEST',
      referenceType: 'ORDER',
      referenceId: orderId,
    });
    expect(duplicateId).toBe(id);
    const notification = await NotificationService.dispatch(id);
    expect(notification.status).toBe('FAILED');
    expect(notification.provider_message_id).toBeNull();
    expect(notification.last_error).toContain('provider');
  });

  it('parses quoted CSV fields and exposes completed sync history', async () => {
    const rows = IntegrationService.parseCSV(
      'Medicine Name,Quantity,Unit Price,SKU\n"Paracetamol, 500mg",2,12.50,"SKU-1"'
    );
    expect(rows).toEqual([{
      medicine_name: 'Paracetamol, 500mg',
      quantity: '2',
      unit_price: '12.50',
      external_product_id: 'SKU-1',
    }]);

    const result = await IntegrationService.processFileImport(
      'e1111111-1111-1111-1111-111111111111',
      [{ medicine_name: 'Paracetamol 500mg', quantity: 2, unit_price: 12.5, external_product_id: 'SKU-2' }],
      'c0000000-0000-0000-0000-000000000002'
    );
    const history = await IntegrationService.getSyncHistory('e1111111-1111-1111-1111-111111111111');
    expect(result.status).toBe('SUCCESS');
    expect(history.some((item) => item.id === result.sync_id && item.status === 'SUCCESS')).toBe(true);
  });

  it('keeps pharmacy onboarding pending and does not create a privileged public registration role', async () => {
    const email = `commerce-${Date.now()}@example.com`;
    const registration = await request(app).post('/v1/auth/register').send({
      first_name: 'Pilot',
      email,
      password: 'Password123!',
      role: 'PHARMACY_ADMIN',
    });
    expect(registration.status).toBe(422);

    const customer = await request(app).post('/v1/auth/register').send({
      first_name: 'Pilot',
      email: `customer-${Date.now()}@example.com`,
      password: 'Password123!',
    });
    expect(customer.status).toBe(201);
    expect(customer.body.data.user.role).toBe('CUSTOMER');
  });

  it('lets platform operations review demo pharmacies through protected verification workflow', async () => {
    const forbidden = await request(app)
      .get('/v1/platform/pharmacies');
    expect(forbidden.status).toBe(401);

    const platformLogin = await request(app).post('/v1/auth/login').send({
      identifier: 'ops@pharmalink.gh',
      password: 'Password123!',
    });
    expect(platformLogin.status).toBe(200);
    const demoPlatformToken = platformLogin.body.data.token;

    const list = await request(app)
      .get('/v1/platform/pharmacies')
      .set('Authorization', `Bearer ${demoPlatformToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((pharmacy: any) => pharmacy.verification_status === 'PENDING')).toBe(true);

    const update = await request(app)
      .patch('/v1/platform/pharmacies/e5555555-5555-5555-5555-555555555555/verification')
      .set('Authorization', `Bearer ${demoPlatformToken}`)
      .send({ verification_status: 'VERIFIED' });
    expect(update.status).toBe(200);
    expect(update.body.data.verification_status).toBe('VERIFIED');

    const audit = await request(app)
      .get('/v1/platform/audit?limit=10')
      .set('Authorization', `Bearer ${demoPlatformToken}`);
    expect(audit.status).toBe(200);
    expect(audit.body.data.some((event: any) => event.event_type === 'PHARMACY_VERIFICATION_UPDATED')).toBe(true);
  });
});
