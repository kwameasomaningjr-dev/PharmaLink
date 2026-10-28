import React, { useState } from 'react';

export function MedicineDetailModal({ medicineEntry, onClose, onAddToCart, allSearchResults = [] }) {
  if (!medicineEntry) return null;

  const { medicine, pharmacies, lowestPrice } = medicineEntry;
  const bestPharmacy = pharmacies[0];

  // Dosage calculator state
  const [frequency, setFrequency] = useState('2'); // times per day
  const [days, setDays] = useState(5);
  const [tabletsPerDose, setTabletsPerDose] = useState(1);

  // Find alternative medicines in the same category or generic family
  const alternatives = allSearchResults.filter((item) => {
    return item.medicine.id !== medicine.id && (
      item.medicine.therapeutic_class === medicine.therapeutic_class ||
      item.medicine.generic_name.toLowerCase().includes(medicine.generic_name.toLowerCase().split(' ')[0]) ||
      (medicine.therapeutic_class && item.medicine.therapeutic_class === medicine.therapeutic_class)
    );
  }).slice(0, 4);

  // Compute dosage requirements
  const totalUnitsNeeded = Number(frequency) * Number(days) * Number(tabletsPerDose);
  const packSize = Number(medicine.pack_size) || 10;
  const packsRequired = Math.max(1, Math.ceil(totalUnitsNeeded / packSize));
  const estimatedCost = (lowestPrice / 100) * packsRequired;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className={`badge ${medicine.prescription_required ? 'badge-rx' : 'badge-otc'}`}>
                {medicine.prescription_required ? 'Rx Required' : 'OTC Medicine'}
              </span>
              <span className="badge badge-verified">✓ FDA Registered</span>
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>{medicine.generic_name}</h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {medicine.brand_name || 'Generic'} · {medicine.formulation} · {medicine.strength_value}{medicine.strength_unit}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Quick Details Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem',
            background: 'var(--card-alt)',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            marginBottom: '1rem'
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Starting Price</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--primary)', marginTop: '2px' }}>
                GHS {(lowestPrice / 100).toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Pack Size</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: '2px' }}>
                {medicine.pack_size || '10'} {medicine.pack_unit || 'units'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Availability</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                {pharmacies.length} {pharmacies.length === 1 ? 'Dispensary' : 'Dispensaries'}
              </div>
            </div>
          </div>

          {/* Interactive Dosage & Duration Calculator */}
          <div className="dosage-calc-card" style={{ margin: '0 0 1rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                <span>🧮</span> Treatment & Dosage Calculator
              </h4>
              <span className="badge badge-verified" style={{ fontSize: '0.7rem' }}>Ghana Health Service Guide</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', marginBottom: '0.65rem' }}>
              Calculate total medicine units and blister packs needed for your treatment course.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: '0.25rem' }}>Daily Frequency</label>
                <select className="form-select" value={frequency} onChange={(e) => setFrequency(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}>
                  <option value="1">Once Daily (OD)</option>
                  <option value="2">Twice Daily (BD / 12hrly)</option>
                  <option value="3">Three Times Daily (TDS / 8hrly)</option>
                  <option value="4">Four Times Daily (QDS / 6hrly)</option>
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: '0.25rem' }}>Dose Amount</label>
                <select className="form-select" value={tabletsPerDose} onChange={(e) => setTabletsPerDose(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}>
                  <option value="1">1 tablet / dose</option>
                  <option value="2">2 tablets / dose</option>
                  <option value="3">3 tablets / dose</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700 }}>
                <span>Course Duration:</span>
                <span style={{ color: 'var(--primary)' }}>{days} Days</span>
              </div>
              <div className="dosage-slider-row" style={{ marginTop: '0.4rem' }}>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
              </div>
            </div>

            <div className="dosage-summary-pill" style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>Estimated Treatment Requirement</div>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '2px' }}>
                  {totalUnitsNeeded} total doses ➔ <strong>{packsRequired} {packsRequired === 1 ? 'pack' : 'packs'}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Estimated Cost</div>
                <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--primary)' }}>
                  GHS {estimatedCost.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Fulfilling Pharmacies */}
          <div style={{ marginTop: '0.85rem' }}>
            <h4 style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: '0.5rem' }}>
              Available at {pharmacies.length} verified {pharmacies.length === 1 ? 'dispensary' : 'dispensaries'}:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {pharmacies.map((item, idx) => (
                <div
                  key={item.pharmacy.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.65rem 0.85rem',
                    background: idx === 0 ? 'var(--secondary)' : 'var(--card-alt)',
                    borderRadius: 'var(--radius-md)',
                    border: idx === 0 ? '1px solid var(--badge-verified-border)' : '1px solid var(--border)'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>🏥 {item.pharmacy.display_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      📍 {item.distance_km?.toFixed(1) || '—'} km away · 🕒 {item.freshness}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ fontWeight: 900, color: 'var(--primary)', fontSize: '0.95rem' }}>
                      GHS {(Number(item.price.unit_price_minor || 0) / 100).toFixed(2)}
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                      onClick={() => {
                        onAddToCart(item);
                        onClose();
                      }}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cheaper Generic Alternatives */}
          {alternatives.length > 0 && (
            <div style={{ marginTop: '1.15rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                <h4 style={{ fontWeight: 800, fontSize: '0.9rem', margin: 0 }}>💊 Generic Alternatives & Equivalent Brands</h4>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Verified substitutes</span>
              </div>
              <div className="alternatives-grid" style={{ marginTop: '0.65rem' }}>
                {alternatives.map((alt) => (
                  <div className="alternative-card" key={alt.medicine.id} style={{ padding: '0.65rem' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{alt.medicine.generic_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{alt.medicine.brand_name || 'Generic'}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 700, marginTop: '0.15rem' }}>
                        🏥 {alt.pharmacy.display_name}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem' }}>
                      <span style={{ fontWeight: 900, fontSize: '0.85rem', color: 'var(--primary)' }}>
                        GHS {(Number(alt.price.unit_price_minor || 0) / 100).toFixed(2)}
                      </span>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                        onClick={() => {
                          onAddToCart(alt);
                          onClose();
                        }}
                      >
                        + Select
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onAddToCart(bestPharmacy);
              onClose();
            }}
          >
            Add to Cart (GHS {(lowestPrice / 100).toFixed(2)})
          </button>
        </div>
      </div>
    </div>
  );
}
