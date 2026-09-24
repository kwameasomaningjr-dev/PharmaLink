import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from './connection.js';
import { runMigrations } from './migrate.js';

export async function seedDatabase(force = false) {
  console.log('[Seed] Ensuring schema exists...');
  try {
    const existing = await db.query('SELECT COUNT(*) as cnt FROM users');
    if (!force && Number(existing.rows[0]?.cnt) > 0 && process.env.NODE_ENV !== 'test') {
      console.log(`[Seed] Database already seeded (${existing.rows[0].cnt} users). Ready.`);
      return;
    }
  } catch {
    await runMigrations();
  }

  // Hash dynamically once with 8 rounds (<10ms)
  const passwordHash = bcrypt.hashSync('Password123!', 8);

  // 1. Deterministic Users
  const platformAdminId = 'c0000000-0000-0000-0000-000000000001';
  const eastLegonAdminId = 'c0000000-0000-0000-0000-000000000002';
  const osuAdminId = 'c0000000-0000-0000-0000-000000000003';
  const airportAdminId = 'c0000000-0000-0000-0000-000000000004';
  const spintexAdminId = 'c0000000-0000-0000-0000-000000000005';
  const customer1Id = 'c0000000-0000-0000-0000-000000000006';
  const customer2Id = 'c0000000-0000-0000-0000-000000000007';

  // Wipe data/pglite or clear existing tables if re-seeding
  await db.exec('DELETE FROM reservations; DELETE FROM order_items; DELETE FROM orders; DELETE FROM inventory_observations; DELETE FROM inventory; DELETE FROM pharmacy_users; DELETE FROM users; DELETE FROM pharmacies; DELETE FROM medicine_aliases; DELETE FROM medicines;');

  const usersToSeed = [
    { id: platformAdminId, email: 'ops@pharmalink.gh', phone: '+233200000001', role: 'PLATFORM_OPS', first: 'Kofi', last: 'Admin' },
    { id: eastLegonAdminId, email: 'admin@eastlegonrx.gh', phone: '+233240000002', role: 'PHARMACY_ADMIN', first: 'Akua', last: 'Owusu' },
    { id: osuAdminId, email: 'admin@osuchemist.gh', phone: '+233240000003', role: 'PHARMACY_ADMIN', first: 'Kwesi', last: 'Baah' },
    { id: airportAdminId, email: 'admin@airportrx.gh', phone: '+233240000004', role: 'PHARMACY_ADMIN', first: 'Efua', last: 'Mensah' },
    { id: spintexAdminId, email: 'admin@spintexcare.gh', phone: '+233240000005', role: 'PHARMACY_ADMIN', first: 'Esi', last: 'Acheampong' },
    { id: customer1Id, email: 'kwame.customer@gmail.com', phone: '+233550000006', role: 'CUSTOMER', first: 'Kwame', last: 'Asomaning' },
    { id: customer2Id, email: 'abena.customer@yahoo.com', phone: '+233550000007', role: 'CUSTOMER', first: 'Abena', last: 'Kusi' },
  ];

  for (const u of usersToSeed) {
    await db.query(
      `INSERT INTO users (id, email, phone, password_hash, role, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')`,
      [u.id, u.email, u.phone, passwordHash, u.role, u.first, u.last]
    );
  }

  // 2. Pharmacies
  const pEastLegon = 'e1111111-1111-1111-1111-111111111111';
  const pOsu = 'e2222222-2222-2222-2222-222222222222';
  const pAirport = 'e3333333-3333-3333-3333-333333333333';
  const pSpintex = 'e4444444-4444-4444-4444-444444444444';

  const defaultHours = JSON.stringify({
    mon_fri: '08:00 - 21:00',
    saturday: '08:00 - 20:00',
    sunday: '10:00 - 18:00',
  });

  await db.query(
    `INSERT INTO pharmacies (id, legal_name, display_name, license_number, verification_status, address_line, city, region, latitude, longitude, phone, email, opening_hours, fulfillment_options)
     VALUES
     ($1, 'East Legon Healthline Pharmacy Ltd', 'East Legon Pharmacy', 'FDA-PH-2023-0101', 'VERIFIED', 'Lagos Avenue, East Legon', 'Accra', 'Greater Accra', 5.635800, -0.158400, '+233302111222', 'eastlegon@pharmalink.gh', $5, '{"pickup": true, "delivery": true, "delivery_base_fee_minor": 2000, "delivery_radius_km": 10, "response_window_minutes": 15}'),
     ($2, 'Osu Standard Chemist Ltd', 'Osu Standard Chemist', 'FDA-PH-2022-0452', 'VERIFIED', 'Oxford Street, Osu', 'Accra', 'Greater Accra', 5.556000, -0.182100, '+233302222333', 'osu@pharmalink.gh', $5, '{"pickup": true, "delivery": true, "delivery_base_fee_minor": 1500, "delivery_radius_km": 8, "response_window_minutes": 20}'),
     ($3, 'Airport Residential Pharmacy Services', 'Airport Residential Pharmacy', 'FDA-PH-2021-0899', 'VERIFIED', 'Airport Residential Area, Accra', 'Accra', 'Greater Accra', 5.603700, -0.187000, '+233302333444', 'airport@pharmalink.gh', $5, '{"pickup": true, "delivery": false, "delivery_base_fee_minor": 0, "delivery_radius_km": 0, "response_window_minutes": 10}'),
     ($4, 'Spintex Community Care Pharmacy', 'Spintex Care Pharmacy', 'FDA-PH-2023-1120', 'VERIFIED', 'Spintex Road near Coastal Junction', 'Accra', 'Greater Accra', 5.623100, -0.102500, '+233302444555', 'spintex@pharmalink.gh', $5, '{"pickup": true, "delivery": true, "delivery_base_fee_minor": 2500, "delivery_radius_km": 12, "response_window_minutes": 30}')
     ON CONFLICT (id) DO NOTHING`,
    [pEastLegon, pOsu, pAirport, pSpintex, defaultHours]
  );

  // Pharmacy Users mapping
  await db.query(
    `INSERT INTO pharmacy_users (id, pharmacy_id, user_id, role, status)
     VALUES
     ('${uuidv4()}', '${pEastLegon}', '${eastLegonAdminId}', 'ADMIN', 'ACTIVE'),
     ('${uuidv4()}', '${pOsu}', '${osuAdminId}', 'ADMIN', 'ACTIVE'),
     ('${uuidv4()}', '${pAirport}', '${airportAdminId}', 'ADMIN', 'ACTIVE'),
     ('${uuidv4()}', '${pSpintex}', '${spintexAdminId}', 'ADMIN', 'ACTIVE')
     ON CONFLICT (pharmacy_id, user_id) DO NOTHING`
  );

  // 3. Canonical Medicines (valid hexadecimal UUIDs)
  const medParacetamolTab = 'a1111111-1111-1111-1111-111111111111';
  const medParacetamolSyr = 'a2222222-2222-2222-2222-222222222222';
  const medAmoxicillinCap = 'a3333333-3333-3333-3333-333333333333';
  const medAmoxicillinSusp = 'a4444444-4444-4444-4444-444444444444';
  const medCoartem = 'a5555555-5555-5555-5555-555555555555';
  const medCipro = 'a6666666-6666-6666-6666-666666666666';
  const medIbuprofen = 'a7777777-7777-7777-7777-777777777777';
  const medCetirizine = 'a8888888-8888-8888-8888-888888888888';

  await db.query(
    `INSERT INTO medicines (id, generic_name, brand_name, strength_value, strength_unit, formulation, pack_size, pack_unit, prescription_required, status)
     VALUES
     ('${medParacetamolTab}', 'Paracetamol', 'Panadol', 500, 'mg', 'Tablet', 10, 'Tablets', false, 'ACTIVE'),
     ('${medParacetamolSyr}', 'Paracetamol', 'Calpol', 120, 'mg/5ml', 'Syrup', 100, 'ml', false, 'ACTIVE'),
     ('${medAmoxicillinCap}', 'Amoxicillin', 'Amoxil', 500, 'mg', 'Capsule', 20, 'Capsules', true, 'ACTIVE'),
     ('${medAmoxicillinSusp}', 'Amoxicillin', 'Amoxil', 250, 'mg/5ml', 'Suspension', 100, 'ml', true, 'ACTIVE'),
     ('${medCoartem}', 'Artemether/Lumefantrine', 'Coartem', 20, 'mg/120mg', 'Tablet', 24, 'Tablets', false, 'ACTIVE'),
     ('${medCipro}', 'Ciprofloxacin', 'Ciprobay', 500, 'mg', 'Tablet', 10, 'Tablets', true, 'ACTIVE'),
     ('${medIbuprofen}', 'Ibuprofen', 'Brufen', 400, 'mg', 'Tablet', 20, 'Tablets', false, 'ACTIVE'),
     ('${medCetirizine}', 'Cetirizine', 'Zyrtec', 10, 'mg', 'Tablet', 10, 'Tablets', false, 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`
  );

  // 4. Medicine Aliases
  const aliases = [
    { medId: medParacetamolTab, alias: 'Paracetamol 500mg', type: 'GENERIC', norm: 'paracetamol 500mg' },
    { medId: medParacetamolTab, alias: 'Panadol 500', type: 'BRAND', norm: 'panadol 500' },
    { medId: medParacetamolTab, alias: 'Panadol Extra', type: 'BRAND', norm: 'panadol extra' },
    { medId: medParacetamolTab, alias: 'Para 500', type: 'TYPO', norm: 'para 500' },
    { medId: medParacetamolTab, alias: 'Acetaminophen 500mg', type: 'GENERIC', norm: 'acetaminophen 500mg' },
    { medId: medParacetamolSyr, alias: 'Paracetamol Syrup', type: 'GENERIC', norm: 'paracetamol syrup' },
    { medId: medParacetamolSyr, alias: 'Calpol Infant', type: 'BRAND', norm: 'calpol infant' },
    { medId: medAmoxicillinCap, alias: 'Amoxicillin 500mg', type: 'GENERIC', norm: 'amoxicillin 500mg' },
    { medId: medAmoxicillinCap, alias: 'Amoxil 500mg', type: 'BRAND', norm: 'amoxil 500mg' },
    { medId: medAmoxicillinCap, alias: 'Amoxycillin', type: 'TYPO', norm: 'amoxycillin' },
    { medId: medCoartem, alias: 'Coartem', type: 'BRAND', norm: 'coartem' },
    { medId: medCoartem, alias: 'Lonart', type: 'BRAND', norm: 'lonart' },
    { medId: medCoartem, alias: 'Malaria medicine', type: 'LOCAL_TERM', norm: 'malaria medicine' },
    { medId: medIbuprofen, alias: 'Ibuprofen 400mg', type: 'GENERIC', norm: 'ibuprofen 400mg' },
    { medId: medIbuprofen, alias: 'Brufen 400', type: 'BRAND', norm: 'brufen 400' },
    { medId: medCetirizine, alias: 'Cetirizine 10mg', type: 'GENERIC', norm: 'cetirizine 10mg' },
    { medId: medCetirizine, alias: 'Zyrtec', type: 'BRAND', norm: 'zyrtec' },
  ];

  for (const a of aliases) {
    await db.query(
      `INSERT INTO medicine_aliases (id, medicine_id, alias, alias_type, normalized_alias)
       VALUES ('${uuidv4()}', '${a.medId}', '${a.alias}', '${a.type}', '${a.norm}')
       ON CONFLICT (medicine_id, normalized_alias) DO NOTHING`
    );
  }

  // 5. Inventory Records across pharmacies
  // East Legon: fresh physical confirmation today
  const inv1 = 'f1111111-1111-1111-1111-111111111111';
  // Osu: POS sync from 2 hours ago
  const inv2 = 'f2222222-2222-2222-2222-222222222222';
  // Airport: manual update 2 days ago (UNCERTAIN)
  const inv3 = 'f3333333-3333-3333-3333-333333333333';
  // Spintex: Amoxicillin (prescription required)
  const inv4 = 'f4444444-4444-4444-4444-444444444444';

  const now = new Date();
  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
  const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);

  await db.query(
    `INSERT INTO inventory (id, pharmacy_id, medicine_id, source_type, observed_quantity, reserved_quantity, available_quantity, unit_price_minor, availability_state, observed_at, confirmed_at, status)
     VALUES
     ('${inv1}', '${pEastLegon}', '${medParacetamolTab}', 'PHYSICAL_CONFIRMATION', 25, 0, 25, 1200, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${inv2}', '${pOsu}', '${medParacetamolTab}', 'POS', 14, 0, 14, 1500, 'VERIFIED', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${inv3}', '${pAirport}', '${medParacetamolTab}', 'MANUAL', 4, 0, 4, 1400, 'UNCERTAIN', '${twoDaysAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${inv4}', '${pEastLegon}', '${medAmoxicillinCap}', 'PHYSICAL_CONFIRMATION', 18, 0, 18, 4500, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${uuidv4()}', '${pOsu}', '${medCoartem}', 'POS', 30, 0, 30, 3500, 'VERIFIED', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pSpintex}', '${medParacetamolTab}', 'FILE', 40, 0, 40, 1100, 'LIKELY', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE')
     ON CONFLICT (pharmacy_id, medicine_id) DO NOTHING`
  );

  // Observations
  await db.query(
    `INSERT INTO inventory_observations (id, inventory_id, source_type, quantity, observed_at, metadata)
     VALUES
     ('${uuidv4()}', '${inv1}', 'PHYSICAL_CONFIRMATION', 25, '${now.toISOString()}', '{"confirmed_by": "Pharmacist Akua"}'),
     ('${uuidv4()}', '${inv2}', 'POS', 14, '${twoHoursAgo.toISOString()}', '{"pos_terminal": "POS-01"}')`
  );

  console.log('[Seed] Database seeding completed successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] Failed:', err);
      process.exit(1);
    });
}
