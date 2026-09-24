-- ====================================================================
-- PharmaLink PostgreSQL Schema - V1 MVP
-- Strictly conforming to Database & API Specification Document 05
-- ====================================================================

-- 4. USERS
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(50) UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL, -- CUSTOMER, PHARMACY_ADMIN, PHARMACY_STAFF, PLATFORM_OPS
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, INVITED, DELETED
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. PHARMACIES
CREATE TABLE IF NOT EXISTS pharmacies (
  id UUID PRIMARY KEY,
  legal_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  license_number VARCHAR(100) UNIQUE,
  verification_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, VERIFIED, REJECTED, SUSPENDED
  address_line TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  region VARCHAR(100) NOT NULL,
  latitude NUMERIC(10, 6) NOT NULL,
  longitude NUMERIC(10, 6) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  opening_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  fulfillment_options JSONB NOT NULL DEFAULT '{"pickup": true, "delivery": false}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. PHARMACY_USERS
CREATE TABLE IF NOT EXISTS pharmacy_users (
  id UUID PRIMARY KEY,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'STAFF', -- ADMIN, STAFF
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, INVITED, DISABLED
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_pharmacy_user UNIQUE (pharmacy_id, user_id)
);

-- 7. MEDICINES (Canonical Catalogue)
CREATE TABLE IF NOT EXISTS medicines (
  id UUID PRIMARY KEY,
  generic_name VARCHAR(255) NOT NULL,
  brand_name VARCHAR(255),
  strength_value NUMERIC(10, 2),
  strength_unit VARCHAR(50),
  formulation VARCHAR(100) NOT NULL, -- Tablet, Capsule, Syrup, Suspension, Injection, Ointment, etc.
  pack_size INTEGER,
  pack_unit VARCHAR(50),
  prescription_required BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. MEDICINE_ALIASES
CREATE TABLE IF NOT EXISTS medicine_aliases (
  id UUID PRIMARY KEY,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  alias VARCHAR(255) NOT NULL,
  alias_type VARCHAR(50) NOT NULL, -- BRAND, GENERIC, TYPO, LOCAL_TERM, PROVIDER_TERM
  normalized_alias VARCHAR(255) NOT NULL,
  CONSTRAINT uq_medicine_alias UNIQUE (medicine_id, normalized_alias)
);

-- 9. PHARMACY_MEDICINE_MAPPINGS
CREATE TABLE IF NOT EXISTS pharmacy_medicine_mappings (
  id UUID PRIMARY KEY,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  external_product_id VARCHAR(255) NOT NULL,
  external_name VARCHAR(255) NOT NULL,
  mapping_status VARCHAR(50) NOT NULL DEFAULT 'MATCHED', -- MATCHED, REVIEW, REJECTED
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_pharmacy_external_product UNIQUE (pharmacy_id, external_product_id)
);

-- 10. INVENTORY (Latest state per pharmacy + medicine)
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL, -- POS, FILE, MANUAL, PHYSICAL_CONFIRMATION
  observed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (observed_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  unit_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_minor >= 0), -- e.g. Pesewas
  availability_state VARCHAR(50) NOT NULL DEFAULT 'UNCERTAIN', -- VERIFIED, LIKELY, UNCERTAIN, UNAVAILABLE
  observed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMPTZ,
  last_sync_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, DISABLED
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_pharmacy_medicine_inventory UNIQUE (pharmacy_id, medicine_id)
);

-- 11. INVENTORY_OBSERVATIONS (Immutable evidence records)
CREATE TABLE IF NOT EXISTS inventory_observations (
  id UUID PRIMARY KEY,
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL, -- POS, FILE, MANUAL, PHYSICAL_CONFIRMATION
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sync_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. INVENTORY_SYNCS
CREATE TABLE IF NOT EXISTS inventory_syncs (
  id UUID PRIMARY KEY,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  integration_id UUID,
  source_type VARCHAR(50) NOT NULL, -- API, FILE, MANUAL
  status VARCHAR(50) NOT NULL DEFAULT 'STARTED', -- STARTED, SUCCESS, PARTIAL, FAILED
  records_received INTEGER NOT NULL DEFAULT 0,
  records_accepted INTEGER NOT NULL DEFAULT 0,
  records_rejected INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

-- 13. ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  order_number VARCHAR(100) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', 
  -- DRAFT, PENDING, ACCEPTED, PROCESSING, READY, OUT_FOR_DELIVERY, COMPLETED, REJECTED, EXPIRED, CANCELLED
  fulfillment_type VARCHAR(50) NOT NULL DEFAULT 'PICKUP', -- PICKUP, DELIVERY
  subtotal_minor INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  delivery_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0),
  total_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'GHS',
  customer_note TEXT,
  rejection_reason VARCHAR(255),
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 14. ORDER_ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  display_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. RESERVATIONS
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, RELEASED, EXPIRED, CONSUMED
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMPTZ
);

-- 16. PRESCRIPTIONS
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  storage_key TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'UPLOADED', 
  -- UPLOADED, UNDER_REVIEW, APPROVED, REJECTED, CLARIFICATION_REQUIRED
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 17. INTEGRATION_CONNECTIONS
CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  provider_name VARCHAR(100) NOT NULL,
  provider_type VARCHAR(50) NOT NULL, -- POS_API, FILE, OTHER
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- CONNECTED, DISCONNECTED, ERROR, PENDING
  credentials_ref TEXT,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 18. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider VARCHAR(100) NOT NULL,
  provider_reference VARCHAR(255),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'GHS',
  status VARCHAR(50) NOT NULL DEFAULT 'INITIATED',
  -- INITIATED, PENDING, SUCCESS, FAILED, REFUNDED, PARTIALLY_REFUNDED
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 19. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  channel VARCHAR(50) NOT NULL, -- SMS, EMAIL, WHATSAPP, PUSH
  status VARCHAR(50) NOT NULL DEFAULT 'QUEUED', -- QUEUED, SENT, FAILED
  reference_type VARCHAR(100),
  reference_id UUID,
  provider_message_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ
);

-- 20. AUDIT_EVENTS
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  actor_user_id UUID,
  pharmacy_id UUID,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 21. CORE INDEXES
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_pharmacies_verification ON pharmacies(verification_status);
CREATE INDEX IF NOT EXISTS idx_pharmacies_geo ON pharmacies(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_medicines_generic_name ON medicines(generic_name);
CREATE INDEX IF NOT EXISTS idx_medicines_brand_name ON medicines(brand_name);
CREATE INDEX IF NOT EXISTS idx_medicine_aliases_normalized ON medicine_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_inventory_lookup ON inventory(medicine_id, availability_state, updated_at);
CREATE INDEX IF NOT EXISTS idx_inventory_observations_recent ON inventory_observations(inventory_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_pharmacy ON orders(pharmacy_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(inventory_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments(provider_reference);
