export type UserRole = 'CUSTOMER' | 'PHARMACY_ADMIN' | 'PHARMACY_STAFF' | 'PLATFORM_OPS';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'INVITED' | 'DELETED';

export type PharmacyVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
export type PharmacyStaffRole = 'ADMIN' | 'STAFF';
export type PharmacyStaffStatus = 'ACTIVE' | 'INVITED' | 'DISABLED';

export type MedicineStatus = 'ACTIVE' | 'INACTIVE';
export type MedicineAliasType = 'BRAND' | 'GENERIC' | 'TYPO' | 'LOCAL_TERM' | 'PROVIDER_TERM';
export type MappingStatus = 'MATCHED' | 'REVIEW' | 'REJECTED';

export type InventorySourceType = 'POS' | 'FILE' | 'MANUAL' | 'PHYSICAL_CONFIRMATION';
export type AvailabilityState = 'VERIFIED' | 'LIKELY' | 'UNCERTAIN' | 'UNAVAILABLE';
export type InventoryStatus = 'ACTIVE' | 'DISABLED';

export type SyncSourceType = 'API' | 'FILE' | 'MANUAL';
export type SyncStatus = 'STARTED' | 'SUCCESS' | 'PARTIAL' | 'FAILED';

export type OrderStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'ACCEPTED'
  | 'PROCESSING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type FulfillmentType = 'PICKUP' | 'DELIVERY';

export type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'EXPIRED' | 'CONSUMED';

export type PrescriptionStatus =
  | 'UPLOADED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLARIFICATION_REQUIRED';

export type ProviderType = 'POS_API' | 'FILE' | 'OTHER';
export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'PENDING';

export type PaymentStatus =
  | 'INITIATED'
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type NotificationChannel = 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PUSH';
export type NotificationStatus = 'QUEUED' | 'SENT' | 'FAILED';

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  password_hash: string;
  role: UserRole;
  first_name: string;
  last_name: string | null;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface Pharmacy {
  id: string;
  legal_name: string;
  display_name: string;
  license_number: string | null;
  verification_status: PharmacyVerificationStatus;
  address_line: string;
  city: string;
  region: string;
  latitude: number;
  longitude: number;
  phone: string;
  email: string | null;
  opening_hours: Record<string, any>;
  fulfillment_options: {
    pickup: boolean;
    delivery: boolean;
    delivery_base_fee_minor?: number;
    delivery_radius_km?: number;
    response_window_minutes?: number;
  };
  created_at: string;
  updated_at: string;
}

export interface PharmacyUser {
  id: string;
  pharmacy_id: string;
  user_id: string;
  role: PharmacyStaffRole;
  status: PharmacyStaffStatus;
  created_at: string;
}

export interface Medicine {
  id: string;
  generic_name: string;
  brand_name: string | null;
  strength_value: number | null;
  strength_unit: string | null;
  formulation: string;
  pack_size: number | null;
  pack_unit: string | null;
  prescription_required: boolean;
  status: MedicineStatus;
  created_at: string;
  updated_at: string;
}

export interface MedicineAlias {
  id: string;
  medicine_id: string;
  alias: string;
  alias_type: MedicineAliasType;
  normalized_alias: string;
}

export interface PharmacyMedicineMapping {
  id: string;
  pharmacy_id: string;
  medicine_id: string;
  external_product_id: string;
  external_name: string;
  mapping_status: MappingStatus;
  created_at: string;
  updated_at: string;
}

export interface Inventory {
  id: string;
  pharmacy_id: string;
  medicine_id: string;
  source_type: InventorySourceType;
  observed_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  unit_price_minor: number;
  availability_state: AvailabilityState;
  observed_at: string;
  confirmed_at: string | null;
  last_sync_id: string | null;
  status: InventoryStatus;
  updated_at: string;
}

export interface InventoryObservation {
  id: string;
  inventory_id: string;
  source_type: InventorySourceType;
  quantity: number;
  observed_at: string;
  actor_user_id: string | null;
  sync_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  pharmacy_id: string;
  status: OrderStatus;
  fulfillment_type: FulfillmentType;
  subtotal_minor: number;
  delivery_fee_minor: number;
  total_minor: number;
  currency: string;
  customer_note: string | null;
  rejection_reason: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  medicine_id: string;
  display_name: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  created_at: string;
}

export interface Reservation {
  id: string;
  order_id: string;
  inventory_id: string;
  quantity: number;
  status: ReservationStatus;
  expires_at: string;
  created_at: string;
  released_at: string | null;
}

export interface Prescription {
  id: string;
  order_id: string;
  customer_id: string;
  storage_key: string;
  status: PrescriptionStatus;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEvent {
  id: string;
  actor_user_id: string | null;
  pharmacy_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, any>;
  created_at: string;
}
