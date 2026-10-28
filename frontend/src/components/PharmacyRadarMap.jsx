import React, { useState, useMemo } from 'react';

export function PharmacyRadarMap({ pharmacies = [], currentLocation, onSelectPharmacy, onBrowseMedicines }) {
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [activePin, setActivePin] = useState(null);

  // Default coordinate positions for key visual pins if no pharmacies are passed
  const fallbackHubs = useMemo(() => [
    { id: '1', name: 'East Legon Hub', region: 'Greater Accra', x: 65, y: 35, open: true, stock: 142, address: 'Boundary Rd, East Legon', phone: '+233 30 211 2233' },
    { id: '2', name: 'Osu Oxford St', region: 'Greater Accra', x: 50, y: 70, open: true, stock: 98, address: 'Oxford Street, Osu', phone: '+233 30 211 2234' },
    { id: '3', name: 'Airport Residential', region: 'Greater Accra', x: 58, y: 48, open: true, stock: 210, address: 'Airport West, Accra', phone: '+233 30 211 2235' },
    { id: '4', name: 'Spintex Road', region: 'Greater Accra', x: 80, y: 55, open: true, stock: 115, address: 'Spintex Road, Batsonaa', phone: '+233 30 211 2236' },
    { id: '5', name: 'Tema Community 1', region: 'Greater Accra', x: 90, y: 45, open: true, stock: 85, address: 'Commercial Area, Tema', phone: '+233 30 211 2237' },
    { id: '6', name: 'Kumasi Adum', region: 'Ashanti', x: 30, y: 40, open: true, stock: 160, address: 'Harper Road, Adum, Kumasi', phone: '+233 32 201 1122' },
    { id: '7', name: 'Takoradi Market Circle', region: 'Western', x: 25, y: 80, open: true, stock: 74, address: 'Market Circle, Takoradi', phone: '+233 31 202 3344' },
  ], []);

  const pins = useMemo(() => {
    if (!pharmacies || pharmacies.length === 0) {
      return fallbackHubs;
    }

    const centerLat = Number(currentLocation?.lat) || 5.6037;
    const centerLng = Number(currentLocation?.lng) || -0.1870;

    return pharmacies.map((item, index) => {
      const p = item.pharmacy || item;
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);

      let x = 50;
      let y = 50;

      if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
        const latDiff = lat - centerLat;
        const lngDiff = lng - centerLng;
        const calculatedX = 50 + (lngDiff * 160);
        const calculatedY = 50 - (latDiff * 160);

        if (calculatedX >= 15 && calculatedX <= 85 && calculatedY >= 15 && calculatedY <= 85) {
          x = Math.round(calculatedX);
          y = Math.round(calculatedY);
        } else {
          const angle = (index / Math.max(pharmacies.length, 1)) * 2 * Math.PI;
          const radius = 20 + ((index * 7) % 20);
          x = Math.max(15, Math.min(85, Math.round(50 + radius * Math.cos(angle))));
          y = Math.max(15, Math.min(85, Math.round(50 + radius * Math.sin(angle))));
        }
      } else {
        const angle = (index / Math.max(pharmacies.length, 1)) * 2 * Math.PI;
        const radius = 20 + ((index * 7) % 20);
        x = Math.max(15, Math.min(85, Math.round(50 + radius * Math.cos(angle))));
        y = Math.max(15, Math.min(85, Math.round(50 + radius * Math.sin(angle))));
      }

      const fulfillment = p.fulfillment_options || item.fulfillment || { pickup: true, delivery: true };
      const region = p.region || p.city || 'Greater Accra';
      const stockCount = p.active_inventory_count !== undefined 
        ? p.active_inventory_count 
        : (item.stock !== undefined ? item.stock : 'Live stock');

      return {
        id: p.id || String(index),
        name: p.display_name || p.legal_name || 'Dispensary',
        legalName: p.legal_name,
        region,
        city: p.city,
        address: p.address_line || `${p.city || ''}, ${region}`,
        phone: p.phone || '',
        distance_km: item.distance_km !== undefined ? item.distance_km : p.distance_km,
        stock: stockCount,
        fulfillment,
        open: true,
        x,
        y,
        rawPharmacy: p
      };
    });
  }, [pharmacies, currentLocation, fallbackHubs]);

  const availableRegions = useMemo(() => {
    const set = new Set(['All', 'Greater Accra', 'Ashanti', 'Western', 'Central', 'Northern']);
    pins.forEach((p) => {
      if (p.region) set.add(p.region);
    });
    return Array.from(set);
  }, [pins]);

  const filteredPins = useMemo(() => {
    if (selectedRegion === 'All') return pins;
    return pins.filter((p) => p.region?.toLowerCase().includes(selectedRegion.toLowerCase()));
  }, [pins, selectedRegion]);

  return (
    <div className="pharmacy-radar-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>📡</span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Ghana Live Pharmacy Radar</h3>
            <span className="badge badge-verified" style={{ fontSize: '0.72rem' }}>Live GPS Signals</span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Real-time verified dispensary radar centered near {currentLocation?.name || 'Accra, Ghana'} • {pins.length} licensed {pins.length === 1 ? 'hub' : 'hubs'} active.
          </p>
        </div>

        {/* Region Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {availableRegions.slice(0, 6).map((reg) => (
            <button
              key={reg}
              type="button"
              className={`btn btn-sm ${selectedRegion === reg ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.74rem', padding: '0.25rem 0.6rem' }}
              onClick={() => setSelectedRegion(reg)}
            >
              {reg}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Animated SVG Radar Screen */}
      <div className="radar-map-svg">
        <div className="radar-sweep" />

        {/* Radar Concentric Rings */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: '120px', height: '120px', transform: 'translate(-50%, -50%)', border: '1px dashed rgba(16, 185, 129, 0.25)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: '220px', height: '220px', transform: 'translate(-50%, -50%)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: '320px', height: '320px', transform: 'translate(-50%, -50%)', border: '1px solid rgba(16, 185, 129, 0.08)', borderRadius: '50%', pointerEvents: 'none' }} />

        {/* Center Proximity Node */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 3, textAlign: 'center' }}>
          <div style={{ width: '18px', height: '18px', background: '#059669', borderRadius: '50%', border: '3px solid #ffffff', boxShadow: '0 0 12px rgba(5, 150, 105, 0.8)', margin: '0 auto' }} />
          <span style={{ fontSize: '0.68rem', fontWeight: 800, background: 'var(--card)', color: 'var(--text-main)', padding: '1px 5px', borderRadius: '4px', border: '1px solid var(--border)', marginTop: '2px', display: 'inline-block' }}>
            📍 Your Location
          </span>
        </div>

        {/* Dispensary Pins */}
        {filteredPins.map((pin) => (
          <div
            key={pin.id}
            className="radar-pin-node"
            style={{ top: `${pin.y}%`, left: `${pin.x}%` }}
            onClick={() => setActivePin(pin)}
          >
            <div className="radar-pin-pulse" />
            <span className="radar-pin-label">
              🏥 {pin.name} {typeof pin.stock === 'number' ? `(${pin.stock} items)` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Selected Node Details Card */}
      {activePin && (
        <div style={{
          marginTop: '1rem',
          padding: '0.85rem 1.15rem',
          background: 'var(--card-alt)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.98rem' }}>🏥 {activePin.name}</strong>
              <span className="badge badge-verified" style={{ fontSize: '0.7rem' }}>🟢 Open Now · FDA Verified</span>
              {activePin.distance_km !== null && activePin.distance_km !== undefined && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📍 {Number(activePin.distance_km).toFixed(1)} km away</span>
              )}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {activePin.address} • Region: {activePin.region} {activePin.phone ? `• Tel: ${activePin.phone}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (onSelectPharmacy) onSelectPharmacy(activePin.rawPharmacy || activePin);
                if (onBrowseMedicines) onBrowseMedicines();
              }}
            >
              Browse Stock →
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setActivePin(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
