import React from 'react';

export function MedicineCatalogPage({
  searchResults = [],
  searchQuery,
  setSearchQuery,
  onSearch,
  onAddToCart,
  onViewDetails,
  location,
  isSearching,
  cartItems = [],
  selectedPharmacyFilter = null,
  onClearPharmacyFilter,
  onUploadRx,
}) {
  const catalog = Array.from(searchResults.reduce((medicineMap, item) => {
    // If pharmacy filter is active, only include items belonging to that pharmacy
    if (selectedPharmacyFilter && item.pharmacy?.id !== selectedPharmacyFilter.id) {
      return medicineMap;
    }
    const medicineId = item.medicine.id;
    const current = medicineMap.get(medicineId) || {
      medicine: item.medicine,
      pharmacies: [],
      lowestPrice: Number.POSITIVE_INFINITY,
    };
    current.pharmacies.push(item);
    current.lowestPrice = Math.min(current.lowestPrice, Number(item.price.unit_price_minor || 0));
    medicineMap.set(medicineId, current);
    return medicineMap;
  }, new Map()).values());

  const categoryFilters = [
    { label: 'All medicines', query: '' },
    { label: 'Pain relief', query: 'Paracetamol' },
    { label: 'Antibiotics', query: 'Amoxicillin' },
    { label: 'Antimalarials', query: 'Coartem' },
    { label: 'Vitamins & Minerals', query: 'Vitamin' },
    { label: 'Baby & Child care', query: 'Calpol' },
    { label: 'Allergy care', query: 'Cetirizine' },
  ];

  return (
    <div className="catalog-page">
      <section className="catalog-hero container-page">
        <span className="hero-pill"><span className="hero-dot"></span> Ghana's Verified Medicine Network</span>
        <h1 className="catalog-title">
          {selectedPharmacyFilter ? `Available stock at ${selectedPharmacyFilter.display_name}` : 'Find trusted medicines near you.'}
        </h1>
        <p className="catalog-subtitle">
          {selectedPharmacyFilter 
            ? `Live verified dispensary stock for ${selectedPharmacyFilter.display_name} in ${selectedPharmacyFilter.city || 'Ghana'}.`
            : 'Compare live dispensary stock, transparent Cedi pricing, and verified partner pharmacies across Ghana.'}
        </p>
        
        <form className="catalog-search" onSubmit={(event) => { event.preventDefault(); onSearch(searchQuery); }}>
          <span aria-hidden="true" style={{ fontSize: '1.2rem', marginLeft: '0.4rem', color: 'var(--text-muted)' }}>🔍</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={selectedPharmacyFilter ? `Search medicines in ${selectedPharmacyFilter.display_name}...` : "Search by generic name, brand name, or symptom (e.g., Paracetamol, Amoxicillin)..."}
            aria-label="Search medicines"
          />
          <button type="submit" className="btn btn-primary">{isSearching ? 'Searching...' : 'Search'}</button>
        </form>
      </section>

      <section className="container-page catalog-content">
        {selectedPharmacyFilter && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: '1.15rem 1.5rem',
            marginBottom: '1.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ fontSize: '1.75rem', background: 'var(--card-alt)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>🏥</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                    {selectedPharmacyFilter.display_name}
                  </h3>
                  <span className="badge badge-verified">✓ FDA Verified</span>
                </div>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                  📍 {selectedPharmacyFilter.address_line}, {selectedPharmacyFilter.city} {selectedPharmacyFilter.region ? `(${selectedPharmacyFilter.region})` : ''}
                  {selectedPharmacyFilter.phone ? ` • 📞 ${selectedPharmacyFilter.phone}` : ''}
                  {selectedPharmacyFilter.license_number ? ` • License: ${selectedPharmacyFilter.license_number}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onClearPharmacyFilter}
            >
              ✕ Browse all pharmacies
            </button>
          </div>
        )}

        <div className="catalog-heading-row">
          <div>
            <h2 className="section-title">
              {selectedPharmacyFilter ? `${selectedPharmacyFilter.display_name} Stock` : 'Available Medicines'}
            </h2>
            <p className="section-sub">
              {selectedPharmacyFilter
                ? `Showing verified stock at ${selectedPharmacyFilter.display_name}.`
                : `Showing verified dispensary inventory near ${location?.name || 'Ghana'}.`}
            </p>
          </div>
          <div className="catalog-heading-actions">
            {!selectedPharmacyFilter && (
              <label className="catalog-filter-control">
                <span>Category</span>
                <select
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    onSearch(event.target.value);
                  }}
                  aria-label="Filter medicines by category"
                >
                  {categoryFilters.map((filter) => (
                    <option value={filter.query} key={filter.label}>{filter.label}</option>
                  ))}
                </select>
              </label>
            )}
            <span className="catalog-result-count">{catalog.length} {catalog.length === 1 ? 'medicine' : 'medicines'} found</span>
          </div>
        </div>

        {catalog.length === 0 ? (
          selectedPharmacyFilter ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏥</div>
              <h3>No available stock in {selectedPharmacyFilter.display_name}</h3>
              <p>
                This dispensary is an accredited partner on PharmaLink but currently has no inventory in stock matching your search.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onClearPharmacyFilter}
                >
                  Browse all pharmacies
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onUploadRx && onUploadRx(selectedPharmacyFilter)}
                >
                  📄 Upload Doctor's Prescription
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🔎</div>
              <h3>No medicines found</h3>
              <p>Try searching for another generic name, brand, or broad symptom category.</p>
            </div>
          )
        ) : (
          <div className="catalog-grid">
            {catalog.map((entry) => {
              const bestOption = entry.pharmacies[0];
              const requiresPrescription = entry.medicine.prescription_required;
              const inCartQty = cartItems.find((i) =>
                i.medicine.id === entry.medicine.id
                && i.pharmacy_id === bestOption.pharmacy.id
              )?.quantity || 0;

              return (
                <article className="catalog-card" key={entry.medicine.id}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                      <span className={`badge ${bestOption.availability_state === 'VERIFIED' ? 'badge-verified' : bestOption.availability_state === 'LIKELY' ? 'badge-likely' : 'badge-uncertain'}`}>
                        {bestOption.availability_state === 'VERIFIED' ? '✓ Verified' : '⚡ Likely'}
                      </span>
                      <span className={`badge ${requiresPrescription ? 'badge-rx' : 'badge-otc'}`}>
                        {requiresPrescription ? 'Rx Required' : 'OTC'}
                      </span>
                    </div>

                    <h3 className="product-card-title">{entry.medicine.generic_name}</h3>
                    <p className="product-card-generic">{entry.medicine.brand_name || 'Generic'} · {entry.medicine.formulation}</p>
                    
                    <p className="catalog-strength">
                      {entry.medicine.strength_value || ''}{entry.medicine.strength_unit || ''}
                      {entry.medicine.pack_size ? ` · Pack of ${entry.medicine.pack_size} ${entry.medicine.pack_unit || ''}` : ''}
                    </p>

                    <div className="pharmacy-match-pill">
                      <div className="name">🏥 {bestOption.pharmacy.display_name}</div>
                      <div className="meta">
                        <span>📍 {bestOption.distance_km?.toFixed(1) || 'Distance unavailable'} {bestOption.distance_km ? 'km away' : ''}</span> · <span>🕒 {bestOption.freshness}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700, marginTop: '3px' }}>
                        ● {bestOption.customer_status || (bestOption.availability_state === 'VERIFIED' ? 'Verified in stock' : 'Likely in stock')}
                      </div>
                    </div>
                  </div>

                  <div className="catalog-card-footer">
                    <div>
                      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>Starting from</div>
                      <div className="price-tag">GHS {(entry.lowestPrice / 100).toFixed(2)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onViewDetails && onViewDetails(entry)}
                        title="View clinical info, dosage calculator, and generic alternatives"
                      >
                        🧮 Dosage & Alt
                      </button>
                      <button
                        type="button"
                        className={`btn ${inCartQty > 0 ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                        onClick={() => onAddToCart(bestOption)}
                      >
                        {inCartQty > 0 ? `In Cart (${inCartQty}) +` : '+ Add'}
                      </button>
                    </div>
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

export default MedicineCatalogPage;
