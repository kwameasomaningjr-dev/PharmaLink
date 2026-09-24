import { db } from '../../database/connection.js';
import { MedicineService } from '../medicine/medicine.service.js';
import { AvailabilityEngine } from './availability.engine.js';
import { calculateDistanceKm } from '../../common/geo.js';
import { AvailabilityState, FulfillmentType } from '../../common/types.js';

export interface SearchParams {
  q?: string;
  latitude?: number;
  longitude?: number;
  radius_km?: number;
  fulfillment_type?: FulfillmentType;
  page?: number;
  limit?: number;
}

export interface SearchResultItem {
  medicine: {
    id: string;
    generic_name: string;
    brand_name: string | null;
    strength_value: number | null;
    strength_unit: string | null;
    formulation: string;
    pack_size: number | null;
    pack_unit: string | null;
    prescription_required: boolean;
  };
  pharmacy: {
    id: string;
    legal_name: string;
    display_name: string;
    verification_status: string;
    address_line: string;
    city: string;
    region: string;
    latitude: number;
    longitude: number;
    phone: string;
    fulfillment_options: any;
    opening_hours: any;
  };
  availability_state: AvailabilityState;
  customer_status: string;
  confidence: 'High' | 'Medium' | 'Low' | 'None';
  freshness: string;
  last_updated: string;
  distance_km: number | null;
  price: {
    unit_price_minor: number;
    currency: string;
    formatted: string;
  };
  fulfillment: {
    pickup: boolean;
    delivery: boolean;
  };
}

export class SearchService {
  // Default coordinates: Accra central (Kotoka / Airport / Ridge)
  public static readonly DEFAULT_ACCRA_LAT = 5.6037;
  public static readonly DEFAULT_ACCRA_LNG = -0.187;

  public static async search(params: SearchParams): Promise<{ results: SearchResultItem[]; total: number }> {
    const queryStr = params.q?.trim() || '';
    const userLat = params.latitude !== undefined ? Number(params.latitude) : this.DEFAULT_ACCRA_LAT;
    const userLng = params.longitude !== undefined ? Number(params.longitude) : this.DEFAULT_ACCRA_LNG;
    const maxRadius = params.radius_km ? Number(params.radius_km) : 50;

    // 1. Identify candidate medicines
    const matchedMedicines = await MedicineService.searchMedicines(queryStr);
    if (matchedMedicines.length === 0) {
      return { results: [], total: 0 };
    }

    const medicineIds = matchedMedicines.map((m) => m.id);

    const placeholders = medicineIds.map((_, idx) => `$${idx + 1}`).join(', ');
    const invRes = await db.query(
      `SELECT i.*, 
              p.legal_name, p.display_name as pharmacy_name, p.verification_status,
              p.address_line, p.city, p.region, p.latitude, p.longitude, p.phone as pharmacy_phone,
              p.fulfillment_options, p.opening_hours
       FROM inventory i
       JOIN pharmacies p ON p.id = i.pharmacy_id
       WHERE i.medicine_id IN (${placeholders})
         AND i.status = 'ACTIVE'
         AND p.verification_status = 'VERIFIED'`,
      medicineIds
    );

    const medMap = new Map(matchedMedicines.map((m) => [m.id, m]));
    const results: SearchResultItem[] = [];

    for (const row of invRes.rows) {
      const med = medMap.get(row.medicine_id);
      if (!med) continue;

      const pLat = Number(row.latitude);
      const pLng = Number(row.longitude);
      const dist = calculateDistanceKm(userLat, userLng, pLat, pLng);

      if (maxRadius && dist > maxRadius) {
        continue;
      }

      const fulfillmentOptions = typeof row.fulfillment_options === 'string'
        ? JSON.parse(row.fulfillment_options)
        : row.fulfillment_options || { pickup: true, delivery: false };

      if (params.fulfillment_type === 'DELIVERY' && !fulfillmentOptions.delivery) {
        continue;
      }
      if (params.fulfillment_type === 'PICKUP' && !fulfillmentOptions.pickup) {
        continue;
      }

      const evalResult = AvailabilityEngine.evaluate({
        sourceType: row.source_type,
        observedQuantity: row.observed_quantity,
        reservedQuantity: row.reserved_quantity,
        observedAt: row.observed_at,
        confirmedAt: row.confirmed_at,
      });

      const priceMinor = row.unit_price_minor || 0;
      const formattedPrice = `GHS ${(priceMinor / 100).toFixed(2)}`;

      results.push({
        medicine: {
          id: med.id,
          generic_name: med.generic_name,
          brand_name: med.brand_name,
          strength_value: med.strength_value,
          strength_unit: med.strength_unit,
          formulation: med.formulation,
          pack_size: med.pack_size,
          pack_unit: med.pack_unit,
          prescription_required: med.prescription_required,
        },
        pharmacy: {
          id: row.pharmacy_id,
          legal_name: row.legal_name,
          display_name: row.pharmacy_name,
          verification_status: row.verification_status,
          address_line: row.address_line,
          city: row.city,
          region: row.region,
          latitude: pLat,
          longitude: pLng,
          phone: row.pharmacy_phone,
          fulfillment_options: fulfillmentOptions,
          opening_hours: typeof row.opening_hours === 'string' ? JSON.parse(row.opening_hours) : row.opening_hours,
        },
        availability_state: evalResult.state,
        customer_status: evalResult.customerCopy,
        confidence: evalResult.confidenceLevel,
        freshness: evalResult.freshnessLabel,
        last_updated: row.updated_at,
        distance_km: dist,
        price: {
          unit_price_minor: priceMinor,
          currency: 'GHS',
          formatted: formattedPrice,
        },
        fulfillment: {
          pickup: Boolean(fulfillmentOptions.pickup),
          delivery: Boolean(fulfillmentOptions.delivery),
        },
      });
    }

    // 3. Rank results:
    // Tiers: VERIFIED (0) > LIKELY (1) > UNCERTAIN (2) > UNAVAILABLE (3)
    // Within same tier: lowest distance first
    const tierScore: Record<AvailabilityState, number> = {
      VERIFIED: 0,
      LIKELY: 1,
      UNCERTAIN: 2,
      UNAVAILABLE: 3,
    };

    results.sort((a, b) => {
      const scoreA = tierScore[a.availability_state];
      const scoreB = tierScore[b.availability_state];
      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }
      return (a.distance_km ?? 999) - (b.distance_km ?? 999);
    });

    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const offset = (page - 1) * limit;

    return {
      results: results.slice(offset, offset + limit),
      total: results.length,
    };
  }
}
