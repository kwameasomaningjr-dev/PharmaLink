import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from './connection.js';
import { runMigrations } from './migrate.js';
import { AuditService } from '../modules/audit/audit.service.js';

export async function seedDatabase(force = false) {
  console.log('[Seed] Ensuring schema exists...');
  await runMigrations();

  const existing = await db.query('SELECT COUNT(*) as cnt FROM users');
  if (!force && Number(existing.rows[0]?.cnt) > 0 && process.env.NODE_ENV !== 'test') {
    console.log(`[Seed] Database already seeded (${existing.rows[0].cnt} users). Ready.`);
    return;
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
  const temaAdminId = 'c0000000-0000-0000-0000-000000000008';
  const kumasiAdminId = 'c0000000-0000-0000-0000-000000000009';

  // Wipe tables sequentially to avoid PGlite multi-statement exec limitations
  const tablesToClear = ['reservations', 'order_items', 'orders', 'inventory_observations', 'inventory', 'audit_events', 'pharmacy_users', 'users', 'pharmacies', 'medicine_aliases', 'medicines'];
  for (const t of tablesToClear) {
    try { await db.exec(`DELETE FROM ${t};`); } catch {}
  }

  const usersToSeed = [
    { id: platformAdminId, email: 'ops@pharmalink.gh', phone: '+233200000001', role: 'PLATFORM_OPS', first: 'Kofi', last: 'Admin' },
    { id: eastLegonAdminId, email: 'admin@eastlegonrx.gh', phone: '+233240000002', role: 'PHARMACY_ADMIN', first: 'Akua', last: 'Owusu' },
    { id: osuAdminId, email: 'admin@osuchemist.gh', phone: '+233240000003', role: 'PHARMACY_ADMIN', first: 'Kwesi', last: 'Baah' },
    { id: airportAdminId, email: 'admin@airportrx.gh', phone: '+233240000004', role: 'PHARMACY_ADMIN', first: 'Efua', last: 'Mensah' },
    { id: spintexAdminId, email: 'admin@spintexcare.gh', phone: '+233240000005', role: 'PHARMACY_ADMIN', first: 'Esi', last: 'Acheampong' },
    { id: customer1Id, email: 'kwame.customer@gmail.com', phone: '+233550000006', role: 'CUSTOMER', first: 'Kwame', last: 'Asomaning' },
    { id: customer2Id, email: 'abena.customer@yahoo.com', phone: '+233550000007', role: 'CUSTOMER', first: 'Abena', last: 'Kusi' },
    { id: temaAdminId, email: 'admin@temacommunitydemo.gh', phone: '+233240000008', role: 'PHARMACY_ADMIN', first: 'Nana', last: 'Mensah' },
    { id: kumasiAdminId, email: 'admin@kumasidemo.gh', phone: '+233240000009', role: 'PHARMACY_ADMIN', first: 'Yaw', last: 'Asare' },
  ];

  for (const u of usersToSeed) {
    await db.query(
      `INSERT INTO users (id, email, phone, password_hash, role, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET 
         password_hash = EXCLUDED.password_hash,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         role = EXCLUDED.role,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         status = 'ACTIVE'`,
      [u.id, u.email, u.phone, passwordHash, u.role, u.first, u.last]
    );
  }

  // 2. Pharmacies
  const pEastLegon = 'e1111111-1111-1111-1111-111111111111';
  const pOsu = 'e2222222-2222-2222-2222-222222222222';
  const pAirport = 'e3333333-3333-3333-3333-333333333333';
  const pSpintex = 'e4444444-4444-4444-4444-444444444444';
  const pTemaPending = 'e5555555-5555-5555-5555-555555555555';
  const pKumasiRejected = 'e6666666-6666-6666-6666-666666666666';

  const defaultHours = JSON.stringify({
    mon_fri: '08:00 - 21:00',
    saturday: '08:00 - 20:00',
    sunday: '10:00 - 18:00',
  });

  await db.query(
    `INSERT INTO pharmacies (id, legal_name, display_name, license_number, verification_status, address_line, city, region, latitude, longitude, phone, email, opening_hours, fulfillment_options)
     VALUES
     ($1, 'East Legon Healthline Pharmacy Ltd', 'East Legon Pharmacy', 'FDA-PH-2023-0101', 'VERIFIED', 'Lagos Avenue, East Legon', 'Accra', 'Greater Accra', 5.635800, -0.158400, '+233302111222', 'eastlegon@pharmalink.gh', $7, '{"pickup": true, "delivery": true, "delivery_base_fee_minor": 2000, "delivery_radius_km": 10, "response_window_minutes": 15}'),
     ($2, 'Osu Standard Chemist Ltd', 'Osu Standard Chemist', 'FDA-PH-2022-0452', 'VERIFIED', 'Oxford Street, Osu', 'Accra', 'Greater Accra', 5.556000, -0.182100, '+233302222333', 'osu@pharmalink.gh', $7, '{"pickup": true, "delivery": true, "delivery_base_fee_minor": 1500, "delivery_radius_km": 8, "response_window_minutes": 20}'),
     ($3, 'Airport Residential Pharmacy Services', 'Airport Residential Pharmacy', 'FDA-PH-2021-0899', 'VERIFIED', 'Airport Residential Area, Accra', 'Accra', 'Greater Accra', 5.603700, -0.187000, '+233302333444', 'airport@pharmalink.gh', $7, '{"pickup": true, "delivery": false, "delivery_base_fee_minor": 0, "delivery_radius_km": 0, "response_window_minutes": 10}'),
     ($4, 'Spintex Community Care Pharmacy', 'Spintex Care Pharmacy', 'FDA-PH-2023-1120', 'VERIFIED', 'Spintex Road near Coastal Junction', 'Accra', 'Greater Accra', 5.623100, -0.102500, '+233302444555', 'spintex@pharmalink.gh', $7, '{"pickup": true, "delivery": true, "delivery_base_fee_minor": 2500, "delivery_radius_km": 12, "response_window_minutes": 30}'),
     ($5, 'Tema Community Health Pharmacy Ltd', 'Tema Community Health Pharmacy', 'FDA-PH-DEMO-0501', 'PENDING', 'Community 8, Tema', 'Tema', 'Greater Accra', 5.690200, -0.016900, '+233302555666', 'tema-demo@pharmalink.gh', $7, '{"pickup": true, "delivery": true, "delivery_base_fee_minor": 1800, "delivery_radius_km": 8, "response_window_minutes": 25}'),
     ($6, 'Kumasi Central Wellness Ltd', 'Kumasi Central Wellness', 'FDA-PH-DEMO-0502', 'REJECTED', 'Adum Road, Kumasi', 'Kumasi', 'Ashanti', 6.688500, -1.624400, '+233302555777', 'kumasi-demo@pharmalink.gh', $7, '{"pickup": true, "delivery": false, "delivery_base_fee_minor": 0, "delivery_radius_km": 0, "response_window_minutes": 20}')
     ON CONFLICT (id) DO NOTHING`,
    [pEastLegon, pOsu, pAirport, pSpintex, pTemaPending, pKumasiRejected, defaultHours]
  );

  // Pharmacy Users mapping
  await db.query(
    `INSERT INTO pharmacy_users (id, pharmacy_id, user_id, role, status)
     VALUES
     ('${uuidv4()}', '${pEastLegon}', '${eastLegonAdminId}', 'ADMIN', 'ACTIVE'),
     ('${uuidv4()}', '${pOsu}', '${osuAdminId}', 'ADMIN', 'ACTIVE'),
     ('${uuidv4()}', '${pAirport}', '${airportAdminId}', 'ADMIN', 'ACTIVE'),
     ('${uuidv4()}', '${pSpintex}', '${spintexAdminId}', 'ADMIN', 'ACTIVE'),
     ('${uuidv4()}', '${pTemaPending}', '${temaAdminId}', 'ADMIN', 'ACTIVE'),
     ('${uuidv4()}', '${pKumasiRejected}', '${kumasiAdminId}', 'ADMIN', 'ACTIVE')
     ON CONFLICT (pharmacy_id, user_id) DO NOTHING`
  );

  await AuditService.recordEvent({
    actorUserId: platformAdminId,
    pharmacyId: pTemaPending,
    eventType: 'PHARMACY_ONBOARDED',
    entityType: 'PHARMACY',
    entityId: pTemaPending,
    metadata: { demo: true, status: 'PENDING' },
  });
  await AuditService.recordEvent({
    actorUserId: platformAdminId,
    pharmacyId: pKumasiRejected,
    eventType: 'PHARMACY_VERIFICATION_UPDATED',
    entityType: 'PHARMACY',
    entityId: pKumasiRejected,
    metadata: { demo: true, previous_status: 'PENDING', new_status: 'REJECTED' },
  });

  // 3. Canonical Medicines (valid hexadecimal UUIDs)
  const medParacetamolTab = 'a1111111-1111-1111-1111-111111111111';
  const medParacetamolSyr = 'a2222222-2222-2222-2222-222222222222';
  const medAmoxicillinCap = 'a3333333-3333-3333-3333-333333333333';
  const medAmoxicillinSusp = 'a4444444-4444-4444-4444-444444444444';
  const medCoartem = 'a5555555-5555-5555-5555-555555555555';
  const medCipro = 'a6666666-6666-6666-6666-666666666666';
  const medIbuprofen = 'a7777777-7777-7777-7777-777777777777';
  const medCetirizine = 'a8888888-8888-8888-8888-888888888888';
  // Additional Ghana Essential Medicines
  const medLonartDS = 'ba111111-1111-1111-1111-111111111111';
  const medPAlaxin = 'ba222222-2222-2222-2222-222222222222';
  const medAugmentin625 = 'ba333333-3333-3333-3333-333333333333';
  const medAugmentin1g = 'ba444444-4444-4444-4444-444444444444';
  const medAzithromycin = 'ba555555-5555-5555-5555-555555555555';
  const medMetronidazole = 'ba666666-6666-6666-6666-666666666666';
  const medCefuroxime = 'ba777777-7777-7777-7777-777777777777';
  const medDiclofenac = 'ba888888-8888-8888-8888-888888888888';
  const medAmlodipine = 'ba999999-9999-9999-9999-999999999999';
  const medMetformin = 'bb111111-1111-1111-1111-111111111111';
  const medLisinopril = 'bb222222-2222-2222-2222-222222222222';
  const medLosartan = 'bb333333-3333-3333-3333-333333333333';
  const medVentolin = 'bb444444-4444-4444-4444-444444444444';
  const medOmeprazole = 'bb555555-5555-5555-5555-555555555555';
  const medORS = 'bb666666-6666-6666-6666-666666666666';
  const medZinc = 'bb777777-7777-7777-7777-777777777777';
  const medVitaminC = 'bb888888-8888-8888-8888-888888888888';
  const medFefol = 'bb999999-9999-9999-9999-999999999999';
  const medGestid = 'bc111111-1111-1111-1111-111111111111';

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
     ('${medCetirizine}', 'Cetirizine', 'Zyrtec', 10, 'mg', 'Tablet', 10, 'Tablets', false, 'ACTIVE'),
     ('${medLonartDS}', 'Artemether/Lumefantrine', 'Lonart DS', 80, 'mg/480mg', 'Tablet', 6, 'Tablets', false, 'ACTIVE'),
     ('${medPAlaxin}', 'Dihydroartemisinin/Piperaquine', 'P-Alaxin', 40, 'mg/320mg', 'Tablet', 9, 'Tablets', false, 'ACTIVE'),
     ('${medAugmentin625}', 'Amoxicillin/Clavulanic Acid', 'Augmentin 625mg', 625, 'mg', 'Tablet', 14, 'Tablets', true, 'ACTIVE'),
     ('${medAugmentin1g}', 'Amoxicillin/Clavulanic Acid', 'Augmentin 1g', 1000, 'mg', 'Tablet', 14, 'Tablets', true, 'ACTIVE'),
     ('${medAzithromycin}', 'Azithromycin', 'Zithromax', 500, 'mg', 'Tablet', 3, 'Tablets', true, 'ACTIVE'),
     ('${medMetronidazole}', 'Metronidazole', 'Flagyl', 400, 'mg', 'Tablet', 21, 'Tablets', true, 'ACTIVE'),
     ('${medCefuroxime}', 'Cefuroxime Axetil', 'Zinnat', 500, 'mg', 'Tablet', 10, 'Tablets', true, 'ACTIVE'),
     ('${medDiclofenac}', 'Diclofenac Sodium', 'Voltaren', 50, 'mg', 'Tablet', 20, 'Tablets', false, 'ACTIVE'),
     ('${medAmlodipine}', 'Amlodipine Besylate', 'Norvasc', 10, 'mg', 'Tablet', 30, 'Tablets', true, 'ACTIVE'),
     ('${medMetformin}', 'Metformin Hydrochloride', 'Glucophage', 500, 'mg', 'Tablet', 56, 'Tablets', true, 'ACTIVE'),
     ('${medLisinopril}', 'Lisinopril', 'Zestril', 10, 'mg', 'Tablet', 28, 'Tablets', true, 'ACTIVE'),
     ('${medLosartan}', 'Losartan Potassium', 'Cozaar', 50, 'mg', 'Tablet', 30, 'Tablets', true, 'ACTIVE'),
     ('${medVentolin}', 'Salbutamol', 'Ventolin Inhaler', 100, 'mcg', 'Inhaler', 200, 'Doses', true, 'ACTIVE'),
     ('${medOmeprazole}', 'Omeprazole', 'Losec', 20, 'mg', 'Capsule', 14, 'Capsules', false, 'ACTIVE'),
     ('${medORS}', 'Oral Rehydration Salts', 'WHO-ORS', 20.5, 'g', 'Sachet', 10, 'Sachets', false, 'ACTIVE'),
     ('${medZinc}', 'Zinc Sulphate', 'Zincita', 20, 'mg', 'Tablet', 10, 'Tablets', false, 'ACTIVE'),
     ('${medVitaminC}', 'Ascorbic Acid', 'Redoxon Vitamin C', 1000, 'mg', 'Effervescent Tablet', 15, 'Tablets', false, 'ACTIVE'),
     ('${medFefol}', 'Ferrous Sulphate/Folic Acid', 'Fefol (Blood Tonic)', 150, 'mg/0.5mg', 'Capsule', 30, 'Capsules', false, 'ACTIVE'),
     ('${medGestid}', 'Aluminium/Magnesium Hydroxide', 'Gestid Antacid', 200, 'ml', 'Suspension', 1, 'Bottle', false, 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`
  );

  // 4. Medicine Aliases
  const aliases = [
    // Paracetamol & Analgesics
    { medId: medParacetamolTab, alias: 'Paracetamol 500mg', type: 'GENERIC', norm: 'paracetamol 500mg' },
    { medId: medParacetamolTab, alias: 'Panadol 500', type: 'BRAND', norm: 'panadol 500' },
    { medId: medParacetamolTab, alias: 'Panadol Extra', type: 'BRAND', norm: 'panadol extra' },
    { medId: medParacetamolTab, alias: 'Para 500', type: 'TYPO', norm: 'para 500' },
    { medId: medParacetamolTab, alias: 'Acetaminophen 500mg', type: 'GENERIC', norm: 'acetaminophen 500mg' },
    { medId: medParacetamolSyr, alias: 'Paracetamol Syrup', type: 'GENERIC', norm: 'paracetamol syrup' },
    { medId: medParacetamolSyr, alias: 'Calpol Infant', type: 'BRAND', norm: 'calpol infant' },
    { medId: medIbuprofen, alias: 'Ibuprofen 400mg', type: 'GENERIC', norm: 'ibuprofen 400mg' },
    { medId: medIbuprofen, alias: 'Brufen 400', type: 'BRAND', norm: 'brufen 400' },
    { medId: medDiclofenac, alias: 'Diclofenac 50mg', type: 'GENERIC', norm: 'diclofenac 50mg' },
    { medId: medDiclofenac, alias: 'Voltaren 50mg', type: 'BRAND', norm: 'voltaren 50mg' },
    { medId: medDiclofenac, alias: 'Cataflam', type: 'BRAND', norm: 'cataflam' },
    { medId: medDiclofenac, alias: 'Waist pain medicine', type: 'LOCAL_TERM', norm: 'waist pain medicine' },

    // Antibiotics
    { medId: medAmoxicillinCap, alias: 'Amoxicillin 500mg', type: 'GENERIC', norm: 'amoxicillin 500mg' },
    { medId: medAmoxicillinCap, alias: 'Amoxil 500mg', type: 'BRAND', norm: 'amoxil 500mg' },
    { medId: medAmoxicillinCap, alias: 'Amoxycillin', type: 'TYPO', norm: 'amoxycillin' },
    { medId: medAugmentin625, alias: 'Augmentin 625mg', type: 'BRAND', norm: 'augmentin 625mg' },
    { medId: medAugmentin625, alias: 'Amoxiclav 625', type: 'GENERIC', norm: 'amoxiclav 625' },
    { medId: medAugmentin1g, alias: 'Augmentin 1g', type: 'BRAND', norm: 'augmentin 1g' },
    { medId: medAzithromycin, alias: 'Azithromycin 500mg', type: 'GENERIC', norm: 'azithromycin 500mg' },
    { medId: medAzithromycin, alias: 'Zithromax 500mg', type: 'BRAND', norm: 'zithromax 500mg' },
    { medId: medCipro, alias: 'Ciprofloxacin 500mg', type: 'GENERIC', norm: 'ciprofloxacin 500mg' },
    { medId: medCipro, alias: 'Cipro 500', type: 'TYPO', norm: 'cipro 500' },
    { medId: medMetronidazole, alias: 'Metronidazole 400mg', type: 'GENERIC', norm: 'metronidazole 400mg' },
    { medId: medMetronidazole, alias: 'Flagyl 400', type: 'BRAND', norm: 'flagyl 400' },
    { medId: medMetronidazole, alias: 'Flagyl', type: 'BRAND', norm: 'flagyl' },
    { medId: medCefuroxime, alias: 'Cefuroxime 500mg', type: 'GENERIC', norm: 'cefuroxime 500mg' },
    { medId: medCefuroxime, alias: 'Zinnat 500mg', type: 'BRAND', norm: 'zinnat 500mg' },

    // Antimalarials (Key Ghana formulations)
    { medId: medCoartem, alias: 'Coartem', type: 'BRAND', norm: 'coartem' },
    { medId: medCoartem, alias: 'Malaria medicine', type: 'LOCAL_TERM', norm: 'malaria medicine' },
    { medId: medLonartDS, alias: 'Lonart DS', type: 'BRAND', norm: 'lonart ds' },
    { medId: medLonartDS, alias: 'Lonart', type: 'BRAND', norm: 'lonart' },
    { medId: medLonartDS, alias: 'Malaria dose', type: 'LOCAL_TERM', norm: 'malaria dose' },
    { medId: medPAlaxin, alias: 'P-Alaxin', type: 'BRAND', norm: 'p alaxin' },
    { medId: medPAlaxin, alias: 'Alaxin', type: 'BRAND', norm: 'alaxin' },

    // Chronic Care (Hypertension & Diabetes)
    { medId: medAmlodipine, alias: 'Amlodipine 10mg', type: 'GENERIC', norm: 'amlodipine 10mg' },
    { medId: medAmlodipine, alias: 'Norvasc 10mg', type: 'BRAND', norm: 'norvasc 10mg' },
    { medId: medAmlodipine, alias: 'BP medicine', type: 'LOCAL_TERM', norm: 'bp medicine' },
    { medId: medMetformin, alias: 'Metformin 500mg', type: 'GENERIC', norm: 'metformin 500mg' },
    { medId: medMetformin, alias: 'Glucophage 500mg', type: 'BRAND', norm: 'glucophage 500mg' },
    { medId: medMetformin, alias: 'Sugar medicine', type: 'LOCAL_TERM', norm: 'sugar medicine' },
    { medId: medLisinopril, alias: 'Lisinopril 10mg', type: 'GENERIC', norm: 'lisinopril 10mg' },
    { medId: medLisinopril, alias: 'Zestril 10mg', type: 'BRAND', norm: 'zestril 10mg' },
    { medId: medLosartan, alias: 'Losartan 50mg', type: 'GENERIC', norm: 'losartan 50mg' },
    { medId: medLosartan, alias: 'Cozaar 50mg', type: 'BRAND', norm: 'cozaar 50mg' },

    // Respiratory & Allergy
    { medId: medVentolin, alias: 'Ventolin Inhaler', type: 'BRAND', norm: 'ventolin inhaler' },
    { medId: medVentolin, alias: 'Salbutamol Inhaler', type: 'GENERIC', norm: 'salbutamol inhaler' },
    { medId: medVentolin, alias: 'Asthma Inhaler', type: 'LOCAL_TERM', norm: 'asthma inhaler' },
    { medId: medCetirizine, alias: 'Cetirizine 10mg', type: 'GENERIC', norm: 'cetirizine 10mg' },
    { medId: medCetirizine, alias: 'Zyrtec', type: 'BRAND', norm: 'zyrtec' },

    // GI, Rehydration & Supplements
    { medId: medOmeprazole, alias: 'Omeprazole 20mg', type: 'GENERIC', norm: 'omeprazole 20mg' },
    { medId: medOmeprazole, alias: 'Losec 20mg', type: 'BRAND', norm: 'losec 20mg' },
    { medId: medOmeprazole, alias: 'Ulcer medicine', type: 'LOCAL_TERM', norm: 'ulcer medicine' },
    { medId: medORS, alias: 'Oral Rehydration Salts', type: 'GENERIC', norm: 'oral rehydration salts' },
    { medId: medORS, alias: 'ORS Sachet', type: 'LOCAL_TERM', norm: 'ors sachet' },
    { medId: medORS, alias: 'Diarrhea salt', type: 'LOCAL_TERM', norm: 'diarrhea salt' },
    { medId: medZinc, alias: 'Zinc 20mg', type: 'GENERIC', norm: 'zinc 20mg' },
    { medId: medZinc, alias: 'Zincita', type: 'BRAND', norm: 'zincita' },
    { medId: medZinc, alias: 'Zincita 20mg', type: 'BRAND', norm: 'zincita 20mg' },
    { medId: medVitaminC, alias: 'Vitamin C 1000mg', type: 'GENERIC', norm: 'vitamin c 1000mg' },
    { medId: medVitaminC, alias: 'Vitamin C', type: 'GENERIC', norm: 'vitamin c' },
    { medId: medVitaminC, alias: 'Redoxon', type: 'BRAND', norm: 'redoxon' },
    { medId: medVitaminC, alias: 'Redoxon Vitamin C', type: 'BRAND', norm: 'redoxon vitamin c' },
    { medId: medFefol, alias: 'Fefol', type: 'BRAND', norm: 'fefol' },
    { medId: medFefol, alias: 'Fefol Spansule', type: 'BRAND', norm: 'fefol spansule' },
    { medId: medFefol, alias: 'Fefol Blood Tonic', type: 'BRAND', norm: 'fefol blood tonic' },
    { medId: medFefol, alias: 'Blood Tonic', type: 'LOCAL_TERM', norm: 'blood tonic' },
    { medId: medGestid, alias: 'Gestid Suspension', type: 'BRAND', norm: 'gestid suspension' },
    { medId: medGestid, alias: 'Gestid', type: 'BRAND', norm: 'gestid' },
    { medId: medGestid, alias: 'Antacid Syrup', type: 'GENERIC', norm: 'antacid syrup' },
    { medId: medGestid, alias: 'Heartburn medicine', type: 'LOCAL_TERM', norm: 'heartburn medicine' },
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
     -- Original baseline inventory (Required by automated tests)
     ('${inv1}', '${pEastLegon}', '${medParacetamolTab}', 'PHYSICAL_CONFIRMATION', 25, 0, 25, 1200, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${inv2}', '${pOsu}', '${medParacetamolTab}', 'POS', 14, 0, 14, 1500, 'VERIFIED', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${inv3}', '${pAirport}', '${medParacetamolTab}', 'MANUAL', 4, 0, 4, 1400, 'UNCERTAIN', '${twoDaysAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${inv4}', '${pEastLegon}', '${medAmoxicillinCap}', 'PHYSICAL_CONFIRMATION', 18, 0, 18, 4500, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${uuidv4()}', '${pOsu}', '${medCoartem}', 'POS', 30, 0, 30, 3500, 'VERIFIED', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pSpintex}', '${medParacetamolTab}', 'FILE', 40, 0, 40, 1100, 'LIKELY', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),

     -- East Legon Pharmacy: Expanded authentic stock
     ('${uuidv4()}', '${pEastLegon}', '${medLonartDS}', 'PHYSICAL_CONFIRMATION', 45, 0, 45, 4500, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${uuidv4()}', '${pEastLegon}', '${medAugmentin625}', 'PHYSICAL_CONFIRMATION', 22, 0, 22, 12000, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${uuidv4()}', '${pEastLegon}', '${medVentolin}', 'PHYSICAL_CONFIRMATION', 16, 0, 16, 6500, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${uuidv4()}', '${pEastLegon}', '${medFefol}', 'PHYSICAL_CONFIRMATION', 35, 0, 35, 3500, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${uuidv4()}', '${pEastLegon}', '${medORS}', 'PHYSICAL_CONFIRMATION', 80, 0, 80, 500, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${uuidv4()}', '${pEastLegon}', '${medVitaminC}', 'PHYSICAL_CONFIRMATION', 40, 0, 40, 4000, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${uuidv4()}', '${pEastLegon}', '${medMetformin}', 'PHYSICAL_CONFIRMATION', 50, 0, 50, 5000, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${uuidv4()}', '${pEastLegon}', '${medDiclofenac}', 'PHYSICAL_CONFIRMATION', 60, 0, 60, 2500, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),
     ('${uuidv4()}', '${pEastLegon}', '${medGestid}', 'PHYSICAL_CONFIRMATION', 28, 0, 28, 3000, 'VERIFIED', '${now.toISOString()}', '${now.toISOString()}', 'ACTIVE'),

     -- Osu Standard Chemist: Expanded stock
     ('${uuidv4()}', '${pOsu}', '${medAugmentin1g}', 'POS', 18, 0, 18, 15000, 'VERIFIED', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pOsu}', '${medPAlaxin}', 'POS', 30, 0, 30, 5500, 'VERIFIED', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pOsu}', '${medMetronidazole}', 'POS', 40, 0, 40, 2000, 'VERIFIED', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pOsu}', '${medVentolin}', 'POS', 12, 0, 12, 6000, 'VERIFIED', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pOsu}', '${medAmlodipine}', 'POS', 35, 0, 35, 4500, 'VERIFIED', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pOsu}', '${medLosartan}', 'POS', 25, 0, 25, 7000, 'VERIFIED', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pOsu}', '${medORS}', 'POS', 65, 0, 65, 500, 'VERIFIED', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),

     -- Airport Residential Pharmacy: Expanded stock
     ('${uuidv4()}', '${pAirport}', '${medCefuroxime}', 'MANUAL', 15, 0, 15, 14000, 'UNCERTAIN', '${twoDaysAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pAirport}', '${medAzithromycin}', 'MANUAL', 20, 0, 20, 6000, 'UNCERTAIN', '${twoDaysAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pAirport}', '${medOmeprazole}', 'MANUAL', 24, 0, 24, 3500, 'UNCERTAIN', '${twoDaysAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pAirport}', '${medLonartDS}', 'MANUAL', 30, 0, 30, 5000, 'UNCERTAIN', '${twoDaysAgo.toISOString()}', NULL, 'ACTIVE'),

     -- Spintex Community Care Pharmacy: Expanded stock
     ('${uuidv4()}', '${pSpintex}', '${medAugmentin625}', 'FILE', 25, 0, 25, 11000, 'LIKELY', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pSpintex}', '${medMetronidazole}', 'FILE', 35, 0, 35, 1800, 'LIKELY', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pSpintex}', '${medCoartem}', 'FILE', 50, 0, 50, 3800, 'LIKELY', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pSpintex}', '${medFefol}', 'FILE', 40, 0, 40, 3200, 'LIKELY', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pSpintex}', '${medGestid}', 'FILE', 20, 0, 20, 2800, 'LIKELY', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE'),
     ('${uuidv4()}', '${pSpintex}', '${medZinc}', 'FILE', 45, 0, 45, 1800, 'LIKELY', '${twoHoursAgo.toISOString()}', NULL, 'ACTIVE')
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
  seedDatabase(true)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] Failed:', err);
      process.exit(1);
    });
}
