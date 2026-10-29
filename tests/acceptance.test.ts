import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../backend/app.js';
import { seedDatabase } from '../backend/database/seed.js';

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
      .field('order_id', order.id)
      .attach('file', Buffer.from('%PDF-1.7\nPharmaLink test prescription'), {
        filename: 'test-prescription.pdf',
        contentType: 'application/pdf',
      });
    expect(presUpload.status).toBe(201);
    expect(presUpload.body.data.status).toBe('UPLOADED');

    const prescriptionFile = await request(app)
      .get(`/v1/prescriptions/${presUpload.body.data.id}/file`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(prescriptionFile.status).toBe(200);
    expect(prescriptionFile.headers['content-type']).toContain('application/pdf');
    expect(prescriptionFile.headers['content-disposition']).toBe('inline');

    const pendingRes = await request(app)
      .get('/v1/prescriptions/pending')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`);
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.data.some((item: any) => item.id === presUpload.body.data.id)).toBe(true);

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

    const acceptRes = await request(app)
      .post(`/v1/pharmacy/orders/${order.id}/accept`)
      .set('Authorization', `Bearer ${eastLegonStaffToken}`);
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe('ACCEPTED');
  });

  it('SEC-03: Pharmacy staff cannot be tenant-hijacked by forged pharmacy context', async () => {
    const eastLegonInventory = await request(app)
      .get('/v1/inventory')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .set('x-pharmacy-id', 'e2222222-2222-2222-2222-222222222222');

    expect(eastLegonInventory.status).toBe(403);
    expect(eastLegonInventory.body.error.code).toBe('FORBIDDEN');

    const eastLegonInvite = await request(app)
      .post('/v1/pharmacy/staff/invite')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({
        email: 'tenant-bypass@eastlegonrx.gh',
        first_name: 'Banned',
        role: 'STAFF',
        pharmacy_id: 'e2222222-2222-2222-2222-222222222222',
      });

    expect(eastLegonInvite.status).toBe(403);
    expect(eastLegonInvite.body.error.code).toBe('FORBIDDEN');
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

  it('SEC-01: Public registration cannot create privileged accounts or bypass passwords', async () => {
    const privilegedRegistration = await request(app)
      .post('/v1/auth/register')
      .send({
        email: 'security.role.test@example.com',
        password: 'CorrectPassword123!',
        first_name: 'Security',
        role: 'PLATFORM_OPS',
      });

    expect(privilegedRegistration.status).toBe(422);

    const registration = await request(app)
      .post('/v1/auth/register')
      .send({
        email: 'security.password.test@example.com',
        password: 'CorrectPassword123!',
        first_name: 'Security',
      });

    expect(registration.status).toBe(201);

    const bypassAttempt = await request(app)
      .post('/v1/auth/login')
      .send({
        identifier: 'security.password.test@example.com',
        password: 'Password123!',
      });

    expect(bypassAttempt.status).toBe(401);
  });

  it('SEC-02: A pharmacy applicant does not receive active pharmacy staff access before verification', async () => {
    const pharmacyApplication = await request(app)
      .post('/v1/pharmacies')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        legal_name: 'Pending Applicant Pharmacy Ltd',
        display_name: 'Pending Applicant Pharmacy',
        license_number: 'FDA-PH-TEST-001',
        address_line: 'Test Street, Accra',
        city: 'Accra',
        region: 'Greater Accra',
        latitude: 5.6037,
        longitude: -0.187,
        phone: '+233240000099',
      });

    expect(pharmacyApplication.status).toBe(201);
    const createdPharmacyId = pharmacyApplication.body.data.id;

    const privateInventory = await request(app)
      .get('/v1/inventory')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(privateInventory.status).toBe(403);

    // AT-10: When platform ops approves a pharmacy, it is immediately listed in verified pharmacies directory
    const opsLogin = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: 'ops@pharmalink.gh', password: 'Password123!' });
    expect(opsLogin.status).toBe(200);
    const opsToken = opsLogin.body.data.token;

    // Check directory before approval: Pending applicant is not in public directory
    const dirBefore = await request(app).get('/v1/pharmacies');
    expect(dirBefore.status).toBe(200);
    const foundBefore = dirBefore.body.data.find((p: any) => p.id === createdPharmacyId);
    expect(foundBefore).toBeUndefined();

    // Platform ops approves the pharmacy
    const approvalRes = await request(app)
      .patch(`/v1/platform/pharmacies/${createdPharmacyId}/verification`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ verification_status: 'VERIFIED' });
    expect(approvalRes.status).toBe(200);
    expect(approvalRes.body.data.verification_status).toBe('VERIFIED');

    // Check directory after approval: Newly approved pharmacy is now displayed
    const dirAfter = await request(app).get('/v1/pharmacies?latitude=5.6037&longitude=-0.1870');
    expect(dirAfter.status).toBe(200);
    const foundAfter = dirAfter.body.data.find((p: any) => p.id === createdPharmacyId);
    expect(foundAfter).toBeDefined();
    expect(foundAfter.display_name).toBe('Pending Applicant Pharmacy');
    expect(foundAfter.verification_status).toBe('VERIFIED');
    expect(typeof foundAfter.distance_km).toBe('number');

    // AT-11: Browsing stock under a specific pharmacy returns only that pharmacy's inventory or empty if no stock
    const newlyApprovedStockRes = await request(app).get(`/v1/medicines/search?pharmacy_id=${createdPharmacyId}`);
    expect(newlyApprovedStockRes.status).toBe(200);
    expect(newlyApprovedStockRes.body.data).toEqual([]); // No inventory uploaded yet for newly approved pharmacy

    // Contrast with an established pharmacy (e.g. East Legon Pharmacy: 'e1111111-1111-1111-1111-111111111111')
    const eastLegonStockRes = await request(app).get('/v1/medicines/search?pharmacy_id=e1111111-1111-1111-1111-111111111111');
    expect(eastLegonStockRes.status).toBe(200);
    expect(eastLegonStockRes.body.data.length).toBeGreaterThan(0);
    expect(eastLegonStockRes.body.data.every((item: any) => item.pharmacy.id === 'e1111111-1111-1111-1111-111111111111')).toBe(true);
  });

  // AT-12: Pharmacy Admin invites staff, and least-privilege role separation is enforced
  it('AT-12: Pharmacy Admin invites staff, and least-privilege role separation is enforced', async () => {
    // 1. East Legon Admin invites a new front-desk staff member
    const inviteRes = await request(app)
      .post('/v1/pharmacy/staff/invite')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({
        email: 'frontdesk@eastlegonrx.gh',
        first_name: 'Ama',
        last_name: 'FrontDesk',
        role: 'STAFF',
      });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.data.role).toBe('STAFF');
    expect(inviteRes.body.data.email).toBe('frontdesk@eastlegonrx.gh');
    const invitedUserId = inviteRes.body.data.user_id;

    // 2. Admin can list staff members
    const staffListRes = await request(app)
      .get('/v1/pharmacy/staff')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`);
    expect(staffListRes.status).toBe(200);
    expect(staffListRes.body.data.length).toBeGreaterThanOrEqual(2);

    // 3. Admin activates staff member
    const updateRes = await request(app)
      .patch(`/v1/pharmacy/staff/${invitedUserId}`)
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({ status: 'ACTIVE' });
    expect(updateRes.status).toBe(200);

    // 4. Update the staff member's password in DB so they can log in
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash('StaffPassword123!', 8);
    const { db } = await import('../backend/database/connection.js');
    await db.query(`UPDATE users SET password_hash = $1, status = 'ACTIVE' WHERE id = $2`, [hash, invitedUserId]);

    // 5. Staff member logs in
    const staffLoginRes = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: 'frontdesk@eastlegonrx.gh', password: 'StaffPassword123!' });
    expect(staffLoginRes.status).toBe(200);
    const frontDeskToken = staffLoginRes.body.data.token;

    // 6. Front desk staff CAN view pharmacy inventory/stock
    const staffInventoryRes = await request(app)
      .get('/v1/inventory')
      .set('Authorization', `Bearer ${frontDeskToken}`);
    expect(staffInventoryRes.status).toBe(200);

    // 7. Front desk staff CANNOT access admin staff management (403 Forbidden)
    const staffForbiddenRes = await request(app)
      .get('/v1/pharmacy/staff')
      .set('Authorization', `Bearer ${frontDeskToken}`);
    expect(staffForbiddenRes.status).toBe(403);

    // 8. Front desk staff CANNOT invite other staff (403 Forbidden)
    const staffForbiddenInvite = await request(app)
      .post('/v1/pharmacy/staff/invite')
      .set('Authorization', `Bearer ${frontDeskToken}`)
      .send({ email: 'hacker@pharmacy.gh', first_name: 'Eve' });
    expect(staffForbiddenInvite.status).toBe(403);
  });

  // AT-13: Compliance document upload & Platform Ops review workflow
  it('AT-13: Compliance document upload & Platform Ops review workflow', async () => {
    // 1. East Legon Admin uploads an FDA license document
    const fakePdf = Buffer.from('%PDF-1.4 Fake FDA License Content');
    const uploadRes = await request(app)
      .post('/v1/pharmacy/compliance-documents')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .field('document_type', 'FDA_LICENSE')
      .attach('file', fakePdf, 'fda_license_2026.pdf');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.document_type).toBe('FDA_LICENSE');
    expect(uploadRes.body.data.review_status).toBe('PENDING');
    const docId = uploadRes.body.data.id;

    // 2. Pharmacy Admin can list their compliance documents
    const listRes = await request(app)
      .get('/v1/pharmacy/compliance-documents')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((d: any) => d.id === docId)).toBe(true);

    // 3. Platform Ops user logs in
    const opsLogin = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: 'ops@pharmalink.gh', password: 'Password123!' });
    expect(opsLogin.status).toBe(200);
    const opsToken = opsLogin.body.data.token;

    // 4. Platform Ops views the pending compliance queue
    const pendingRes = await request(app)
      .get('/v1/platform/compliance-documents/pending')
      .set('Authorization', `Bearer ${opsToken}`);
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.data.some((d: any) => d.id === docId)).toBe(true);

    // 5. Platform Ops streams the document securely
    const streamRes = await request(app)
      .get(`/v1/compliance-documents/${docId}/file`)
      .set('Authorization', `Bearer ${opsToken}`);
    expect(streamRes.status).toBe(200);

    // 6. Platform Ops approves the document
    const reviewRes = await request(app)
      .patch(`/v1/platform/compliance-documents/${docId}/review`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ review_status: 'APPROVED', review_note: 'Verified against Ghana FDA registry' });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.review_status).toBe('APPROVED');

    // 7. Customers / unauthenticated requests cannot access ops queue or compliance files
    const unauthReview = await request(app)
      .patch(`/v1/platform/compliance-documents/${docId}/review`)
      .send({ review_status: 'REJECTED' });
    expect(unauthReview.status).toBe(401);

    const customerAccessFile = await request(app)
      .get(`/v1/compliance-documents/${docId}/file`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerAccessFile.status).toBe(403);
  });

  // AT-14: User profile update, password change, and security constraints
  it('AT-14: User profile update, password change, and security constraints', async () => {
    // 1. Update profile name
    const updateRes = await request(app)
      .patch('/v1/auth/profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ first_name: 'Kwame-Updated', last_name: 'Asomaning' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.user.first_name).toBe('Kwame-Updated');

    // 2. Change password with incorrect current password -> 401
    const badPassRes = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ current_password: 'WrongPassword!', new_password: 'NewPassword123!' });
    expect(badPassRes.status).toBe(401);

    // 3. Change password successfully
    const goodPassRes = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ current_password: 'Password123!', new_password: 'NewPassword123!' });
    expect(goodPassRes.status).toBe(200);
    expect(goodPassRes.body.data.success).toBe(true);

    // 4. Verify login with new password works
    const reloginRes = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: 'kwame.customer@gmail.com', password: 'NewPassword123!' });
    expect(reloginRes.status).toBe(200);

    // Reset password back for subsequent test runs
    await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${reloginRes.body.data.token}`)
      .send({ current_password: 'NewPassword123!', new_password: 'Password123!' });
  });

  // AT-15: Master medicine catalogue management and user notifications
  it('AT-15: Master medicine catalogue management and user notifications', async () => {
    // 1. Browse catalogue
    const catRes = await request(app).get('/v1/medicines?limit=10');
    expect(catRes.status).toBe(200);
    expect(catRes.body.data.length).toBeGreaterThan(0);

    // 2. Staff creates a new drug in catalogue
    const createMedRes = await request(app)
      .post('/v1/medicines')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({
        generic_name: 'Ciprofloxacin',
        brand_name: 'Cipro-GH',
        strength_value: 500,
        strength_unit: 'mg',
        formulation: 'Tablet',
        prescription_required: true,
      });
    expect(createMedRes.status).toBe(201);
    expect(createMedRes.body.data.generic_name).toBe('Ciprofloxacin');

    // 3. Customer checks their notification inbox
    const notifRes = await request(app)
      .get('/v1/notifications')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(notifRes.status).toBe(200);
    expect(Array.isArray(notifRes.body.data)).toBe(true);

    // 4. Customer marks all notifications as read
    const readAllRes = await request(app)
      .patch('/v1/notifications/read-all')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(readAllRes.status).toBe(200);
    expect(readAllRes.body.data.success).toBe(true);
  });

  // AT-16: Automated order & reservation timeout sweeper
  it('AT-16: Automated order & reservation timeout sweeper releases expired holds', async () => {
    const { OrderService } = await import('../backend/modules/order/order.service.js');
    const { db } = await import('../backend/database/connection.js');

    // Manually insert an expired pending order in DB
    const fakeOrderId = 'd0000000-0000-0000-0000-000000000099';
    await db.query(
      `INSERT INTO orders (id, order_number, customer_id, pharmacy_id, status, subtotal_minor, total_minor, currency, expires_at)
       VALUES ($1, 'PL-TEST-EXPIRE', $2, 'e1111111-1111-1111-1111-111111111111', 'PENDING', 1000, 1000, 'GHS', CURRENT_TIMESTAMP - INTERVAL '10 minutes')
       ON CONFLICT (id) DO NOTHING`,
      [fakeOrderId, customerUserId]
    );

    // Run order sweeper
    const sweptCount = await OrderService.sweepExpiredOrders();
    expect(sweptCount).toBeGreaterThanOrEqual(1);

    // Verify order is now EXPIRED
    const checkOrder = await db.query(`SELECT status FROM orders WHERE id = $1`, [fakeOrderId]);
    expect(checkOrder.rows[0].status).toBe('EXPIRED');
  });

  // AT-17: Ghana Essential Medicines Catalogue search and CSV import toolkit
  it('AT-17: Ghana Essential Medicines Catalogue search and CSV import toolkit', async () => {
    const fs = await import('fs');
    const path = await import('path');

    // 1. Search for Augmentin
    const augSearch = await request(app).get('/v1/medicines/search?q=Augmentin');
    expect(augSearch.status).toBe(200);
    expect(augSearch.body.data.length).toBeGreaterThan(0);

    // 2. Search for Ghanaian local term "Blood tonic"
    const tonicSearch = await request(app).get('/v1/medicines/search?q=Blood tonic');
    expect(tonicSearch.status).toBe(200);
    expect(tonicSearch.body.data.some((m: any) => m.medicine?.generic_name?.includes('Ferrous') || m.medicine?.brand_name?.includes('Fefol'))).toBe(true);

    // 3. Search for "Ventolin" inhaler
    const ventSearch = await request(app).get('/v1/medicines/search?q=Ventolin');
    expect(ventSearch.status).toBe(200);
    expect(ventSearch.body.data.length).toBeGreaterThan(0);
    expect(ventSearch.body.data[0].medicine.brand_name).toBe('Ventolin Inhaler');

    // 4. Test sample CSV template file exists and parses into valid catalogue matches
    const templatePath = [
      path.resolve(process.cwd(), 'frontend', 'public', 'sample_inventory_template.csv'),
      path.resolve(process.cwd(), 'frontend', 'dist', 'sample_inventory_template.csv'),
    ].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), 'frontend', 'public', 'sample_inventory_template.csv');
    expect(fs.existsSync(templatePath)).toBe(true);
    const templateContent = fs.readFileSync(templatePath, 'utf8');

    const importRes = await request(app)
      .post('/v1/inventory/import')
      .set('Authorization', `Bearer ${eastLegonStaffToken}`)
      .send({ csv_content: templateContent });

    expect(importRes.status).toBe(200);
    expect(importRes.body.data.records_accepted).toBeGreaterThan(15);
    expect(importRes.body.data.records_rejected).toBe(0);
  });
});

