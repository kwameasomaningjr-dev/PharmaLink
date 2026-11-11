import React, { useState, useMemo } from 'react';
import { PharmacyRadarMap } from '../components/PharmacyRadarMap';

export function PharmaciesPage({
  pharmacies = [],
  isLoading = false,
  location = { lat: 5.6037, lng: -0.1870, name: 'Accra, Greater Accra' },
  onBrowseMedicines,
  onBrowsePharmacyStock,
  onRefresh,
}) {
  const [pharmacySearch, setPharmacySearch] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedFulfillment, setSelectedFulfillment] = useState('ALL'); // 'ALL' | 'PICKUP' | 'DELIVERY'

  // Extract unique available regions
  const availableRegions = useMemo(() => {
    const set = new Set(['ALL']);
    pharmacies.forEach((p) => {
      const reg = p.region || p.city;
      if (reg) set.add(reg);
    });
    return Array.from(set);
  }, [pharmacies]);

  const filteredPharmacies = useMemo(() => {
    return pharmacies.filter((p) => {
      const q = pharmacySearch.trim().toLowerCase();
      const matchesSearch = !q ||
        p.display_name?.toLowerCase().includes(q) ||
        p.legal_name?.toLowerCase().includes(q) ||
        p.address_line?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.region?.toLowerCase().includes(q) ||
        p.license_number?.toLowerCase().includes(q);

      const matchesRegion = selectedRegion === 'ALL' ||
        p.region?.toLowerCase() === selectedRegion.toLowerCase() ||
        p.city?.toLowerCase() === selectedRegion.toLowerCase();

      const fulfillment = p.fulfillment_options || {};
      const matchesFulfillment = selectedFulfillment === 'ALL' ||
        (selectedFulfillment === 'PICKUP' && fulfillment.pickup !== false) ||
        (selectedFulfillment === 'DELIVERY' && fulfillment.delivery === true);

      return matchesSearch && matchesRegion && matchesFulfillment;
    });
  }, [pharmacies, pharmacySearch, selectedRegion, selectedFulfillment]);

  return (
    <div className="catalog-page">
      <section className="catalog-hero container-page">
        <span className="hero-pill"><span className="hero-dot"></span> Licensed Pharmacy Partners</span>
        <h1 className="catalog-title">Verified Pharmacies near {location?.name || 'Accra'}.</h1>
        <p className="catalog-subtitle">
          Every dispensary on PharmaLink is licensed by Ghana's Pharmacy Council and verified by platform operations with live stock signals and fulfillment coverage.
        </p>
      </section>

      {/* Live Interactive Pharmacy Radar Map */}
      <section className="container-page">
        <PharmacyRadarMap
          pharmacies={filteredPharmacies.length > 0 ? filteredPharmacies : pharmacies}
          currentLocation={location}
          onSelectPharmacy={onBrowsePharmacyStock}
          onBrowseMedicines={onBrowseMedicines}
        />
      </section>

      {/* Filters and Search Bar */}
      <section className="container-page" style={{ marginTop: '2rem' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'var(--surface)',
          padding: '1.25rem 1.5rem',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border)',
          marginBottom: '1.5rem'
        }}>
          <div style={{ flex: '1 1 280px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>🔍</span>
            <input
              type="text"
              className="hero-search-input"
              style={{ padding: '0.6rem 0.8rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--card)', width: '100%' }}
              placeholder="Search pharmacy name, city, address, or license #..."
              value={pharmacySearch}
              onChange={(e) => setPharmacySearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {availableRegions.slice(0, 5).map((reg) => (
                <button
                  key={reg}
                  type="button"
                  className={`btn btn-sm ${selectedRegion === reg ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.76rem', padding: '0.35rem 0.7rem' }}
                  onClick={() => setSelectedRegion(reg)}
                >
                  {reg === 'ALL' ? 'All Regions' : reg}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${selectedFulfillment === 'ALL' ? 'btn-outline' : 'btn-secondary'}`}
                style={{ fontSize: '0.76rem' }}
                onClick={() => setSelectedFulfillment('ALL')}
              >
                All
              </button>
              <button
                type="button"
                className={`btn btn-sm ${selectedFulfillment === 'DELIVERY' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.76rem' }}
                onClick={() => setSelectedFulfillment('DELIVERY')}
              >
                🚚 Delivery
              </button>
              <button
                type="button"
                className={`btn btn-sm ${selectedFulfillment === 'PICKUP' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.76rem' }}
                onClick={() => setSelectedFulfillment('PICKUP')}
              >
                📦 Pickup
              </button>
            </div>

            {onRefresh && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onRefresh}
                title="Refresh verified pharmacies list"
                style={{ fontSize: '0.76rem' }}
              >
                ↻ Refresh
              </button>
            )}
          </div>
        </div>

        {/* Directory Grid */}
        {isLoading ? (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <h3>Loading verified pharmacies...</h3>
            <p>Fetching licensed dispensary network in Ghana.</p>
          </div>
        ) : filteredPharmacies.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏥</div>
            <h3>No verified pharmacies found</h3>
            <p>
              {pharmacySearch || selectedRegion !== 'ALL' || selectedFulfillment !== 'ALL'
                ? 'No dispensary matches your filter criteria. Try resetting filters.'
                : 'No pharmacies currently approved in this area. Once platform operations verifies a pharmacy, it will appear here immediately.'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
              {(pharmacySearch || selectedRegion !== 'ALL' || selectedFulfillment !== 'ALL') && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setPharmacySearch('');
                    setSelectedRegion('ALL');
                    setSelectedFulfillment('ALL');
                  }}
                >
                  Reset Filters
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={onBrowseMedicines}>
                Browse Medicines
              </button>
            </div>
          </div>
        ) : (
          <div className="pharmacy-directory-grid">
            {filteredPharmacies.map((item) => {
              const fulfillment = item.fulfillment_options || {};
              const hours = item.opening_hours || {};
              return (
                <article className="pharmacy-directory-card" key={item.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="pharmacy-directory-icon">🏥</div>
                    <span className="badge badge-verified">✓ FDA Verified</span>
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{item.display_name}</h2>
                    {item.legal_name && item.legal_name !== item.display_name && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        {item.legal_name}
                      </p>
                    )}
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      📍 {item.address_line}, {item.city} {item.region ? `(${item.region})` : ''}
                    </p>
                    {item.phone && (
                      <p style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 600, marginTop: '0.2rem' }}>
                        📞 {item.phone}
                      </p>
                    )}
                  </div>
                  <div className="pharmacy-directory-meta">
                    <span>📍 {item.distance_km !== null && item.distance_km !== undefined ? `${Number(item.distance_km).toFixed(1)} km away` : `Near ${location?.name || 'Accra'}`}</span>
                    <span>🕒 {hours.mon_fri || 'Mon-Sat: 08:00 - 20:00'}</span>
                  </div>
                  <div className="pharmacy-directory-meta">
                    <span>📦 Pickup {fulfillment.pickup !== false ? 'Available' : 'Unavailable'}</span>
                    <span>🚚 Delivery {fulfillment.delivery ? 'Available' : 'Unavailable'}</span>
                  </div>
                  {item.license_number && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', background: 'var(--surface)', padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      🛡️ License: <strong>{item.license_number}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => {
                        if (onBrowsePharmacyStock) {
                          onBrowsePharmacyStock(item);
                        } else {
                          onBrowseMedicines();
                        }
                      }}
                    >
                      Browse available stock →
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default PharmaciesPage;
