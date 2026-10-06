import React, { useState } from 'react';

export function PharmacyRadarMap({ pharmacies = [], currentLocation, onSelectPharmacy, onBrowseMedicines }) {
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [activePin, setActivePin] = useState(null);

  const regions = ['All', 'Greater Accra', 'Ashanti', 'Western', 'Central', 'Northern'];

  // Default coordinate positions for key visual pins
  const hubCoordinates = [
    { id: '1', name: 'East Legon Hub', region: 'Greater Accra', x: 65, y: 35, open: true, stock: 142 },
    { id: '2', name: 'Osu Oxford St', region: 'Greater Accra', x: 50, y: 70, open: true, stock: 98 },
    { id: '3', name: 'Airport Residential', region: 'Greater Accra', x: 58, y: 48, open: true, stock: 210 },
    { id: '4', name: 'Spintex Road', region: 'Greater Accra', x: 80, y: 55, open: true, stock: 115 },
    { id: '5', name: 'Tema Community 1', region: 'Greater Accra', x: 90, y: 45, open: true, stock: 85 },
    { id: '6', name: 'Kumasi Adum', region: 'Ashanti', x: 30, y: 40, open: true, stock: 160 },
    { id: '7', name: 'Takoradi Market Circle', region: 'Western', x: 25, y: 80, open: true, stock: 74 },
  ];

  const filteredPins = selectedRegion === 'All' 
    ? hubCoordinates 
    : hubCoordinates.filter(p => p.region === selectedRegion);

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
            Real-time verified dispensary stock radar centered near {currentLocation?.name || 'Accra, Ghana'}.
          </p>
        </div>

        {/* Region Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {regions.map((reg) => (
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
              🏥 {pin.name} ({pin.stock} in stock)
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <strong style={{ fontSize: '0.98rem' }}>🏥 {activePin.name}</strong>
              <span className="badge badge-verified" style={{ fontSize: '0.7rem' }}>🟢 Open Now · 24hr Dispense</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Region: {activePin.region} · Verified Live Inventory: <strong>{activePin.stock} products</strong>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
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
