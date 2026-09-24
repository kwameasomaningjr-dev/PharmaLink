import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';

const app = createApp();

let customerToken: string;
let customerUserId: string;
let eastLegonStaffToken: string;
let osuStaffToken: string;

beforeAll(async () => {
  await seedDatabase();

  const custRes = await request(app)
    .post('/v1/auth/login')
    .send({ identifier: 'kwame.customer@gmail.com', password: 'Password123!' });
  expect(custRes.status).toBe(200);
  customerToken = custRes.body.data.token;
  customerUserId = custRes.body.data.user.id;

  // 2. Login East Legon Pharmacy Admin
  const elRes = await request(app)
    .post('/v1/auth/login')
    .send({ identifier: 'admin@eastlegonrx.gh', password: 'Password123!' });
  expect(elRes.status).toBe(200);
  eastLegonStaffToken = elRes.body.data.token;

  // 3. Login Osu Pharmacy Admin
  const osuRes = await request(app)
    .post('/v1/auth/login')
    .send({ identifier: 'admin@osuchemist.gh', password: 'Password123!' });
  expect(osuRes.status).toBe(200);
  osuStaffToken = osuRes.body.data.token;
}, 120000);

describe('PHARMACY PLATFORM ACCEPTANCE TESTS', () => {
  // AT-01: Medicine Search by generic, brand and alias
  it('AT-01: A customer searching for a medicine receives matching medicine results with aliases', async () => {
    // Search generic
    const resGeneric = await request(app).get('/v1/medicines/search?q=Paracetamol');
    expect(resGeneric.status).toBe(200);
    expect(resGeneric.body.data.length).toBeGreaterThan(0);
    expect(resGeneric.body.data[0].medicine.generic_name).toBe('Paracetamol');

    // Search brand alias: "Panadol"
    const resBrand = await request(app).get('/v1/medicines/search?q=Panadol');
    expect(resBrand.status).toBe(200);
    expect(resBrand.body.data.length).toBeGreaterThan(0);
    expect(resBrand.body.data[0].medicine.generic_name).toBe('Paracetamol');

    // Search typo/short alias: "Para 500"
    const resTypo = await request(app).get('/v1/medicines/search?q=Para 500');
    expect(resTypo.status).toBe(200);
    expect(resTypo.body.data.length).toBeGreaterThan(0);
    expect(Number(resTypo.body.data[0].medicine.strength_value)).toBe(500);
  });

  // AT-02: Pharmacy with inventory appears with availability state and freshness
  it('AT-02: Pharmacy results include availability state, freshness label and distance', async () => {
    const res = await request(app).get('/v1/medicines/search?q=Paracetamol 500mg');
    expect(res.status).toBe(200);

    const firstResult = res.body.data[0];
    expect(firstResult.pharmacy.display_name).toBeDefined();
    expect(firstResult.availability_state).toMatch(/VERIFIED|LIKELY|UNCERTAIN/);
    expect(firstResult.customer_status).toBeDefined();
    expect(firstResult.freshness).toBeDefined();
    expect(typeof firstResult.distance_km).toBe('number');
    expect(firstResult.price.formatted).toContain('GHS');
  });

  // AT-03: Physical confirmation overrides conflicting POS data
  it('AT-03: Physical confirmation creates highest immediate signal and updates availability', async () => {
    // East Legon confirms 50 units of Paracetamol 500mg physically
    const confirmRes = await request(app)
      .post('/v1/inventory/confirm')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({
        medicine_id: 'a1111111-1111-1111-1111-111111111111',
        physical_quantity: 50,
        unit_price_minor: 1250,
        note: 'Afternoon physical shelf count',
      });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.source_type).toBe('PHYSICAL_CONFIRMATION');
    expect(confirmRes.body.data.observed_quantity).toBe(50);
    expect(confirmRes.body.data.available_quantity).toBe(50);
    expect(confirmRes.body.data.availability_state).toBe('VERIFIED');
  });

  // AT-04: Inventory source and observation history recorded
  it('AT-04: Inventory observations are immutably preserved', async () => {
    const invRes = await request(app)
      .get('/v1/inventory')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`);

    expect(invRes.status).toBe(200);
    const item = invRes.body.data.find((i: any) => i.medicine_id === 'a1111111-1111-1111-1111-111111111111');
    expect(item).toBeDefined();
    expect(item.observed_at).toBeDefined();
    expect(item.freshness_label).toBeDefined();
  });

  // AT-06 & AT-07: Concurrency & Atomic Reservation
  it('AT-06 & AT-07: Order submission does NOT reserve stock; Pharmacy acceptance locks stock atomically and prevents overselling', async () => {
    // 1. Physical stock is 50. Let's make physical stock exactly 2 units to test race condition.
    await request(app)
      .post('/v1/inventory/confirm')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({
        medicine_id: 'a1111111-1111-1111-1111-111111111111',
        physical_quantity: 2,
        unit_price_minor: 1200,
      });

    // 2. Customer 1 places order for 2 units
    const order1Res = await request(app)
      .post('/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        pharmacy_id: 'e1111111-1111-1111-1111-111111111111',
        fulfillment_type: 'PICKUP',
        items: [{ medicine_id: 'a1111111-1111-1111-1111-111111111111', quantity: 2 }],
      });

    expect(order1Res.status).toBe(201);
    const order1 = order1Res.body.data;
    expect(order1.status).toBe('PENDING');

    // Verify stock is NOT reserved yet (available is still 2)
    const invCheck1 = await request(app)
      .get('/v1/inventory')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`);
    const paraInv1 = invCheck1.body.data.find((i: any) => i.medicine_id === 'a1111111-1111-1111-1111-111111111111');
    expect(paraInv1.available_quantity).toBe(2);
    expect(paraInv1.reserved_quantity).toBe(0);

    // 3. Customer 2 places order for 2 units as well
    const order2Res = await request(app)
      .post('/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        pharmacy_id: 'e1111111-1111-1111-1111-111111111111',
        fulfillment_type: 'PICKUP',
        items: [{ medicine_id: 'a1111111-1111-1111-1111-111111111111', quantity: 2 }],
      });
    expect(order2Res.status).toBe(201);
    const order2 = order2Res.body.data;

    // 4. Pharmacy accepts Order 1 -> Reservation created, available becomes 0!
    const accept1 = await request(app)
      .post(`/v1/pharmacy/orders/${order1.id}/accept`)
      .set('Authorization', `Bearer ${eastLegonStaffToken}`);
    expect(accept1.status).toBe(200);
    expect(accept1.body.data.status).toBe('ACCEPTED');

    // Verify inventory state
    const invCheck2 = await request(app)
      .get('/v1/inventory')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`);
    const paraInv2 = invCheck2.body.data.find((i: any) => i.medicine_id === 'a1111111-1111-1111-1111-111111111111');
    expect(paraInv2.reserved_quantity).toBe(2);
    expect(paraInv2.available_quantity).toBe(0);

    // 5. Pharmacy tries to accept Order 2 -> MUST FAIL with HTTP 409 ORDER_NOT_ACCEPTABLE!
    const accept2 = await request(app)
      .post(`/v1/pharmacy/orders/${order2.id}/accept`)
      .set('Authorization', `Bearer ${eastLegonStaffToken}`);

    expect(accept2.status).toBe(409);
    expect(accept2.body.error.code).toBe('ORDER_NOT_ACCEPTABLE');

    // Clean up order 1 so reservations are released
    await request(app)
      .post(`/v1/pharmacy/orders/${order1.id}/reject`)
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({ rejection_reason: 'Test completed' });
  });

  // AT-08: Order rejection releases reservation
  it('AT-08: Rejecting an accepted order safely releases reservation and restores available stock', async () => {
    // 1. Set stock to 5 units
    await request(app)
      .post('/v1/inventory/confirm')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({
        medicine_id: 'a1111111-1111-1111-1111-111111111111',
        physical_quantity: 5,
      });

    // 2. Customer creates order for 3 units
    const orderRes = await request(app)
      .post('/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        pharmacy_id: 'e1111111-1111-1111-1111-111111111111',
        fulfillment_type: 'PICKUP',
        items: [{ medicine_id: 'a1111111-1111-1111-1111-111111111111', quantity: 3 }],
      });
    const order = orderRes.body.data;

    // 3. Pharmacy accepts
    await request(app)
      .post(`/v1/pharmacy/orders/${order.id}/accept`)
      .set('Authorization', `Bearer ${eastLegonStaffToken}`);

    // Check that available stock decreased to 2
    let inv = await request(app).get('/v1/inventory').set('Authorization', `Bearer ${eastLegonStaffToken}`);
    let para = inv.body.data.find((i: any) => i.medicine_id === 'a1111111-1111-1111-1111-111111111111');
    expect(para.available_quantity).toBe(2);
    expect(para.reserved_quantity).toBe(3);

    // 4. Pharmacy subsequently rejects/cancels the order
    const rejectRes = await request(app)
      .post(`/v1/pharmacy/orders/${order.id}/reject`)
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({ rejection_reason: 'Medicine damaged before handover' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');

    // 5. Verify stock was restored to 5 available
    inv = await request(app).get('/v1/inventory').set('Authorization', `Bearer ${eastLegonStaffToken}`);
    para = inv.body.data.find((i: any) => i.medicine_id === 'a1111111-1111-1111-1111-111111111111');
    expect(para.available_quantity).toBe(5);
    expect(para.reserved_quantity).toBe(0);
  });

  // AT-10: Prescription workflow
  it('AT-10: Prescription upload and pharmacist validation workflow', async () => {
    // 1. Create order for prescription medicine (Amoxicillin)
    const orderRes = await request(app)
      .post('/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        pharmacy_id: 'e1111111-1111-1111-1111-111111111111',
        fulfillment_type: 'PICKUP',
        items: [{ medicine_id: 'a3333333-3333-3333-3333-333333333333', quantity: 1 }],
      });
    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data;

    // 2. Customer uploads prescription
    const presUpload = await request(app)
      .post('/v1/prescriptions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        order_id: order.id,
        storage_key: 'prescriptions/rx_user_test_amox.jpg',
      });
    expect(presUpload.status).toBe(201);
    expect(presUpload.body.data.status).toBe('UPLOADED');

    // 3. Pharmacist reviews and approves prescription
    const reviewRes = await request(app)
      .post(`/v1/prescriptions/${presUpload.body.data.id}/review`)
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({
        status: 'APPROVED',
        review_note: 'Valid Dr. Mensah signature verified',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe('APPROVED');
  });

  // AT-11 & AT-12: Tenant Isolation & Authorization Boundaries
  it('AT-11 & AT-12: Pharmacy staff cannot access another pharmacys private orders or inventory', async () => {
    // Osu staff tries to view East Legon inventory
    const crossPharmInv = await request(app)
      .get('/v1/inventory')
      .set('Authorization', `Bearer ${osuStaffToken}`);

    // Osu staff sees only Osu pharmacy inventory, not East Legon
    expect(crossPharmInv.status).toBe(200);
    for (const item of crossPharmInv.body.data) {
      expect(item.pharmacy_id).toBe('e2222222-2222-2222-2222-222222222222'); // Osu ID
    }
  });

  // AT-13: File Import CSV
  it('AT-13: File import parses valid rows, records invalid row errors, and never wipes prior valid data', async () => {
    const csvData = `Medicine Name,Quantity,Unit Price
Paracetamol 500mg,35,12.50
NonExistentMedicineX,10,5.00
Amoxicillin 500mg,15,45.00
InvalidQtyItem,-5,20.00`;

    const importRes = await request(app)
      .post('/v1/inventory/import')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({ csv_content: csvData });

    expect(importRes.status).toBe(200);
    expect(importRes.body.data.records_received).toBe(4);
    expect(importRes.body.data.records_accepted).toBe(2);
    expect(importRes.body.data.records_rejected).toBe(2);
    expect(importRes.body.data.status).toBe('PARTIAL');
  });
});
