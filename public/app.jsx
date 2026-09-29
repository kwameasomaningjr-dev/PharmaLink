import React, { useState, useEffect, useMemo, useCallback, useRef, Component } from 'react';
import ReactDOM from 'react-dom/client';
import { motion, useScroll, useTransform } from 'framer-motion';
import { TextRevealByWord } from '../components/ui/text-reveal';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('PharmaLink UI Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: 'Outfit, sans-serif', maxWidth: '600px', margin: '40px auto' }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '12px' }}>Something went wrong loading PharmaLink</h2>
          <p style={{ color: 'var(--text-muted, #64748b)', marginBottom: '24px', lineHeight: 1.6 }}>
            {this.state.error?.message || 'An unexpected error occurred while rendering the portal.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-primary"
            style={{ padding: '12px 28px' }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const GHANA_CITIES = [
  { name: 'Accra, Greater Accra', region: 'Greater Accra', lat: 5.6037, lng: -0.1870 },
  { name: 'East Legon, Accra', region: 'Greater Accra', lat: 5.6350, lng: -0.1580 },
  { name: 'Osu, Accra', region: 'Greater Accra', lat: 5.5560, lng: -0.1820 },
  { name: 'Airport Residential, Accra', region: 'Greater Accra', lat: 5.5980, lng: -0.1810 },
  { name: 'Spintex, Accra', region: 'Greater Accra', lat: 5.6450, lng: -0.0950 },
  { name: 'Tema, Greater Accra', region: 'Greater Accra', lat: 5.6698, lng: -0.0166 },
  { name: 'Kumasi, Ashanti', region: 'Ashanti', lat: 6.6885, lng: -1.6244 },
  { name: 'Takoradi, Western', region: 'Western', lat: 4.9016, lng: -1.7831 },
  { name: 'Tamale, Northern', region: 'Northern', lat: 9.4008, lng: -0.8393 },
  { name: 'Cape Coast, Central', region: 'Central', lat: 5.1054, lng: -1.2466 },
  { name: 'Koforidua, Eastern', region: 'Eastern', lat: 6.0941, lng: -0.2591 },
  { name: 'Sunyani, Bono', region: 'Bono', lat: 7.3349, lng: -2.3123 },
  { name: 'Ho, Volta', region: 'Volta', lat: 6.6000, lng: 0.4700 },
  { name: 'Wa, Upper West', region: 'Upper West', lat: 10.0600, lng: -2.5000 },
  { name: 'Bolgatanga, Upper East', region: 'Upper East', lat: 10.7856, lng: -0.8514 },
  { name: 'Techiman, Bono East', region: 'Bono East', lat: 7.5833, lng: -1.9333 },
  { name: 'Goaso, Ahafo', region: 'Ahafo', lat: 6.8000, lng: -2.5167 },
  { name: 'Nalerigu, North East', region: 'North East', lat: 10.5333, lng: -0.3667 },
  { name: 'Damongo, Savannah', region: 'Savannah', lat: 9.0833, lng: -1.8167 },
  { name: 'Sefwi Wiawso, Western North', region: 'Western North', lat: 6.2000, lng: -2.4833 },
];

function getNearestCityName(lat, lng) {
  const nearestCity = GHANA_CITIES.reduce((nearest, city) => {
    const currentDistance = ((city.lat - lat) ** 2) + ((city.lng - lng) ** 2);
    const nearestDistance = ((nearest.lat - lat) ** 2) + ((nearest.lng - lng) ** 2);
    return currentDistance < nearestDistance ? city : nearest;
  });
  return nearestCity.name;
}

const pagePaths = {
  home: '/',
  medicines: '/medicines',
  pharmacies: '/pharmacies',
  prescriptions: '/prescriptions',
  howItWorks: '/how-it-works',
};

function pageFromPath(pathname) {
  const match = Object.entries(pagePaths).find(([, path]) => path === pathname);
  return match?.[0] || 'home';
}

function adminPageFromPath(pathname, portal) {
  const prefix = portal === 'platform' ? '/platform/' : '/pharmacy/';
  if (!pathname.startsWith(prefix)) return portal === 'platform' ? 'network' : 'overview';
  const page = pathname.slice(prefix.length);
  if (portal === 'platform' && ['network', 'verification', 'analytics', 'audit'].includes(page)) return page;
  if (portal === 'pharmacy' && ['overview', 'orders', 'inventory', 'prescriptions', 'settings'].includes(page)) return page;
  return portal === 'platform' ? 'network' : 'overview';
}

function HeroHeadlineReveal({ text }) {
  const words = text.split(" ");
  return (
    <h1 className="hero-heading">
      {words.map((word, i) => {
        const isHighlight = word.toLowerCase().includes("pharmacy") || word.toLowerCase().includes("closest") || word.toLowerCase().includes("you");
        return (
          <span key={i} className="hero-reveal-word-wrap">
            <span className={`hero-reveal-word-bg ${isHighlight ? 'is-highlight' : ''}`}>{word}</span>
            <motion.span
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{
                duration: 0.75,
                delay: 0.25 + i * 0.22,
                ease: [0.25, 0.1, 0.25, 1.0],
              }}
              className={`hero-reveal-word-fg ${isHighlight ? 'is-highlight' : ''}`}
            >
              {word}
            </motion.span>
          </span>
        );
      })}
    </h1>
  );
}

/* ==========================================================================
   Page: Medicine Catalog
   ========================================================================== */
function MedicineCatalogPage({ searchResults, searchQuery, setSearchQuery, onSearch, onAddToCart, location, isSearching, cartItems = [] }) {
  const catalog = Array.from(searchResults.reduce((medicineMap, item) => {
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
        <h1 className="catalog-title">Find trusted medicines near you.</h1>
        <p className="catalog-subtitle">Compare live dispensary stock, transparent Cedi pricing, and verified partner pharmacies across Ghana.</p>
        
        <form className="catalog-search" onSubmit={(event) => { event.preventDefault(); onSearch(searchQuery); }}>
          <span aria-hidden="true" style={{ fontSize: '1.2rem', marginLeft: '0.4rem', color: 'var(--text-muted)' }}>🔍</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by generic name, brand name, or symptom (e.g., Paracetamol, Amoxicillin)..."
            aria-label="Search medicines"
          />
          <button type="submit" className="btn btn-primary">{isSearching ? 'Searching...' : 'Search'}</button>
        </form>
      </section>

      <section className="container-page catalog-content">
        <div className="catalog-heading-row">
          <div>
            <h2 className="section-title">Available Medicines</h2>
            <p className="section-sub">Showing verified dispensary inventory near {location.name}.</p>
          </div>
          <div className="catalog-heading-actions">
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
            <span className="catalog-result-count">{catalog.length} {catalog.length === 1 ? 'medicine' : 'medicines'} found</span>
          </div>
        </div>

        {catalog.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔎</div>
            <h3>No medicines found</h3>
            <p>Try searching for another generic name, brand, or broad symptom category.</p>
          </div>
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
                        <span>📍 {bestOption.distance_km?.toFixed(1) || '—'} km away</span> · <span>🕒 {bestOption.freshness}</span>
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
                    <button
                      type="button"
                      className={`btn ${inCartQty > 0 ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                      onClick={() => onAddToCart(bestOption)}
                    >
                      {inCartQty > 0 ? `In Cart (${inCartQty}) +` : '+ Add to Order'}
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

/* ==========================================================================
   Page: Pharmacies Directory
   ========================================================================== */
function PharmaciesPage({ searchResults, location, onBrowseMedicines }) {
  const pharmacies = Array.from(searchResults.reduce((pharmacyMap, item) => {
    if (!pharmacyMap.has(item.pharmacy.id)) pharmacyMap.set(item.pharmacy.id, item);
    return pharmacyMap;
  }, new Map()).values());

  return (
    <div className="catalog-page">
      <section className="catalog-hero container-page">
        <span className="hero-pill"><span className="hero-dot"></span> Licensed Pharmacy Partners</span>
        <h1 className="catalog-title">Verified Pharmacies near {location.name}.</h1>
        <p className="catalog-subtitle">Every dispensary on PharmaLink is licensed by Ghana's Pharmacy Council with live stock signals and fulfillment coverage.</p>
      </section>
      <section className="container-page">
        {pharmacies.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏥</div>
            <h3>Search for medicines first</h3>
            <p>Browse medicines to see which partner pharmacies hold verified inventory near you.</p>
            <button type="button" className="btn btn-primary" onClick={onBrowseMedicines}>Browse medicines</button>
          </div>
        ) : (
          <div className="pharmacy-directory-grid">
            {pharmacies.map((item) => (
              <article className="pharmacy-directory-card" key={item.pharmacy.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="pharmacy-directory-icon">🏥</div>
                  <span className="badge badge-verified">✓ FDA Verified</span>
                </div>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{item.pharmacy.display_name}</h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {item.pharmacy.address_line}, {item.pharmacy.city}
                  </p>
                </div>
                <div className="pharmacy-directory-meta">
                  <span>📍 {item.distance_km?.toFixed(1) || '—'} km away</span>
                  <span>🕒 {item.freshness}</span>
                </div>
                <div className="pharmacy-directory-meta">
                  <span>📦 Pickup {item.fulfillment.pickup ? 'Available' : 'Unavailable'}</span>
                  <span>🚚 Delivery {item.fulfillment.delivery ? 'Available' : 'Unavailable'}</span>
                </div>
                <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: '0.5rem' }} onClick={onBrowseMedicines}>
                  Browse available stock →
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ==========================================================================
   Page: How It Works
   ========================================================================== */
function HowItWorksPage({ onBrowseMedicines }) {
  const steps = [
    ['01', 'Search or Upload Rx', 'Find any medicine by generic name, brand, or symptom. For prescription drugs, easily attach a photo during checkout.', '🔍'],
    ['02', 'We Match Real-time Stock', 'PharmaLink ranks verified pharmacies by GPS proximity, stock confidence, freshness, and delivery availability.', '📍'],
    ['03', 'Choose Pickup or Delivery', 'Collect your order at the dispensary counter in minutes or receive safe doorstep delivery directly to your home.', '🚚'],
  ];

  return (
    <div className="catalog-page">
      <section className="catalog-hero container-page">
        <span className="hero-pill"><span className="hero-dot"></span> Simple, Transparent, Ghana-first</span>
        <h1 className="catalog-title">From search to dispensary in three steps.</h1>
        <p className="catalog-subtitle">Never walk from chemist to chemist in the heat again. Check availability instantly from verified pharmacies across Ghana.</p>
      </section>
      
      <section className="container-page steps-page-grid">
        {steps.map(([number, title, description, emoji]) => (
          <article className="step-card" key={number}>
            <div className="step-icon-wrapper">
              <div className="step-icon">{emoji}</div>
              <div className="step-badge">Step {number}</div>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '1.25rem' }}>{title}</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: 1.6 }}>{description}</p>
          </article>
        ))}
      </section>

      <section className="container-page trust-banner">
        <div className="trust-item">
          <div className="trust-icon">🛡️</div>
          <div>
            <h4 style={{ fontWeight: 800, fontSize: '1.05rem' }}>Licensed by Pharmacy Council</h4>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Every partner pharmacy is accredited and regulated in Ghana.</p>
          </div>
        </div>
        <div className="trust-item">
          <div className="trust-icon">⚡</div>
          <div>
            <h4 style={{ fontWeight: 800, fontSize: '1.05rem' }}>Verified Stock Signals</h4>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Clear indicators showing confirmed physical shelf count vs likely stock.</p>
          </div>
        </div>
        <div className="trust-item">
          <div className="trust-icon">🔒</div>
          <div>
            <h4 style={{ fontWeight: 800, fontSize: '1.05rem' }}>Private Pharmacist Review</h4>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Prescriptions are encrypted and reviewed only by licensed dispensing staff.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ==========================================================================
   Page: Prescriptions Page
   ========================================================================== */
function PrescriptionsPage({ currentUser, onBrowseMedicines, onSignIn }) {
  return (
    <div className="catalog-page">
      <section className="catalog-hero container-page">
        <span className="hero-pill"><span className="hero-dot"></span> Safe & Regulated Healthcare</span>
        <h1 className="catalog-title">Pharmacist-reviewed prescriptions in Ghana.</h1>
        <p className="catalog-subtitle">Upload your doctor's prescription during checkout. A licensed dispensing pharmacist reviews and confirms before fulfillment.</p>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={onBrowseMedicines}>Find prescription medicines</button>
          {!currentUser && <button type="button" className="btn btn-outline" onClick={onSignIn}>Sign in to your account</button>}
        </div>
      </section>

      <section className="container-page prescription-guide-grid">
        <article className="step-card">
          <div className="step-icon">📄</div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '1rem' }}>Accepted formats</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.5 }}>
            Upload clean PDF, JPG, or PNG files up to 5 MB with the doctor's stamp and date clearly visible.
          </p>
        </article>

        <article className="step-card">
          <div className="step-icon">🔒</div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '1rem' }}>Strict Privacy Protection</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.5 }}>
            Prescription files are stored in private secure storage, accessible only to you and the assigned licensed pharmacy.
          </p>
        </article>

        <article className="step-card">
          <div className="step-icon">👨‍⚕️</div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '1rem' }}>Pharmacist Decision</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.5 }}>
            The pharmacist approves, requests clarification, or rejects before any payment or physical dispensing occurs.
          </p>
        </article>
      </section>
    </div>
  );
}

/* ==========================================================================
   Page: Platform Operations Dashboard
   ========================================================================== */
function PlatformOperationsDashboard({ pharmacies, auditEvents, isLoading, activeFilter, setActiveFilter, onRefresh, onVerificationChange, activePage }) {
  const counts = pharmacies.reduce((summary, pharmacy) => {
    summary.total += 1;
    summary[pharmacy.verification_status] = (summary[pharmacy.verification_status] || 0) + 1;
    return summary;
  }, { total: 0, PENDING: 0, VERIFIED: 0, REJECTED: 0, SUSPENDED: 0 });

  const isVerificationPage = activePage === 'verification';
  const isAnalyticsPage = activePage === 'analytics';
  const isAuditPage = activePage === 'audit';
  const effectiveFilter = isVerificationPage ? 'PENDING' : activeFilter;
  const visiblePharmacies = effectiveFilter === 'ALL'
    ? pharmacies
    : pharmacies.filter((pharmacy) => pharmacy.verification_status === effectiveFilter);
  const pageTitle = isVerificationPage ? 'Verification queue'
    : isAnalyticsPage ? 'Network analytics'
      : isAuditPage ? 'Audit activity'
        : 'Pharmacy network';

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="admin-eyebrow">🛡️ PLATFORM OPERATIONS</span>
          <h1>{pageTitle}</h1>
          <p>
            {isVerificationPage
              ? 'Review pending pharmacy applications and make auditable onboarding decisions.'
              : isAnalyticsPage
                ? 'Monitor pharmacy coverage, onboarding throughput, and network health.'
                : isAuditPage
                  ? 'Review recent onboarding and administrative activity across the platform.'
                  : 'Manage every pharmacy onboarded to PharmaLink, review verification status, and monitor network health.'}
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onRefresh}>↻ Refresh data</button>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card"><span>Total pharmacies</span><strong>{counts.total}</strong><small>All onboarded records</small></div>
        <div className="admin-stat-card"><span>Verified</span><strong>{counts.VERIFIED}</strong><small>Active marketplace partners</small></div>
        <div className="admin-stat-card"><span>Pending review</span><strong>{counts.PENDING}</strong><small>Applications needing action</small></div>
        <div className="admin-stat-card"><span>Attention needed</span><strong>{counts.REJECTED + counts.SUSPENDED}</strong><small>Rejected or suspended</small></div>
      </div>

      {!isAnalyticsPage && !isAuditPage && <div className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h2>All pharmacies</h2>
            <p>Network directory and onboarding status.</p>
          </div>
          <div className="admin-filter-tabs">
            {(isVerificationPage ? ['PENDING'] : ['ALL', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']).map((filter) => (
              <button
                type="button"
                key={filter}
                className={effectiveFilter === filter ? 'active' : ''}
                onClick={() => setActiveFilter(filter)}
              >
                {filter === 'ALL' ? 'All' : filter.charAt(0) + filter.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="admin-empty-state">Loading pharmacy network...</div>
        ) : visiblePharmacies.length === 0 ? (
          <div className="admin-empty-state">No pharmacies match this status.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Pharmacy</th>
                  <th>Location</th>
                  <th>License</th>
                  <th>Status</th>
                  <th>Last updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePharmacies.map((pharmacy) => (
                  <tr key={pharmacy.id}>
                    <td>
                      <strong>{pharmacy.display_name}</strong>
                      <small>{pharmacy.legal_name || 'Legal name not provided'}</small>
                    </td>
                    <td>{pharmacy.city}, {pharmacy.region}</td>
                    <td>{pharmacy.license_number || 'Not provided'}</td>
                    <td><span className={`admin-status admin-status-${pharmacy.verification_status.toLowerCase()}`}>{pharmacy.verification_status}</span></td>
                    <td>{pharmacy.updated_at ? new Date(pharmacy.updated_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <div className="admin-row-actions">
                        {pharmacy.verification_status === 'PENDING' && (
                          <>
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => onVerificationChange(pharmacy, 'VERIFIED')}>Approve</button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => onVerificationChange(pharmacy, 'REJECTED')}>Reject</button>
                          </>
                        )}
                        {pharmacy.verification_status === 'VERIFIED' && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => onVerificationChange(pharmacy, 'SUSPENDED')}>Suspend</button>
                        )}
                        {(pharmacy.verification_status === 'REJECTED' || pharmacy.verification_status === 'SUSPENDED') && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => onVerificationChange(pharmacy, 'VERIFIED')}>Restore</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {!isAuditPage && <div className="admin-insight-grid">
        <div className="admin-panel">
          <h2>Verification queue</h2>
          <p>Pending applications are surfaced first for license and business-detail review.</p>
          <strong className="admin-insight-number">{counts.PENDING}</strong>
          <span className="admin-insight-label">applications awaiting review</span>
        </div>
        <div className="admin-panel">
          <h2>Network coverage</h2>
          <p>Verified pharmacies currently eligible to receive marketplace orders.</p>
          <strong className="admin-insight-number">{counts.VERIFIED}</strong>
          <span className="admin-insight-label">active verified partners</span>
        </div>
        <div className="admin-panel">
          <h2>Audit readiness</h2>
          <p>All onboarding and pharmacy changes are recorded through the platform audit trail.</p>
          <strong className="admin-insight-number">{auditEvents.length}</strong>
          <span className="admin-insight-label">recent events loaded</span>
        </div>
      </div>}

      {(!isAnalyticsPage || isAuditPage) && <div className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h2>Recent audit activity</h2>
            <p>Verification and onboarding events across the pharmacy network.</p>
          </div>
        </div>
        {auditEvents.length === 0 ? (
          <div className="admin-empty-state">No audit events recorded yet.</div>
        ) : (
          <div className="admin-audit-list">
            {auditEvents.slice(0, 8).map((event) => (
              <div className="admin-audit-item" key={event.id}>
                <span className="admin-audit-dot" />
                <div>
                  <strong>{event.event_type.replaceAll('_', ' ')}</strong>
                  <small>{event.entity_type} · {new Date(event.created_at).toLocaleString()}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      {isAnalyticsPage && (
        <div className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h2>Operational indicators</h2>
              <p>Current demo-network indicators sourced from pharmacy onboarding records.</p>
            </div>
          </div>
          <div className="admin-insight-grid">
            <div><strong className="admin-insight-number">{counts.VERIFIED}</strong><span className="admin-insight-label">verified pharmacies receiving orders</span></div>
            <div><strong className="admin-insight-number">{counts.PENDING}</strong><span className="admin-insight-label">applications awaiting review</span></div>
            <div><strong className="admin-insight-number">{auditEvents.length}</strong><span className="admin-insight-label">audit events in current activity window</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function PharmacySettingsPage({ pharmacyData, onOpenCsvImport }) {
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="admin-eyebrow">🏥 PHARMACY OPERATIONS</span>
          <h1>Pharmacy settings</h1>
          <p>Review the pharmacy profile and operational configuration used for fulfillment.</p>
        </div>
      </div>
      <div className="admin-panel">
        <h2>{pharmacyData?.display_name || 'Pharmacy profile'}</h2>
        <div className="admin-settings-grid">
          <div><span>Legal name</span><strong>{pharmacyData?.legal_name || 'Not provided'}</strong></div>
          <div><span>License number</span><strong>{pharmacyData?.license_number || 'Not provided'}</strong></div>
          <div><span>Location</span><strong>{pharmacyData?.address_line || 'Not provided'}{pharmacyData?.city ? `, ${pharmacyData.city}` : ''}</strong></div>
          <div><span>Verification status</span><strong>{pharmacyData?.verification_status || 'Unknown'}</strong></div>
        </div>
        <div className="admin-settings-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={onOpenCsvImport}>⇧ Import inventory CSV</button>
          <span className="admin-settings-note">Profile editing and staff management can be added here without changing the customer marketplace.</span>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Main App Component
   ========================================================================== */
function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const savedTheme = window.localStorage.getItem('pharmalink-theme');
      if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme === 'dark';
    } catch (err) {
      console.warn('Could not read saved theme preference:', err);
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    try {
      window.localStorage.setItem('pharmalink-theme', isDarkMode ? 'dark' : 'light');
    } catch (err) {
      console.warn('Could not save theme preference:', err);
    }
  }, [isDarkMode]);

  // Initial Intro Scene Splash (runs once per browser tab session)
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return !sessionStorage.getItem('pharmalink_intro_played');
    } catch {
      return false;
    }
  });

  const dismissSplash = useCallback(() => {
    setShowSplash(false);
    try {
      sessionStorage.setItem('pharmalink_intro_played', 'true');
    } catch {}
  }, []);

  useEffect(() => {
    if (showSplash) {
      const timer = setTimeout(() => {
        dismissSplash();
      }, 5200);
      return () => clearTimeout(timer);
    }
  }, [showSplash, dismissSplash]);

  // Navigation & Portal State
  const [activePortal, setActivePortal] = useState(() => {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/platform/')) return 'platform';
    if (pathname.startsWith('/pharmacy/')) return 'pharmacy';
    try {
      const savedUser = window.localStorage.getItem('pharmalink-user');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u.role === 'PLATFORM_OPS') return 'platform';
        if (['PHARMACY_ADMIN', 'PHARMACY_STAFF'].includes(u.role)) return 'pharmacy';
      }
    } catch {}
    return 'customer';
  });
  const [activePage, setActivePage] = useState(() => pageFromPath(window.location.pathname));
  const [activePharmTab, setActivePharmTab] = useState('orders'); // 'orders' | 'inventory' | 'prescriptions'
  const [activeAdminPage, setActiveAdminPage] = useState(() => {
    const pathname = window.location.pathname;
    return pathname.startsWith('/platform/')
      ? adminPageFromPath(pathname, 'platform')
      : adminPageFromPath(pathname, 'pharmacy');
  });
  const [platformFilter, setPlatformFilter] = useState('ALL');
  
  // Auth state with localStorage persistence
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = window.localStorage.getItem('pharmalink-user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [currentToken, setCurrentToken] = useState(() => {
    try {
      return window.localStorage.getItem('pharmalink-auth-token');
    } catch {
      return null;
    }
  });
  const [authRestoring, setAuthRestoring] = useState(true);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [pharmacyData, setPharmacyData] = useState(() => {
    try {
      const saved = window.localStorage.getItem('pharmalink-pharmacy');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (currentToken) {
        window.localStorage.setItem('pharmalink-auth-token', currentToken);
      } else {
        window.localStorage.removeItem('pharmalink-auth-token');
      }
    } catch {}
  }, [currentToken]);

  useEffect(() => {
    try {
      if (currentUser) {
        window.localStorage.setItem('pharmalink-user', JSON.stringify(currentUser));
      } else {
        window.localStorage.removeItem('pharmalink-user');
      }
    } catch {}
  }, [currentUser]);

  useEffect(() => {
    try {
      if (pharmacyData) {
        window.localStorage.setItem('pharmalink-pharmacy', JSON.stringify(pharmacyData));
      } else {
        window.localStorage.removeItem('pharmalink-pharmacy');
      }
    } catch {}
  }, [pharmacyData]);

  const isPharmacyUser = useMemo(() => {
    return (
      currentUser?.role === 'PLATFORM_OPS' ||
      ((currentUser?.role === 'PHARMACY_ADMIN' || currentUser?.role === 'PHARMACY_STAFF') &&
        pharmacyData?.verification_status === 'VERIFIED')
    );
  }, [currentUser, pharmacyData]);

  useEffect(() => {
    if (isPharmacyUser) {
      setActivePortal(currentUser?.role === 'PLATFORM_OPS' ? 'platform' : 'pharmacy');
    }
  }, [isPharmacyUser, currentUser]);

  // Search & Geolocation State
  const [searchQuery, setSearchQuery] = useState(() => pageFromPath(window.location.pathname) === 'medicines' ? '' : 'Paracetamol');
  const [location, setLocation] = useState({ lat: 5.6037, lng: -0.1870, name: 'Accra, Greater Accra' });
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Cart
  const [cart, setCart] = useState({
    pharmacyId: null,
    pharmacyName: null,
    fulfillmentType: 'PICKUP',
    items: [],
    customerNote: '',
    deliveryAddress: 'Accra, Greater Accra',
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Modals
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerRole, setRegisterRole] = useState('CUSTOMER'); // 'CUSTOMER' | 'PHARMACY_ADMIN'
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMyOrdersOpen, setIsMyOrdersOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isPhysicalStockModalOpen, setIsPhysicalStockModalOpen] = useState(false);
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState(false);
  const [isPosModalOpen, setIsPosModalOpen] = useState(false);
  const [isRxModalOpen, setIsRxModalOpen] = useState(false);

  // Custom location search input inside location modal
  const [customCitySearch, setCustomCitySearch] = useState('');

  // Data history
  const [myOrders, setMyOrders] = useState([]);
  const [myNotifications, setMyNotifications] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [pharmacyOrders, setPharmacyOrders] = useState([]);
  const [pharmacyOrderSearch, setPharmacyOrderSearch] = useState('');
  const [pharmacyInventory, setPharmacyInventory] = useState([]);
  const [pendingPrescriptions, setPendingPrescriptions] = useState([]);
  const [platformPharmacies, setPlatformPharmacies] = useState([]);
  const [platformAuditEvents, setPlatformAuditEvents] = useState([]);
  const [platformLoading, setPlatformLoading] = useState(false);
  
  // Forms state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Patient Registration Form
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Pharmacy Registration Form
  const [regPharmName, setRegPharmName] = useState('');
  const [regPharmLicense, setRegPharmLicense] = useState('');
  const [regPharmAddress, setRegPharmAddress] = useState('');

  // Physical Stock Form
  const [selectedStockMedId, setSelectedStockMedId] = useState('');
  const [physicalQty, setPhysicalQty] = useState(50);
  const [physicalUnitPrice, setPhysicalUnitPrice] = useState(12.50);

  // CSV Import & File Upload Form
  const [csvContent, setCsvContent] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [prescriptionFile, setPrescriptionFile] = useState(null);

  // POS Sync Form
  const [posTerminalId, setPosTerminalId] = useState('POS-TERMINAL-01');

  // Toast Banners
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Load Pharmacy Operations Data
  const loadPharmacyData = useCallback(async (token = currentToken) => {
    if (!token) return;
    try {
      const ordersRes = await fetch('/v1/pharmacy/orders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const ordersData = await ordersRes.json();
      if (ordersRes.ok && ordersData.data) setPharmacyOrders(ordersData.data);

      const invRes = await fetch('/v1/inventory', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const invData = await invRes.json();
      if (invRes.ok && invData.data) setPharmacyInventory(invData.data);

      const rxRes = await fetch('/v1/prescriptions/pending', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const rxData = await rxRes.json();
      if (rxRes.ok && rxData.data) setPendingPrescriptions(rxData.data);

      const meRes = await fetch('/v1/pharmacies/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const meData = await meRes.json();
      if (meRes.ok && meData.data) setPharmacyData(meData.data);

    } catch (err) {
      console.error('Failed to load pharmacy portal data:', err);
    }
  }, [currentToken]);

  const loadPlatformData = useCallback(async (token = currentToken) => {
    if (!token || currentUser?.role !== 'PLATFORM_OPS') return;
    setPlatformLoading(true);
    try {
      const res = await fetch('/v1/platform/pharmacies', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Could not load pharmacy network.');
      setPlatformPharmacies(data.data);
      const auditRes = await fetch('/v1/platform/audit?limit=30', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const auditData = await auditRes.json();
      if (!auditRes.ok || !auditData.data) throw new Error(auditData.error?.message || 'Could not load platform audit activity.');
      setPlatformAuditEvents(auditData.data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPlatformLoading(false);
    }
  }, [currentToken, currentUser, showToast]);

  useEffect(() => {
    if (!currentToken) {
      setAuthRestoring(false);
      return;
    }

    let cancelled = false;
    const restoreSession = async () => {
      try {
        const res = await fetch('/v1/auth/me', {
          headers: { 'Authorization': `Bearer ${currentToken}` },
        });
        const data = await res.json();
        if (!res.ok || !data.data) throw new Error('Session expired.');
        if (!cancelled) {
          setCurrentUser(data.data.user);
          setPharmacyData(data.data.pharmacy || null);
          const currentPath = window.location.pathname;
          if (data.data.user.role === 'PLATFORM_OPS') {
            setActivePortal('platform');
            if (currentPath.startsWith('/platform/')) {
              setActiveAdminPage(adminPageFromPath(currentPath, 'platform'));
            } else {
              setActiveAdminPage('network');
            }
          } else if (
            ['PHARMACY_ADMIN', 'PHARMACY_STAFF'].includes(data.data.user.role)
            && data.data.pharmacy?.verification_status === 'VERIFIED'
          ) {
            setActivePortal('pharmacy');
            if (currentPath.startsWith('/pharmacy/')) {
              setActiveAdminPage(adminPageFromPath(currentPath, 'pharmacy'));
            } else {
              setActiveAdminPage('overview');
            }
            loadPharmacyData(currentToken);
          } else {
            setActivePortal('customer');
            setActivePage(pageFromPath(currentPath));
          }
        }
      } catch {
        if (!cancelled) {
          try {
            window.localStorage.removeItem('pharmalink-auth-token');
            window.localStorage.removeItem('pharmalink-user');
            window.localStorage.removeItem('pharmalink-pharmacy');
          } catch {}
          setCurrentToken(null);
          setCurrentUser(null);
          setPharmacyData(null);
        }
      } finally {
        if (!cancelled) setAuthRestoring(false);
      }
    };
    restoreSession();
    return () => { cancelled = true; };
  }, [currentToken, loadPharmacyData]);

  const saveBrowserNotificationPreference = useCallback(async (enabled) => {
    if (!currentToken) return;
    if (enabled) {
      if (!('Notification' in window)) {
        showToast('Browser notifications are not supported here. In-app notifications remain enabled.', 'info');
        return;
      }
      const permission = window.Notification.permission === 'granted'
        ? 'granted'
        : await window.Notification.requestPermission();
      if (permission !== 'granted') {
        showToast('Browser notification permission was not granted. In-app notifications remain enabled.', 'info');
        return;
      }
    }
    try {
      const res = await fetch('/v1/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ browser_push_enabled: enabled }),
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Could not save notification preference.');
      setBrowserNotificationsEnabled(data.data.browser_push_enabled);
      showToast(enabled
        ? 'Browser notification preference saved. Push delivery will be available when enabled by PharmaLink.'
        : 'Browser notification preference disabled. In-app notifications remain enabled.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [currentToken, showToast]);

  useEffect(() => {
    if (!currentToken || currentUser?.role !== 'CUSTOMER') {
      setBrowserNotificationsEnabled(false);
      return;
    }
    let cancelled = false;
    fetch('/v1/notifications/preferences', {
      headers: { 'Authorization': `Bearer ${currentToken}` },
    }).then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok || !data.data) throw new Error(data.error?.message || 'Could not load notification preference.');
        if (!cancelled) setBrowserNotificationsEnabled(data.data.browser_push_enabled);
      })
      .catch((err) => console.error('Failed to load notification preference:', err));
    return () => { cancelled = true; };
  }, [currentToken, currentUser?.id, currentUser?.role]);

  const fetchNotifications = useCallback(async () => {
    if (!currentToken) return;
    try {
      const res = await fetch('/v1/notifications', {
        headers: { 'Authorization': `Bearer ${currentToken}` },
      });
      const data = await res.json();
      if (res.ok && data.data) setMyNotifications(data.data);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, [currentToken]);

  const markNotificationAsRead = useCallback(async (notificationId) => {
    if (!currentToken) return;
    try {
      const res = await fetch(`/v1/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${currentToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Could not mark notification as read.');
      setMyNotifications((previous) => previous.map((notification) =>
        notification.id === notificationId ? data.data : notification
      ));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [currentToken, showToast]);

  useEffect(() => {
    if (currentUser && activePortal === 'customer') {
      fetchNotifications();
    }
  }, [activePortal, currentUser, fetchNotifications]);

  const navigateTo = useCallback((page) => {
    const path = pagePaths[page] || pagePaths.home;
    window.history.pushState({}, '', path);
    setActivePage(page);
    setActivePortal('customer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateAdminPage = useCallback((portal, page) => {
    const path = `/${portal}/${page}`;
    window.history.pushState({}, '', path);
    setActivePortal(portal);
    setActiveAdminPage(page);
    if (portal === 'pharmacy' && ['orders', 'inventory', 'prescriptions'].includes(page)) {
      setActivePharmTab(page);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const handleBrowserNavigation = () => {
      const pathname = window.location.pathname;
      if (pathname.startsWith('/platform/')) {
        setActivePortal('platform');
        setActiveAdminPage(adminPageFromPath(pathname, 'platform'));
      } else if (pathname.startsWith('/pharmacy/')) {
        const page = adminPageFromPath(pathname, 'pharmacy');
        setActivePortal('pharmacy');
        setActiveAdminPage(page);
        if (['orders', 'inventory', 'prescriptions'].includes(page)) setActivePharmTab(page);
      } else {
        setActivePage(pageFromPath(pathname));
        setActivePortal('customer');
      }
    };
    window.addEventListener('popstate', handleBrowserNavigation);
    return () => window.removeEventListener('popstate', handleBrowserNavigation);
  }, []);

  // Geolocation Access Handler (Browser Location API)
  const requestGeoLocation = useCallback(() => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', 'error');
      return;
    }
    showToast('Detecting GPS location for nearest pharmacy proximity matching in Ghana...', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lng = Number(pos.coords.longitude.toFixed(4));
        setLocation({
          lat,
          lng,
          name: getNearestCityName(lat, lng)
        });
        showToast(`📍 Proximity updated near ${getNearestCityName(lat, lng)}.`, 'success');
        setIsLocationModalOpen(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        showToast(`Could not access GPS (${err.message}). Select your region or city in Ghana.`, 'info');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [showToast]);

  // Auto-detect location on initial load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(4));
          const lng = Number(pos.coords.longitude.toFixed(4));
          setLocation({
            lat,
            lng,
            name: getNearestCityName(lat, lng)
          });
        },
        () => {},
        { timeout: 5000 }
      );
    }
  }, []);

  // Perform Search
  const performSearch = useCallback(async (query = searchQuery) => {
    setIsSearching(true);
    try {
      const resultLimit = activePage === 'medicines' ? 100 : 20;
      const url = `/v1/medicines/search?q=${encodeURIComponent(query)}&latitude=${location.lat}&longitude=${location.lng}&limit=${resultLimit}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.data) {
        setSearchResults(data.data || []);
      }
    } catch (err) {
      showToast('Search request failed', 'error');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, location, activePage, showToast]);

  useEffect(() => {
    performSearch(searchQuery);
  }, [searchQuery, location.lat, location.lng, activePage]);

  // Handle Sign In (Login)
  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword })
      });
      const data = await res.json();
      
      if (!res.ok || !data.data) {
        throw new Error(data.error?.message || 'Invalid email/phone or password');
      }

      setCurrentUser(data.data.user);
      setCurrentToken(data.data.token);
      setPharmacyData(data.data.pharmacy || null);
      setIsLoginOpen(false);

      if ((data.data.user.role === 'PHARMACY_ADMIN' || data.data.user.role === 'PHARMACY_STAFF' || data.data.user.role === 'PLATFORM_OPS')
        && (data.data.user.role === 'PLATFORM_OPS' || data.data.pharmacy?.verification_status === 'VERIFIED')) {
        const portal = data.data.user.role === 'PLATFORM_OPS' ? 'platform' : 'pharmacy';
        setActivePortal(portal);
        setActiveAdminPage(portal === 'platform' ? 'network' : 'overview');
        window.history.replaceState({}, '', `/${portal}/${portal === 'platform' ? 'network' : 'overview'}`);
        showToast(`Welcome to ${data.data.user.role === 'PLATFORM_OPS' ? 'Platform Operations' : 'Pharmacy Operations'}, ${data.data.user.first_name}!`, 'success');
        if (data.data.user.role !== 'PLATFORM_OPS') loadPharmacyData(data.data.token);
      } else if (data.data.user.role === 'PHARMACY_ADMIN' || data.data.user.role === 'PHARMACY_STAFF') {
        setActivePortal('customer');
        showToast('Your pharmacy application is pending verification. Pharmacy operations are unavailable until approval.', 'info');
      } else {
        setActivePortal('customer');
        showToast(`Welcome back, ${data.data.user.first_name}!`, 'success');
      }
    } catch (err) {
      setAuthError(err.message);
      showToast(err.message, 'error');
    }
  };

  // Handle Create Account (Registration)
  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');

    if (!regFirstName || !regEmail || !regPassword) {
      showToast('Please fill in all required registration fields.', 'error');
      return;
    }

    try {
      const userRes = await fetch('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: regFirstName,
          last_name: regLastName,
          email: regEmail,
          phone: regPhone,
          password: regPassword,
          role: 'CUSTOMER'
        })
      });
      const userData = await userRes.json();
      if (!userRes.ok || !userData.data) {
        throw new Error(userData.error?.message || 'Registration failed');
      }

      const token = userData.data.token;
      let createdPharmacy = null;

      if (registerRole === 'PHARMACY_ADMIN') {
        const pharmRes = await fetch('/v1/pharmacies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            legal_name: `${regPharmName || regFirstName + ' Pharmacy'} Ltd`,
            display_name: regPharmName || `${regFirstName} Pharmacy`,
            license_number: regPharmLicense || `FDA-PH-2024-${Math.floor(1000 + Math.random() * 9000)}`,
            address_line: regPharmAddress || location.name,
            city: location.name.split(',')[0] || 'Accra',
            region: 'Ghana',
            latitude: location.lat,
            longitude: location.lng,
            phone: regPhone || '+233302111222',
            email: regEmail,
          })
        });
        const pharmData = await pharmRes.json();
        if (pharmRes.ok && pharmData.data) {
          createdPharmacy = pharmData.data;
        }
      }

      const loginRes = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: regEmail, password: regPassword })
      });
      const loginData = await loginRes.json();
      if (loginRes.ok && loginData.data) {
        setCurrentUser(loginData.data.user);
        setCurrentToken(loginData.data.token);
        setPharmacyData(loginData.data.pharmacy || createdPharmacy || null);
      } else {
        setCurrentUser(userData.data.user);
        setCurrentToken(userData.data.token);
      }

      setIsRegisterOpen(false);
      
      if (registerRole === 'PHARMACY_ADMIN') {
        setActivePortal('customer');
        showToast('Pharmacy application submitted and is pending platform verification. You can use the customer account while it is reviewed.', 'info');
      } else {
        setActivePortal('customer');
        showToast(`Account created! Welcome to PharmaLink, ${regFirstName}!`, 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const updatePlatformPharmacyStatus = useCallback(async (pharmacy, status) => {
    if (!currentToken) return;
    const action = status === 'VERIFIED' ? 'approve' : status === 'REJECTED' ? 'reject' : 'suspend';
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${pharmacy.display_name}?`)) return;
    try {
      const res = await fetch(`/v1/platform/pharmacies/${pharmacy.id}/verification`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ verification_status: status }),
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Could not update pharmacy verification status.');
      showToast(`${pharmacy.display_name} is now ${status.toLowerCase()}.`, 'success');
      await loadPlatformData(currentToken);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [currentToken, loadPlatformData, showToast]);

  const reviewPrescription = useCallback(async (prescriptionId, status) => {
    if (!currentToken) return;
    try {
      const res = await fetch(`/v1/prescriptions/${prescriptionId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Prescription review failed.');
      setPendingPrescriptions((previous) => previous.filter((item) => item.id !== prescriptionId));
      showToast(
        status === 'CLARIFICATION_REQUIRED'
          ? 'Clarification requested. The customer will see an in-app notification.'
          : `Prescription ${status.toLowerCase().replace('_', ' ')}.`,
        'success'
      );
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [currentToken, showToast]);

  const viewPrescriptionFile = useCallback(async (prescriptionId) => {
    if (!currentToken) return;
    try {
      const res = await fetch(`/v1/prescriptions/${prescriptionId}/file`, {
        headers: { 'Authorization': `Bearer ${currentToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Prescription file could not be opened.');
      }
      const fileUrl = URL.createObjectURL(await res.blob());
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [currentToken, showToast]);

  useEffect(() => {
    if (activePortal === 'pharmacy' && currentToken && currentUser?.role !== 'PLATFORM_OPS') {
      loadPharmacyData(currentToken);
    }
    if (activePortal === 'platform' && currentToken && currentUser?.role === 'PLATFORM_OPS') {
      loadPlatformData(currentToken);
    }
  }, [activePortal, currentToken, currentUser, loadPharmacyData, loadPlatformData]);

  // Cart Management
  const addToCart = (resultItem) => {
    const pharmId = resultItem.pharmacy.id;
    const pharmName = resultItem.pharmacy.display_name;

    if (cart.pharmacyId && cart.pharmacyId !== pharmId && cart.items.length > 0) {
      if (!confirm(`Your cart has items from another pharmacy (${cart.pharmacyName}). Clear cart to add from ${pharmName}?`)) {
        return;
      }
      setCart({
        pharmacyId: pharmId,
        pharmacyName: pharmName,
        fulfillmentType: 'PICKUP',
        items: [{
          medicine: resultItem.medicine,
          pharmacy_id: pharmId,
          quantity: 1,
          price: resultItem.price,
          fulfillment_options: resultItem.pharmacy.fulfillment_options || {},
        }],
        customerNote: '',
        deliveryAddress: location.name,
      });
      showToast(`Cart updated with items from ${pharmName}`, 'info');
      return;
    }

    setCart((prev) => {
      const existing = prev.items.find((i) => i.medicine.id === resultItem.medicine.id);
      let updatedItems;
      if (existing) {
        updatedItems = prev.items.map((i) =>
          i.medicine.id === resultItem.medicine.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      } else {
        updatedItems = [...prev.items, {
          medicine: resultItem.medicine,
          pharmacy_id: pharmId,
          quantity: 1,
          price: resultItem.price,
          fulfillment_options: resultItem.pharmacy.fulfillment_options || {},
        }];
      }
      return {
        ...prev,
        pharmacyId: pharmId,
        pharmacyName: pharmName,
        items: updatedItems,
      };
    });
    showToast(`Added ${resultItem.medicine.generic_name} to cart`, 'success');
  };

  const updateCartQty = (medId, delta) => {
    setCart((prev) => {
      const updated = prev.items
        .map((i) => (i.medicine.id === medId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0);
      return { ...prev, items: updated };
    });
  };

  const handlePrescriptionFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Prescription files must be 5 MB or smaller.', 'error');
      event.target.value = '';
      return;
    }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      showToast('Upload a PDF, JPG, or PNG prescription.', 'error');
      event.target.value = '';
      return;
    }
    setPrescriptionFile(file);
    showToast(`Prescription file "${file.name}" attached.`, 'success');
  };

  const handleReplacementPrescriptionUpload = async (orderId, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !currentToken) return;

    const formData = new FormData();
    formData.append('order_id', orderId);
    formData.append('file', file);

    try {
      const res = await fetch('/v1/prescriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.data) {
        throw new Error(data.error?.message || 'Could not upload the replacement prescription.');
      }
      showToast('Replacement prescription uploaded for pharmacist review.', 'success');
      await fetchMyOrders();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Submit Order
  const handleCheckout = async () => {
    if (!currentToken) {
      setIsCartOpen(false);
      setIsLoginOpen(true);
      showToast('Please sign in to place your order', 'info');
      return;
    }

    if (cart.items.length === 0) return;
    const prescriptionItems = cart.items.filter((item) => item.medicine.prescription_required);
    const hasPrescription = prescriptionItems.length > 0;
    if (hasPrescription && !prescriptionFile) {
      const prescriptionNames = prescriptionItems.map((item) => item.medicine.generic_name).join(', ');
      showToast(`Attach a prescription for: ${prescriptionNames}.`, 'error');
      return;
    }

    try {
      const res = await fetch('/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({
          pharmacy_id: cart.pharmacyId,
          fulfillment_type: cart.fulfillmentType,
          customer_note: cart.customerNote,
          delivery_address: cart.fulfillmentType === 'DELIVERY' ? cart.deliveryAddress : undefined,
          items: cart.items.map((i) => ({ medicine_id: i.medicine.id, quantity: i.quantity }))
        })
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Failed to submit order');

      if (hasPrescription) {
        const formData = new FormData();
        formData.append('order_id', data.data.id);
        formData.append('file', prescriptionFile);
        const uploadRes = await fetch('/v1/prescriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentToken}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.data) {
          throw new Error(uploadData.error?.message || 'Order created, but prescription upload failed. Contact support.');
        }
      }

      showToast(`Order #${data.data.id.substring(0, 8)} placed successfully!`, 'success');
      setCart({ pharmacyId: null, pharmacyName: null, fulfillmentType: 'PICKUP', items: [], customerNote: '', deliveryAddress: location.name });
      setPrescriptionFile(null);
      setIsCartOpen(false);
      fetchMyOrders();
      setIsMyOrdersOpen(true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Fetch Customer Orders
  const fetchMyOrders = async () => {
    if (!currentToken) return;
    setOrdersLoading(true);
    setOrdersError('');
    try {
      const res = await fetch('/v1/orders', {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Could not load your orders.');
      setMyOrders(data.data);

      const notificationsRes = await fetch('/v1/notifications', {
        headers: { 'Authorization': `Bearer ${currentToken}` },
      });
      const notificationsData = await notificationsRes.json();
      if (notificationsRes.ok && notificationsData.data) {
        setMyNotifications(notificationsData.data);
      }
    } catch (err) {
      setOrdersError(err.message);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Pharmacy Actions: Accept Order
  const handleAcceptOrder = async (orderId) => {
    try {
      const res = await fetch(`/v1/pharmacy/orders/${orderId}/accept`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Accept order failed');

      showToast(`Order accepted & stock reserved atomically!`, 'success');
      loadPharmacyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Pharmacy Actions: Reject Order
  const handleRejectOrder = async (orderId) => {
    const reason = prompt('Reason for rejecting order:', 'Out of physical stock');
    if (!reason) return;
    try {
      const res = await fetch(`/v1/pharmacy/orders/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({ rejection_reason: reason })
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Reject order failed');

      showToast(`Order rejected & stock reservation released.`, 'info');
      loadPharmacyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Pharmacy Actions: Update Fulfillment Status (Counter Pickup Dispensing / Delivery)
  const handleUpdateOrderStatus = async (orderId, targetStatus) => {
    try {
      const res = await fetch(`/v1/pharmacy/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({ status: targetStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Failed to update order status');

      if (targetStatus === 'COMPLETED') {
        showToast(`Order #${orderId.substring(0, 8)} confirmed dispensed & physical stock deducted!`, 'success');
      } else if (targetStatus === 'READY') {
        showToast(`Order #${orderId.substring(0, 8)} marked ready for counter pickup!`, 'success');
      } else if (targetStatus === 'OUT_FOR_DELIVERY') {
        showToast(`Order #${orderId.substring(0, 8)} dispatched for delivery!`, 'info');
      } else {
        showToast(`Order status updated to ${targetStatus}`, 'info');
      }
      loadPharmacyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Physical Stock Confirmation Submission
  const handleConfirmPhysicalStock = async (e) => {
    e.preventDefault();
    if (!selectedStockMedId) {
      showToast('Please select a medicine', 'error');
      return;
    }
    try {
      const res = await fetch('/v1/inventory/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({
          medicine_id: selectedStockMedId,
          physical_quantity: Number(physicalQty),
          unit_price_minor: Math.round(Number(physicalUnitPrice) * 100),
          note: 'Physical count verified on shelf'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Update stock failed');

      showToast(`Stock updated to ${physicalQty} units (State: VERIFIED)`, 'success');
      setIsPhysicalStockModalOpen(false);
      loadPharmacyData();
      performSearch(searchQuery);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // File Upload Handler for CSV
  const handleCsvFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === 'string') {
        setCsvContent(text);
        showToast(`Loaded ${file.name} (${Math.round(file.size / 1024)} KB)`, 'success');
      }
    };
    reader.readAsText(file);
  };

  // CSV Import Submission
  const handleCsvImport = async (e) => {
    e.preventDefault();
    if (!csvContent || csvContent.trim() === '') {
      showToast('Please upload or paste CSV content first', 'error');
      return;
    }
    try {
      const res = await fetch('/v1/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({ csv_content: csvContent })
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'CSV Import failed');

      showToast(`CSV Import Completed: ${data.data.records_accepted} accepted, ${data.data.records_rejected} rejected`, 'success');
      setIsCsvImportModalOpen(false);
      setCsvContent('');
      setUploadedFileName('');
      loadPharmacyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Cart total calculations
  const cartSubtotal = useMemo(() => {
    return cart.items.reduce((sum, item) => sum + (item.price.unit_price_minor / 100) * item.quantity, 0);
  }, [cart.items]);

  const prescriptionItems = cart.items.filter((item) => item.medicine.prescription_required);
  const cartFulfillmentOptions = cart.items[0]?.fulfillment_options || {};
  const deliveryFee = cart.fulfillmentType === 'DELIVERY'
    ? Number(cartFulfillmentOptions.delivery_base_fee_minor || 0) / 100
    : 0;
  const cartTotal = cartSubtotal + deliveryFee;

  // Filtered city list in modal
  const filteredGhanaCities = useMemo(() => {
    if (!customCitySearch.trim()) return GHANA_CITIES;
    return GHANA_CITIES.filter((c) => c.name.toLowerCase().includes(customCitySearch.toLowerCase().trim()));
  }, [customCitySearch]);

  return (
    <div className="flex min-h-screen flex-col">
      
      {/* INITIAL INTRO SPLASH SCENE */}
      {showSplash && (
        <div className="splash-screen" role="status" aria-label="PharmaLink Intro Scene">
          <div className="splash-video-wrapper">
            <video
              className="splash-video"
              src="/PharmaLink_pill_fusing_with_cross_20260929114108.mp4"
              autoPlay
              muted
              playsInline
              onEnded={dismissSplash}
            />
            <div className="splash-video-overlay" />
            <div className="splash-top-bar">
              <div className="splash-pill-badge">
                <span className="splash-live-dot" />
                <span>PharmaLink Intro</span>
              </div>
              <button
                type="button"
                className="splash-skip-btn"
                onClick={dismissSplash}
                aria-label="Skip Intro Video"
              >
                Skip Intro ➔
              </button>
            </div>
            <div className="splash-bottom-bar">
              <div className="splash-brand-text">
                <h2>PHARMALINK</h2>
                <span>DIGITAL HEALTHCARE NETWORK</span>
              </div>
              <div className="splash-loader-bar">
                <div className="splash-loader-progress" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER & NAVBAR */}
      {activePortal === 'customer' ? (
      <header className="navbar">
        <div className="navbar-container">
          <div className="brand-wrapper clickable" onClick={() => navigateTo('home')}>
            <div className="brand-logo-badge">
              <img src="/logo.png" alt="PharmaLink Logo" className="brand-logo-img" />
            </div>
            <span>PharmaLink</span>
          </div>

          <nav className="nav-links">
            <button className={activePage === 'home' && activePortal === 'customer' ? 'active' : ''} onClick={() => navigateTo('home')}>Home</button>
            <button className={activePage === 'medicines' && activePortal === 'customer' ? 'active' : ''} onClick={() => navigateTo('medicines')}>Medicines</button>
            <button className={activePage === 'prescriptions' && activePortal === 'customer' ? 'active' : ''} onClick={() => navigateTo('prescriptions')}>Prescriptions</button>
            <button className={activePage === 'pharmacies' && activePortal === 'customer' ? 'active' : ''} onClick={() => navigateTo('pharmacies')}>Pharmacies</button>
            <button className={activePage === 'howItWorks' && activePortal === 'customer' ? 'active' : ''} onClick={() => navigateTo('howItWorks')}>How it works</button>
          </nav>

          <div className="nav-actions">
            {/* Pharmacy Portal Toggle Pill (if role authorized) */}
            {isPharmacyUser && (
              <button
                className={`btn btn-sm ${activePortal !== 'customer' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setActivePortal((prev) => (prev === 'customer' ? (currentUser?.role === 'PLATFORM_OPS' ? 'platform' : 'pharmacy') : 'customer'))}
                title="Toggle between Patient View and Pharmacy Management Portal"
              >
                {activePortal !== 'customer'
                  ? (currentUser?.role === 'PLATFORM_OPS' ? '🛡️ Platform Operations' : '🏥 Pharmacy Operations')
                  : (currentUser?.role === 'PLATFORM_OPS' ? 'Switch to Platform Ops' : 'Switch to Ops Portal')}
              </button>
            )}

            {/* Theme Switcher */}
            <button
              className="theme-toggle"
              type="button"
              onClick={() => setIsDarkMode((enabled) => !enabled)}
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span aria-hidden="true">{isDarkMode ? '☀️' : '🌙'}</span>
            </button>

            {/* Location Selector Pill */}
            <button
              className="location-pill clickable"
              onClick={() => setIsLocationModalOpen(true)}
              title="Click to change location or detect GPS anywhere in Ghana"
            >
              <span>📍</span>
              <span style={{ fontWeight: 700 }}>{location.name.split(',')[0]}</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>✏️</span>
            </button>

            {/* Auth Actions */}
            {currentUser ? (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setIsMyOrdersOpen(true); fetchMyOrders(); }}
                  title="View your orders & counter pickup status"
                >
                  📋 Orders
                </button>
                <button
                  className="btn btn-secondary btn-sm notification-trigger"
                  onClick={() => { setIsNotificationsOpen(true); fetchNotifications(); }}
                  aria-label={`Open notifications${myNotifications.some((notification) => !notification.read_at) ? `, ${myNotifications.filter((notification) => !notification.read_at).length} unread` : ''}`}
                >
                  🔔
                  {myNotifications.some((notification) => !notification.read_at) && (
                    <span className="notification-badge">
                      {myNotifications.filter((notification) => !notification.read_at).length > 99
                        ? '99+'
                        : myNotifications.filter((notification) => !notification.read_at).length}
                    </span>
                  )}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setIsProfileOpen(true)}>
                  👤 {currentUser.first_name}
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setLoginIdentifier(''); setLoginPassword(''); setIsLoginOpen(true); }}>
                  Sign in
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => { setRegisterRole('CUSTOMER'); setIsRegisterOpen(true); }}>
                  Create account
                </button>
              </div>
            )}

            {/* Cart Button */}
            <button className="btn btn-secondary btn-sm" style={{ padding: '0.45rem 0.75rem' }} onClick={() => setIsCartOpen(true)}>
              🛍️ <span className="badge badge-verified" style={{ marginLeft: '4px' }}>{cart.items.reduce((sum, i) => sum + i.quantity, 0)}</span>
            </button>
          </div>
        </div>
      </header>
      ) : (
      <header className="admin-topbar">
        <div className="admin-topbar-brand">
          <div className="brand-logo-badge">
            <img src="/logo.png" alt="PharmaLink Logo" className="brand-logo-img" />
          </div>
          <div>
            <strong>PharmaLink</strong>
            <span>{activePortal === 'platform' ? 'Platform Operations' : 'Pharmacy Operations'}</span>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <span className="admin-user-label">👤 {currentUser?.first_name} {currentUser?.last_name || ''}</span>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setIsDarkMode((enabled) => !enabled)}
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span aria-hidden="true">{isDarkMode ? '☀️' : '🌙'}</span>
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => { window.history.pushState({}, '', '/'); setActivePage('home'); setActivePortal('customer'); }}>
            ← Customer view
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setIsProfileOpen(true)}>
            Account
          </button>
        </div>
      </header>
      )}

      {/* MAIN CONTENT CONTAINER */}
      <main style={{ flex: 1 }}>
        {activePortal === 'customer' ? (
          activePage === 'home' ? (
            <div>
              {/* HERO BENTO GRID */}
              <section className="container-page" style={{ paddingTop: '1.5rem' }}>
                <div className="hero-bento">
                  
                  {/* Main Hero Card with Animated Text Reveal */}
                  <div className="hero-main-card hero-twist-card">
                    <div>
                      <span className="hero-pill">
                        <span className="hero-dot"></span> Licensed Pharmacies Across Ghana
                      </span>
                      
                      {/* Animated Word-by-Word Hero Reveal */}
                      <HeroHeadlineReveal text="Medicine, from the pharmacy closest to you." />
                      
                      <p className="hero-description">
                        PharmaLink matches your search directly to verified dispensary stock and fast delivery near your location.
                      </p>

                      {/* Search Bar */}
                      <form className="hero-search-form" onSubmit={(e) => { e.preventDefault(); navigateTo('medicines'); performSearch(searchQuery); }}>
                        <span style={{ marginLeft: '0.75rem', fontSize: '1.2rem', color: 'var(--text-muted)' }}>🔍</span>
                        <input
                          className="hero-search-input"
                          placeholder="Search Paracetamol, Amoxicillin, Vitamin C, Coartem..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <button type="submit" className="btn btn-primary hero-search-btn">
                          {isSearching ? 'Searching...' : 'Search'}
                        </button>
                      </form>

                      {/* Quick Query Filter Chips */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', flexWrap: 'wrap', gap: '0.65rem' }}>
                        <div className="hero-query-chips">
                          {['Paracetamol', 'Amoxicillin', 'Coartem', 'Vitamin C', 'ORS', 'Cetirizine'].map((term) => (
                            <button
                              key={term}
                              className="query-chip"
                              onClick={() => {
                                setSearchQuery(term);
                                navigateTo('medicines');
                                performSearch(term);
                              }}
                            >
                              {term}
                            </button>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={requestGeoLocation}
                            style={{ fontSize: '0.78rem' }}
                          >
                            🎯 Detect GPS Proximity
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setIsLocationModalOpen(true)}
                            style={{ fontSize: '0.78rem' }}
                          >
                            📍 Change City
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Side Card 1: Verified Unsplash Photo Card with Twist */}
                  <div
                    className="hero-side-image hero-twist-image-card"
                    style={{ backgroundImage: `url('https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=800&q=80')` }}
                  >
                    <div className="hero-twist-image-overlay">
                      <div className="tag">Ghana-first Healthcare</div>
                      <div className="title">100% Authentic & FDA Verified</div>
                      <div className="subtitle">Dispensed exclusively by Pharmacy Council accredited partners.</div>
                    </div>
                  </div>

                  {/* Side Card 2: Upload Prescription */}
                  <div className="hero-rx-card">
                    <div className="rx-icon-badge">📄</div>
                    <div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.75rem' }}>Upload doctor's prescription</h3>
                      <p style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '0.25rem', lineHeight: 1.5 }}>Snap a photo, get verified by a pharmacist, receive express delivery.</p>
                    </div>
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: '1rem', width: 'fit-content' }} onClick={() => setIsRxModalOpen(true)}>
                      Upload Rx now →
                    </button>
                  </div>

                </div>

                {/* STATS COUNTER BANNER */}
                <div className="stats-banner">
                  <div className="stat-item">
                    <div className="stat-number">120+</div>
                    <div className="stat-label">Partner Pharmacies</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-number">8,400+</div>
                    <div className="stat-label">Verified Medicines</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-number">&lt; 60 min</div>
                    <div className="stat-label">Average Delivery</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-number">16 Regions</div>
                    <div className="stat-label">Nationwide Coverage</div>
                  </div>
                </div>
              </section>

              {/* SHOP BY CATEGORY SECTION */}
              <section className="container-page" style={{ marginTop: '3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h2 className="section-title">Shop by Category</h2>
                    <p className="section-sub">Browse essential treatments and wellness categories in Ghana.</p>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => { setSearchQuery(''); navigateTo('medicines'); performSearch(''); }}>Browse all medicines →</button>
                </div>

                <div className="categories-grid">
                  {[
                    { emoji: '🩹', name: 'Pain Relief', count: '142 items', q: 'Paracetamol' },
                    { emoji: '💊', name: 'Antibiotics', count: '64 items', q: 'Amoxicillin' },
                    { emoji: '🦟', name: 'Antimalarials', count: '52 items', q: 'Coartem' },
                    { emoji: '🍊', name: 'Vitamins', count: '218 items', q: 'Vitamin C' },
                    { emoji: '🍼', name: 'Baby Care', count: '96 items', q: 'Calpol' },
                    { emoji: '🌸', name: "Women's Health", count: '78 items', q: 'Iron' },
                    { emoji: '✨', name: 'Allergy Care', count: '85 items', q: 'Cetirizine' },
                    { emoji: '➕', name: 'First Aid', count: '41 items', q: 'Bandage' },
                  ].map((cat, idx) => (
                    <div
                      key={idx}
                      className="category-card clickable"
                      onClick={() => {
                        setSearchQuery(cat.q);
                        navigateTo('medicines');
                        performSearch(cat.q);
                      }}
                    >
                      <span className="category-emoji">{cat.emoji}</span>
                      <span className="category-name">{cat.name}</span>
                      <span className="category-count">{cat.count}</span>
                    </div>
                  ))}
                </div>
              </section>



              {/* AVAILABLE MEDICINES MATCHED NEAR YOU */}
              <section className="container-page" style={{ marginTop: '3.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h2 className="section-title">Verified Medicines Near You</h2>
                    <p className="section-sub">Live stock signals matched to partner pharmacies closest to {location.name}.</p>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => performSearch(searchQuery)}>🔄 Refresh Stock</button>
                </div>

                <div className="products-grid">
                  {searchResults.map((item, idx) => {
                    const isVerified = item.availability_state === 'VERIFIED';
                    const isLikely = item.availability_state === 'LIKELY';
                    const badgeClass = isVerified ? 'badge-verified' : isLikely ? 'badge-likely' : 'badge-uncertain';
                    const requiresRx = item.medicine.prescription_required;
                    const inCartQty = cart.items.find((i) =>
                      i.medicine.id === item.medicine.id
                      && i.pharmacy_id === item.pharmacy.id
                    )?.quantity || 0;

                    return (
                      <div key={idx} className="product-card">
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                            <span className={`badge ${badgeClass}`}>
                              {isVerified ? '✓ Verified' : '⚡ Likely'}
                            </span>
                            <span className={`badge ${requiresRx ? 'badge-rx' : 'badge-otc'}`}>
                              {requiresRx ? 'Rx Required' : 'OTC'}
                            </span>
                          </div>

                          <h3 className="product-card-title">{item.medicine.brand_name || item.medicine.generic_name}</h3>
                          <p className="product-card-generic">{item.medicine.generic_name} • {item.medicine.formulation}</p>

                          <div className="pharmacy-match-pill">
                            <div className="name">🏥 {item.pharmacy.display_name}</div>
                            <div className="meta">📍 {item.pharmacy.address_line} ({item.distance_km} km away)</div>
                            <div className="meta" style={{ color: 'var(--primary)', fontWeight: 700, marginTop: '3px' }}>
                              🕒 {item.freshness} • {item.customer_status || (isVerified ? 'Confirmed in stock' : 'Likely in stock')}
                            </div>
                          </div>
                        </div>

                        <div className="product-card-footer">
                          <div className="price-tag">{item.price.formatted}</div>
                          <button
                            className={`btn ${inCartQty > 0 ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                            onClick={() => addToCart(item)}
                          >
                            {inCartQty > 0 ? `In Cart (${inCartQty}) +` : '+ Add to Order'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* HOW IT WORKS */}
              <section className="container-page" style={{ marginTop: '4rem' }}>
                <h2 className="section-title">How PharmaLink Works</h2>
                <p className="section-sub">From online search to pharmacy pickup or home delivery in three simple steps.</p>

                <div className="steps-grid">
                  <div className="step-card">
                    <div className="step-icon-wrapper">
                      <div className="step-icon">🔍</div>
                      <div className="step-badge">Step 1</div>
                    </div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '1.25rem' }}>Search or upload Rx</h3>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: 1.6 }}>
                      Find medicines by brand, generic, or symptom — or upload a photo of your doctor's prescription during checkout.
                    </p>
                  </div>

                  <div className="step-card">
                    <div className="step-icon-wrapper">
                      <div className="step-icon">📍</div>
                      <div className="step-badge">Step 2</div>
                    </div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '1.25rem' }}>GPS proximity match</h3>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: 1.6 }}>
                      We match your order to the closest licensed partner with verified stock, guaranteeing authentic medicine.
                    </p>
                  </div>

                  <div className="step-card">
                    <div className="step-icon-wrapper">
                      <div className="step-icon">🚚</div>
                      <div className="step-badge">Step 3</div>
                    </div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '1.25rem' }}>Pickup or delivery</h3>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: 1.6 }}>
                      Pick up at the counter with no wait time or receive temperature-controlled same-day doorstep delivery.
                    </p>
                  </div>
                </div>
              </section>

              {/* TRUST & ACCREDITATION BANNER */}
              <section className="container-page" style={{ marginTop: '3.5rem' }}>
                <div className="trust-banner">
                  <div className="trust-item">
                    <div className="trust-icon">🛡️</div>
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: '1rem' }}>Pharmacy Council Licensed</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Every partner pharmacy is regulated and inspected.</p>
                    </div>
                  </div>

                  <div className="trust-item">
                    <div className="trust-icon">🚚</div>
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: '1rem' }}>Cold-chain Ready</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Temperature-sensitive insulins and vaccines handled safely.</p>
                    </div>
                  </div>

                  <div className="trust-item">
                    <div className="trust-icon">🕒</div>
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: '1rem' }}>Same-Day Delivery</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Across Accra, Kumasi, Takoradi, Tema, and beyond.</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : activePage === 'medicines' ? (
            <MedicineCatalogPage
              searchResults={searchResults}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onSearch={performSearch}
              onAddToCart={addToCart}
              location={location}
              isSearching={isSearching}
              cartItems={cart.items}
            />
          ) : activePage === 'pharmacies' ? (
            <PharmaciesPage
              searchResults={searchResults}
              location={location}
              onBrowseMedicines={() => navigateTo('medicines')}
            />
          ) : activePage === 'howItWorks' ? (
            <HowItWorksPage onBrowseMedicines={() => navigateTo('medicines')} />
          ) : (
            <PrescriptionsPage
              currentUser={currentUser}
              onBrowseMedicines={() => navigateTo('medicines')}
              onSignIn={() => setIsLoginOpen(true)}
            />
          )
        ) : (
          <div className="admin-shell">
            <aside className="admin-sidebar">
              <div className="admin-sidebar-heading">
                <span>{activePortal === 'platform' ? 'Platform workspace' : pharmacyData?.display_name || 'Pharmacy workspace'}</span>
              </div>
              {activePortal === 'platform' ? (
                <>
                  <button className={activeAdminPage === 'network' ? 'active' : ''} onClick={() => navigateAdminPage('platform', 'network')}>▦ Pharmacy network</button>
                  <button className={activeAdminPage === 'verification' ? 'active' : ''} onClick={() => navigateAdminPage('platform', 'verification')}>✓ Verification queue</button>
                  <button className={activeAdminPage === 'analytics' ? 'active' : ''} onClick={() => navigateAdminPage('platform', 'analytics')}>◔ Analytics</button>
                  <button className={activeAdminPage === 'audit' ? 'active' : ''} onClick={() => navigateAdminPage('platform', 'audit')}>◫ Audit activity</button>
                </>
              ) : (
                <>
                  <button className={activeAdminPage === 'overview' ? 'active' : ''} onClick={() => navigateAdminPage('pharmacy', 'overview')}>▦ Overview</button>
                  <button className={activeAdminPage === 'orders' ? 'active' : ''} onClick={() => navigateAdminPage('pharmacy', 'orders')}>▤ Incoming orders</button>
                  <button className={activeAdminPage === 'inventory' ? 'active' : ''} onClick={() => navigateAdminPage('pharmacy', 'inventory')}>▥ Inventory</button>
                  <button className={activeAdminPage === 'prescriptions' ? 'active' : ''} onClick={() => navigateAdminPage('pharmacy', 'prescriptions')}>▧ Prescriptions</button>
                  <button className={activeAdminPage === 'settings' ? 'active' : ''} onClick={() => navigateAdminPage('pharmacy', 'settings')}>⚙ Settings</button>
                  <button onClick={() => setIsPhysicalStockModalOpen(true)}>＋ Stock check</button>
                  <button onClick={() => setIsCsvImportModalOpen(true)}>⇧ CSV import</button>
                </>
              )}
            </aside>
            <div className="admin-content">
            {activePortal === 'platform' ? (
              <PlatformOperationsDashboard
                pharmacies={platformPharmacies}
                auditEvents={platformAuditEvents}
                isLoading={platformLoading}
                activeFilter={platformFilter}
                setActiveFilter={setPlatformFilter}
                onRefresh={() => loadPlatformData()}
                onVerificationChange={updatePlatformPharmacyStatus}
                activePage={activeAdminPage}
              />
            ) : activeAdminPage === 'settings' ? (
              <PharmacySettingsPage
                pharmacyData={pharmacyData}
                currentToken={currentToken}
                onPharmacyUpdated={(updated) => {
                  setPharmacyData(updated);
                  loadPharmacyData();
                }}
                onOpenCsvImport={() => setIsCsvImportModalOpen(true)}
                showToast={showToast}
              />
            ) : (
          /* PHARMACY OPERATIONS & DISPENSARY DASHBOARD */
          <div className="container-page pharmacy-dashboard-content" style={{ paddingTop: '1.5rem' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-2xl)', padding: '2rem', marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
              <div>
                <span className="badge badge-verified" style={{ marginBottom: '0.5rem' }}>
                  {currentUser?.role === 'PLATFORM_OPS' ? '🛡️ Platform Operations Portal' : '🏥 Licensed Dispensary Dashboard'}
                </span>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 900 }}>
                  {pharmacyData?.display_name || 'East Legon Pharmacy Ltd'}
                </h2>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Dispensary Real-Time Stock & Order Fulfillment • License: {pharmacyData?.license_number || 'FDA-PH-2023-0101'}
                </p>
              </div>

              {currentUser?.role !== 'PLATFORM_OPS' && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setIsPhysicalStockModalOpen(true)}>
                    📋 Physical Count Check
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => setIsCsvImportModalOpen(true)}>
                    📁 Batch CSV Stock Upload
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => showToast('Live POS sync provider not configured. Use CSV import or shelf verification.', 'info')}>
                    ⚡ POS Sync
                  </button>
                </div>
              )}
            </div>

            <>
                {/* TAB NAVIGATION */}
                <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1.75rem', overflowX: 'auto' }}>
                  <button
                    className={`btn btn-sm ${activePharmTab === 'orders' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActivePharmTab('orders')}
                  >
                    Incoming Orders ({pharmacyOrders.length})
                  </button>
                  <button
                    className={`btn btn-sm ${activePharmTab === 'inventory' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActivePharmTab('inventory')}
                  >
                    Dispensary Inventory ({pharmacyInventory.length})
                  </button>
                  <button
                    className={`btn btn-sm ${activePharmTab === 'prescriptions' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActivePharmTab('prescriptions')}
                  >
                    Prescriptions Queue ({pendingPrescriptions.length})
                  </button>
                </div>

                {/* ORDERS TABLE */}
                {activePharmTab === 'orders' && (
                  <div>
                    {/* ORDER LOOKUP / VERIFICATION BAR */}
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                      <div style={{ position: 'relative', flex: '1', minWidth: '260px' }}>
                        <input
                          type="text"
                          className="search-input"
                          style={{ width: '100%', padding: '0.65rem 1rem 0.65rem 2.4rem', fontSize: '0.9rem', borderRadius: 'var(--radius-xl)' }}
                          placeholder="Search / enter customer Order #, UUID, or phone..."
                          value={pharmacyOrderSearch}
                          onChange={(e) => setPharmacyOrderSearch(e.target.value)}
                        />
                        <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}>🔍</span>
                        {pharmacyOrderSearch && (
                          <button
                            onClick={() => setPharmacyOrderSearch('')}
                            style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)', alignItems: 'center' }}>
                        <span>Status count:</span>
                        <span className="badge badge-likely" style={{ fontSize: '0.72rem' }}>
                          Pending: {pharmacyOrders.filter((o) => o.status === 'PENDING').length}
                        </span>
                        <span className="badge badge-verified" style={{ fontSize: '0.72rem' }}>
                          Reserved/Active: {pharmacyOrders.filter((o) => ['ACCEPTED', 'READY', 'OUT_FOR_DELIVERY'].includes(o.status)).length}
                        </span>
                      </div>
                    </div>

                    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-2xl)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--card-alt)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '1rem 1.25rem' }}>Order & Customer</th>
                            <th style={{ padding: '1rem 1.25rem' }}>Fulfillment</th>
                            <th style={{ padding: '1rem 1.25rem' }}>Total</th>
                            <th style={{ padding: '1rem 1.25rem' }}>Status</th>
                            <th style={{ padding: '1rem 1.25rem' }}>Counter Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const filtered = pharmacyOrders.filter((ord) => {
                              if (!pharmacyOrderSearch.trim()) return true;
                              const q = pharmacyOrderSearch.trim().toLowerCase();
                              return (
                                ord.id?.toLowerCase().includes(q) ||
                                ord.order_number?.toLowerCase().includes(q) ||
                                ord.customer_name?.toLowerCase().includes(q) ||
                                ord.customer_phone?.toLowerCase().includes(q)
                              );
                            });

                            if (filtered.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {pharmacyOrderSearch.trim()
                                      ? `No order found matching "${pharmacyOrderSearch}". Check the order number or customer phone.`
                                      : 'No orders received yet. Incoming customer orders will appear here in real time.'}
                                  </td>
                                </tr>
                              );
                            }

                            return filtered.map((ord) => (
                              <tr key={ord.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '1rem 1.25rem' }}>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.95rem' }}>
                                    {ord.order_number || `#${ord.id.substring(0, 8)}`}
                                  </div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    {ord.customer_name || 'Customer'} {ord.customer_phone ? `· ${ord.customer_phone}` : ''}
                                  </div>
                                </td>
                                <td style={{ padding: '1rem 1.25rem' }}>
                                  <div style={{ fontWeight: 600 }}>
                                    {ord.fulfillment_type === 'PICKUP' ? '🏥 Counter Pickup' : '🚚 Courier Delivery'}
                                  </div>
                                  {ord.delivery_address && (
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {ord.delivery_address}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '1rem 1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                                  GHS {(Number(ord.total_minor || 0) / 100).toFixed(2)}
                                </td>
                                <td style={{ padding: '1rem 1.25rem' }}>
                                  <span className={`badge ${['ACCEPTED', 'COMPLETED', 'READY'].includes(ord.status) ? 'badge-verified' : 'badge-likely'}`}>
                                    {ord.status === 'ACCEPTED' ? '🔒 RESERVED' : ord.status}
                                  </span>
                                </td>
                                <td style={{ padding: '1rem 1.25rem' }}>
                                  {ord.status === 'PENDING' && (
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                      <button className="btn btn-primary btn-sm" onClick={() => handleAcceptOrder(ord.id)}>
                                        ✓ Accept & Reserve
                                      </button>
                                      <button className="btn btn-secondary btn-sm" onClick={() => handleRejectOrder(ord.id)}>
                                        ✕ Reject
                                      </button>
                                    </div>
                                  )}

                                  {ord.status === 'ACCEPTED' && ord.fulfillment_type === 'PICKUP' && (
                                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                      <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => handleUpdateOrderStatus(ord.id, 'COMPLETED')}
                                        title="Customer is at counter. Dispense medicines and finalize order (deducts stock)"
                                      >
                                        ✓ Dispense & Confirm Pickup
                                      </button>
                                      <button
                                        className="btn btn-outline btn-sm"
                                        onClick={() => handleUpdateOrderStatus(ord.id, 'READY')}
                                        title="Package prepared and kept ready on dispensary shelf"
                                      >
                                        📦 Mark Ready
                                      </button>
                                    </div>
                                  )}

                                  {ord.status === 'ACCEPTED' && ord.fulfillment_type === 'DELIVERY' && (
                                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                      <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => handleUpdateOrderStatus(ord.id, 'OUT_FOR_DELIVERY')}
                                        title="Hand package to courier for delivery"
                                      >
                                        🚚 Dispatch Courier
                                      </button>
                                      <button
                                        className="btn btn-outline btn-sm"
                                        onClick={() => handleUpdateOrderStatus(ord.id, 'COMPLETED')}
                                      >
                                        ✓ Mark Delivered
                                      </button>
                                    </div>
                                  )}

                                  {ord.status === 'READY' && (
                                    <button
                                      className="btn btn-primary btn-sm"
                                      onClick={() => handleUpdateOrderStatus(ord.id, 'COMPLETED')}
                                      title="Customer is at counter to collect ready package"
                                    >
                                      ✓ Confirm Counter Pickup
                                    </button>
                                  )}

                                  {ord.status === 'OUT_FOR_DELIVERY' && (
                                    <button
                                      className="btn btn-primary btn-sm"
                                      onClick={() => handleUpdateOrderStatus(ord.id, 'COMPLETED')}
                                    >
                                      ✓ Confirm Delivery Received
                                    </button>
                                  )}

                                  {ord.status === 'COMPLETED' && (
                                    <span style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: 800 }}>
                                      ✓ Dispensed & Fulfilled
                                    </span>
                                  )}

                                  {['REJECTED', 'CANCELLED'].includes(ord.status) && (
                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                      {ord.status}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* INVENTORY TABLE */}
                {activePharmTab === 'inventory' && (
                  <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-2xl)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--card-alt)', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '1rem 1.25rem' }}>Medicine Name</th>
                          <th style={{ padding: '1rem 1.25rem' }}>Source</th>
                          <th style={{ padding: '1rem 1.25rem' }}>Available Units</th>
                          <th style={{ padding: '1rem 1.25rem' }}>Reserved</th>
                          <th style={{ padding: '1rem 1.25rem' }}>Unit Price</th>
                          <th style={{ padding: '1rem 1.25rem' }}>State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pharmacyInventory.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                              No inventory records found. Upload a CSV file or confirm physical stock counts.
                            </td>
                          </tr>
                        ) : (
                          pharmacyInventory.map((item) => (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '1rem 1.25rem' }}>
                                <strong>{item.generic_name}</strong>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.brand_name || 'Generic'}</div>
                              </td>
                              <td style={{ padding: '1rem 1.25rem' }}><span className="badge badge-likely">{item.source_type}</span></td>
                              <td style={{ padding: '1rem 1.25rem', fontWeight: 800 }}>{item.available_quantity} units</td>
                              <td style={{ padding: '1rem 1.25rem' }}>{item.reserved_quantity} units</td>
                              <td style={{ padding: '1rem 1.25rem', color: 'var(--primary)', fontWeight: 800 }}>GHS {(item.unit_price_minor / 100).toFixed(2)}</td>
                              <td style={{ padding: '1rem 1.25rem' }}><span className="badge badge-verified">{item.availability_state}</span></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* PRESCRIPTION REVIEW QUEUE */}
                {activePharmTab === 'prescriptions' && (
                  <div>
                    {pendingPrescriptions.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-state-icon">📄</div>
                        <h3>No Pending Prescriptions</h3>
                        <p>When customers attach doctor's prescriptions to their orders, they will appear here for pharmacist review.</p>
                      </div>
                    ) : (
                      pendingPrescriptions.map((prescription) => (
                        <article className="prescription-review-card" key={prescription.id}>
                          <div>
                            <div className="prescription-review-title">
                              Prescription for {prescription.customer_first_name || 'Customer'} {prescription.customer_last_name || ''}
                            </div>
                            <div className="prescription-review-meta">
                              Order #{prescription.order_number || prescription.order_id?.substring(0, 8)} · Status: {prescription.status} · {new Date(prescription.created_at).toLocaleString()}
                            </div>
                            {prescription.review_note && <p className="prescription-review-note">{prescription.review_note}</p>}
                          </div>
                          <div className="prescription-review-actions">
                            <button className="btn btn-outline btn-sm" onClick={() => viewPrescriptionFile(prescription.id)}>
                              👁️ View Prescription File
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={() => reviewPrescription(prescription.id, 'APPROVED')}>✓ Approve</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => reviewPrescription(prescription.id, 'CLARIFICATION_REQUIRED')}>❓ Request Clarification</button>
                            <button className="btn btn-outline btn-sm" onClick={() => reviewPrescription(prescription.id, 'REJECTED')}>✕ Reject</button>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                )}
              </>
            </div>
            )}
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      {activePortal === 'customer' && <footer className="footer">
        <div className="footer-grid">
          <div>
            <div className="brand-wrapper" style={{ marginBottom: '0.85rem' }}>
              <div className="brand-logo-badge">💊</div>
              <span>PharmaLink</span>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '320px' }}>
              Ghana's digital pharmacy availability and ordering network. Guaranteed authentic medicines from verified dispensaries near you.
            </p>
          </div>

          <div className="footer-col">
            <h4>Shop</h4>
            <ul>
              <li><a href={pagePaths.medicines} onClick={(e) => { e.preventDefault(); setSearchQuery(''); navigateTo('medicines'); performSearch(''); }}>All Medicines</a></li>
              <li><a href={pagePaths.medicines} onClick={(e) => { e.preventDefault(); setSearchQuery('Paracetamol'); navigateTo('medicines'); performSearch('Paracetamol'); }}>Pain Relief</a></li>
              <li><a href={pagePaths.prescriptions} onClick={(e) => { e.preventDefault(); navigateTo('prescriptions'); }}>Upload Prescription</a></li>
              <li><a href={pagePaths.medicines} onClick={(e) => { e.preventDefault(); setSearchQuery('Vitamin'); navigateTo('medicines'); performSearch('Vitamin'); }}>Vitamins & Immunity</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Company</h4>
            <ul>
              <li><a href={pagePaths.howItWorks} onClick={(e) => { e.preventDefault(); navigateTo('howItWorks'); }}>How It Works</a></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); setRegisterRole('PHARMACY_ADMIN'); setIsRegisterOpen(true); }}>Pharmacy Partners</a></li>
              <li><a href={pagePaths.pharmacies} onClick={(e) => { e.preventDefault(); navigateTo('pharmacies'); }}>Verified Network</a></li>
              <li><a href="#">Regulatory Compliance</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Support & Help</h4>
            <ul>
              <li><a href="#">Emergency Help</a></li>
              <li><a href="#">Terms of Service</a></li>
              <li><a href="#">Privacy & Prescription Safety</a></li>
              <li><a href="#">Contact Pharmacist Support</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          © 2026 PharmaLink Ghana Ltd. Regulated and accredited under Ghana Pharmacy Council guidelines.
        </div>
      </footer>}

      {/* GHANA LOCATION SELECTOR MODAL */}
      {isLocationModalOpen && (
        <div className="modal-overlay" onClick={() => setIsLocationModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>📍 Select Location in Ghana</h3>
              <button className="modal-close" onClick={() => setIsLocationModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: '1.25rem', padding: '0.85rem' }}
                onClick={requestGeoLocation}
              >
                🎯 Detect Live GPS Location
              </button>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                <div className="form-group">
                  <label className="form-label">Search Region or City</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search e.g. Kumasi, Takoradi, East Legon, Tamale..."
                    value={customCitySearch}
                    onChange={(e) => setCustomCitySearch(e.target.value)}
                  />
                </div>

                <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {filteredGhanaCities.map((city, i) => (
                    <button
                      key={i}
                      className="btn btn-secondary btn-sm"
                      style={{ justifyContent: 'space-between', padding: '0.7rem 0.95rem' }}
                      onClick={() => {
                        setLocation({ lat: city.lat, lng: city.lng, name: city.name });
                        setIsLocationModalOpen(false);
                        showToast(`Location set to ${city.name}`, 'success');
                      }}
                    >
                      <span>📍 <strong>{city.name}</strong></span>
                      <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{city.region}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CART DRAWER / MODAL */}
      {isCartOpen && (
        <div className="modal-overlay" onClick={() => setIsCartOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>🛍️ Your Order Cart</h3>
              <button className="modal-close" onClick={() => setIsCartOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {cart.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🛍️</div>
                  <h4 style={{ fontWeight: 800, fontSize: '1.15rem' }}>Your cart is empty</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    Browse verified medicines from partner pharmacies near you.
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1rem', background: 'var(--secondary)', borderRadius: 'var(--radius-lg)', fontSize: '0.88rem', border: '1px solid var(--badge-verified-border)' }}>
                    Fulfilling Pharmacy: <strong style={{ color: 'var(--primary)' }}>{cart.pharmacyName}</strong>
                  </div>

                  {cart.items.map((item) => (
                    <div key={item.medicine.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', paddingBottom: '0.85rem', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{item.medicine.generic_name}</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>GHS {(item.price.unit_price_minor / 100).toFixed(2)} each</div>
                        {item.medicine.prescription_required && (
                          <span className="badge badge-rx" style={{ marginTop: '0.25rem' }}>Rx Required</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.6rem' }} onClick={() => updateCartQty(item.medicine.id, -1)}>-</button>
                        <span style={{ fontWeight: 800 }}>{item.quantity}</span>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.6rem' }} onClick={() => updateCartQty(item.medicine.id, 1)}>+</button>
                      </div>
                    </div>
                  ))}

                  <div className="form-group" style={{ marginTop: '1.25rem' }}>
                    <label className="form-label">Fulfillment Option</label>
                    <select
                      className="form-select"
                      value={cart.fulfillmentType}
                      onChange={(e) => setCart({ ...cart, fulfillmentType: e.target.value })}
                    >
                      <option value="PICKUP">🏥 Pharmacy Counter Pickup (Free)</option>
                      <option value="DELIVERY" disabled={!cartFulfillmentOptions.delivery}>
                        {cartFulfillmentOptions.delivery
                          ? `🚚 Doorstep Delivery (+GHS ${(Number(cartFulfillmentOptions.delivery_base_fee_minor || 0) / 100).toFixed(2)})`
                          : '🚚 Delivery unavailable for this pharmacy'}
                      </option>
                    </select>
                  </div>

                  {cart.fulfillmentType === 'DELIVERY' && (
                    <div className="form-group">
                      <label className="form-label">Delivery Address in Ghana</label>
                      <input
                        className="form-input"
                        value={cart.deliveryAddress}
                        onChange={(e) => setCart({ ...cart, deliveryAddress: e.target.value })}
                        placeholder="e.g. House 24, Lagos Avenue, East Legon, Accra"
                        required
                      />
                    </div>
                  )}

                  {prescriptionItems.length > 0 && (
                    <div className="form-group" style={{ background: 'var(--card-alt)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                      <label className="form-label" style={{ color: 'var(--badge-rx-text)' }}>
                        📋 Doctor's Prescription Required
                      </label>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                        Required for: <strong>{prescriptionItems.map((item) => item.medicine.generic_name).join(', ')}</strong>
                      </p>
                      <input
                        type="file"
                        className="form-input"
                        accept="application/pdf,image/jpeg,image/png"
                        onChange={handlePrescriptionFile}
                        required
                      />
                      {prescriptionFile && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 700, marginTop: '0.4rem' }}>
                          ✓ File selected: {prescriptionFile.name}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '2px solid var(--border)', fontSize: '1.2rem', fontWeight: 900 }}>
                    <span>Total Amount:</span>
                    <span style={{ color: 'var(--primary)' }}>GHS {cartTotal.toFixed(2)}</span>
                  </div>

                  <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem', padding: '0.85rem' }} onClick={handleCheckout}>
                    ✓ Submit Order to Pharmacy
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PRESCRIPTION EXPLAINER MODAL */}
      {isRxModalOpen && (
        <div className="modal-overlay" onClick={() => setIsRxModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Prescription Upload Workflow</h3>
              <button className="modal-close" onClick={() => setIsRxModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                For prescription medications in Ghana, simply search for your medicine, add it to your order, and attach your doctor's prescription (PDF, JPG, or PNG) during checkout.
              </p>
              <div style={{ marginTop: '1rem', padding: '0.85rem', background: 'var(--secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                🔒 <strong>Privacy Guaranteed:</strong> Your medical files are reviewed exclusively by registered pharmacists at the assigned dispensary.
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { setIsRxModalOpen(false); navigateTo('medicines'); }}>
                  Find Prescription Medicines
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SIGN IN MODAL */}
      {isLoginOpen && (
        <div className="modal-overlay" onClick={() => setIsLoginOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Sign In to PharmaLink</h3>
              <button className="modal-close" onClick={() => setIsLoginOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {authError && (
                <div style={{ background: 'var(--destructive-bg)', color: 'var(--destructive-text)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontSize: '0.88rem', border: '1px solid var(--destructive-border)' }}>
                  {authError}
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label">Email Address or Phone Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 0550000006 or kwame@example.com"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem' }}>
                  Sign In
                </button>
              </form>

              <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Don't have an account?{' '}
                <button
                  style={{ color: 'var(--primary)', fontWeight: 800, textDecoration: 'underline' }}
                  onClick={() => { setIsLoginOpen(false); setIsRegisterOpen(true); }}
                >
                  Create an account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE ACCOUNT MODAL */}
      {isRegisterOpen && (
        <div className="modal-overlay" onClick={() => setIsRegisterOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                {registerRole === 'CUSTOMER' ? '✨ Create Patient Account' : '🏥 Onboard Pharmacy Account'}
              </h3>
              <button className="modal-close" onClick={() => setIsRegisterOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${registerRole === 'CUSTOMER' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1 }}
                  onClick={() => setRegisterRole('CUSTOMER')}
                >
                  👤 Patient Account
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${registerRole === 'PHARMACY_ADMIN' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1 }}
                  onClick={() => setRegisterRole('PHARMACY_ADMIN')}
                >
                  🏥 Pharmacy Owner
                </button>
              </div>

              <form onSubmit={handleRegister}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">First Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      placeholder="e.g. Kwame"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Last Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      placeholder="e.g. Mensah"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    className="form-input"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="e.g. kwame@gmail.com"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Phone Number *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="e.g. 0550000006"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <input
                    type="password"
                    className="form-input"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                  />
                </div>

                {registerRole === 'PHARMACY_ADMIN' && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: '0.75rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.75rem', color: 'var(--primary)' }}>
                      Pharmacy Organization Details
                    </div>
                    <div className="form-group">
                      <label className="form-label">Pharmacy Display Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={regPharmName}
                        onChange={(e) => setRegPharmName(e.target.value)}
                        placeholder="e.g. Airport Residential Pharmacy"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Pharmacy License Number</label>
                      <input
                        type="text"
                        className="form-input"
                        value={regPharmLicense}
                        onChange={(e) => setRegPharmLicense(e.target.value)}
                        placeholder="e.g. FDA-PH-2024-001"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Address / Street Location *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={regPharmAddress}
                        onChange={(e) => setRegPharmAddress(e.target.value)}
                        placeholder="e.g. Oxford Street, Osu, Accra"
                        required
                      />
                    </div>
                  </div>
                )}

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem', marginTop: '0.75rem' }}>
                  ✓ Create Account & Sign In
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* PHYSICAL STOCK CONFIRMATION MODAL */}
      {isPhysicalStockModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPhysicalStockModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>📋 Physical Shelf Count Check</h3>
              <button className="modal-close" onClick={() => setIsPhysicalStockModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleConfirmPhysicalStock}>
                <div className="form-group">
                  <label className="form-label">Select Medicine</label>
                  <select
                    className="form-select"
                    value={selectedStockMedId}
                    onChange={(e) => setSelectedStockMedId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose medicine to verify --</option>
                    {searchResults.map((r) => (
                      <option key={r.medicine.id} value={r.medicine.id}>
                        {r.medicine.generic_name} ({r.medicine.brand_name || 'Generic'})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Physical Count (Units)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={physicalQty}
                      onChange={(e) => setPhysicalQty(e.target.value)}
                      min="0"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit Price (GHS)</label>
                    <input
                      type="number"
                      step="0.10"
                      className="form-input"
                      value={physicalUnitPrice}
                      onChange={(e) => setPhysicalUnitPrice(e.target.value)}
                      min="0"
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem' }}>
                  ✓ Confirm & Publish Stock
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CSV INVENTORY UPLOAD MODAL */}
      {isCsvImportModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCsvImportModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>📁 Upload CSV Inventory File</h3>
              <button className="modal-close" onClick={() => setIsCsvImportModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCsvImport}>
                <div className="form-group">
                  <label className="form-label">Select CSV File</label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="form-input"
                    onChange={handleCsvFileUpload}
                  />
                  {uploadedFileName && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 700, marginTop: '4px' }}>
                      ✓ Selected file: {uploadedFileName}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">CSV Content Preview / Raw Text</label>
                  <textarea
                    className="form-textarea"
                    rows="6"
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                    placeholder="generic_name,quantity,unit_price_ghs..."
                  ></textarea>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem' }}>
                  Process CSV Import
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {isNotificationsOpen && currentUser && (
        <div className="modal-overlay" onClick={() => setIsNotificationsOpen(false)}>
          <div className="modal-card notification-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Notifications</h3>
              <button className="modal-close" onClick={() => setIsNotificationsOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {myNotifications.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
                  You have no notifications yet.
                </p>
              ) : (
                myNotifications.map((notification) => {
                  const isClarification = notification.type === 'PRESCRIPTION_CLARIFICATION_REQUIRED';
                  const isRejected = notification.type === 'ORDER_REJECTED';
                  return (
                    <div
                      key={notification.id}
                      className={`notification-item ${notification.read_at ? '' : 'unread'}`}
                    >
                      <div>
                        <strong>
                          {isClarification
                            ? 'Action required: prescription clarification'
                            : isRejected
                              ? 'Order rejected by pharmacy'
                              : notification.type.replaceAll('_', ' ').toLowerCase()}
                        </strong>
                        <p>
                          {isClarification
                            ? 'The pharmacy needs more information before it can process your order.'
                            : isRejected
                              ? 'Review My Orders for the pharmacy reason and next steps.'
                              : 'Your PharmaLink order has a new status update.'}
                        </p>
                        <small>{new Date(notification.created_at).toLocaleString()}</small>
                      </div>
                      {!notification.read_at && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => markNotificationAsRead(notification.id)}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  );
                })
              )}
              {myNotifications.some((notification) => notification.reference_type === 'ORDER' || notification.reference_type === 'PRESCRIPTION') && (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '0.75rem' }}
                  onClick={() => {
                    setIsNotificationsOpen(false);
                    setIsMyOrdersOpen(true);
                    fetchMyOrders();
                  }}
                >
                  View My Orders
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* USER PROFILE MODAL */}
      {isProfileOpen && currentUser && (
        <div className="modal-overlay" onClick={() => setIsProfileOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Account Profile</h3>
              <button className="modal-close" onClick={() => setIsProfileOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--card-alt)', padding: '1.35rem', borderRadius: 'var(--radius-xl)', marginBottom: '1.25rem', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>{currentUser.first_name} {currentUser.last_name || ''}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{currentUser.email || currentUser.phone}</div>
                <span className="badge badge-verified" style={{ marginTop: '0.65rem' }}>
                  Role: {currentUser.role}
                </span>
              </div>

              {pharmacyData?.verification_status === 'PENDING' && (
                <div style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem', border: '1px solid var(--warning-border)' }}>
                  Your pharmacy application is currently pending platform verification.
                </div>
              )}

              {currentUser.role === 'CUSTOMER' && (
                <>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', marginBottom: '0.75rem', padding: '0.75rem' }}
                    onClick={() => { setIsProfileOpen(false); setIsMyOrdersOpen(true); fetchMyOrders(); }}
                  >
                    🛍️ View My Orders
                  </button>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.85rem', marginBottom: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    <input
                      type="checkbox"
                      checked={browserNotificationsEnabled}
                      onChange={(event) => saveBrowserNotificationPreference(event.target.checked)}
                      style={{ marginTop: '0.2rem' }}
                    />
                    <span>
                      <strong style={{ display: 'block' }}>Opt in to browser notifications</strong>
                      <small style={{ color: 'var(--text-muted)' }}>Saves your preference for future push support. In-app notifications stay enabled.</small>
                    </span>
                  </label>
                </>
              )}

              <button
                className="btn btn-outline"
                style={{ width: '100%', color: 'var(--destructive)', borderColor: 'var(--destructive-border)', padding: '0.75rem' }}
                onClick={() => {
                  setCurrentUser(null);
                  setCurrentToken(null);
                  setPharmacyData(null);
                  try {
                    window.localStorage.removeItem('pharmalink-auth-token');
                    window.localStorage.removeItem('pharmalink-user');
                    window.localStorage.removeItem('pharmalink-pharmacy');
                  } catch {}
                  setIsProfileOpen(false);
                  setActivePortal('customer');
                  setActivePage('home');
                  window.history.pushState({}, '', '/');
                  showToast('Signed out of session', 'info');
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MY ORDERS MODAL */}
      {isMyOrdersOpen && (
        <div className="modal-overlay" onClick={() => setIsMyOrdersOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>My Orders</h3>
              <button className="modal-close" onClick={() => setIsMyOrdersOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {myNotifications
                .filter((notification) => notification.type.startsWith('PRESCRIPTION_') || notification.type === 'ORDER_REJECTED')
                .slice(0, 5)
                .map((notification) => (
                  <div
                    key={notification.id}
                    style={{
                      marginBottom: '0.75rem',
                      padding: '0.8rem',
                      borderRadius: 'var(--radius-md)',
                      background: notification.type.includes('CLARIFICATION') ? 'var(--accent)' : 'var(--secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <strong>
                      {notification.type === 'PRESCRIPTION_CLARIFICATION_REQUIRED'
                        ? 'Action required: prescription clarification'
                        : notification.type === 'ORDER_REJECTED'
                          ? 'Order update: pharmacy rejected the order'
                          : 'Prescription update'}
                    </strong>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {notification.type === 'PRESCRIPTION_CLARIFICATION_REQUIRED'
                        ? 'The pharmacy needs more information before it can process your order.'
                        : notification.type === 'ORDER_REJECTED'
                          ? 'Open the order below to review its status and rejection reason.'
                          : notification.type.replaceAll('_', ' ').toLowerCase()}
                    </div>
                  </div>
                ))}
              {ordersLoading && <p>Loading your order history...</p>}
              {ordersError && <div style={{ color: 'var(--destructive-text)', background: 'var(--destructive-bg)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>{ordersError}</div>}
              {!ordersLoading && !ordersError && myOrders.length === 0 && (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>You have not placed any orders yet.</p>
              )}
              {!ordersLoading && !ordersError && myOrders.map((order) => (
                <div key={order.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '0.95rem', marginBottom: '0.85rem', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>{order.order_number || `#${order.id.substring(0, 8)}`}</strong>
                    <span className={`badge ${['ACCEPTED', 'READY', 'COMPLETED'].includes(order.status) ? 'badge-verified' : 'badge-likely'}`}>
                      {order.status === 'ACCEPTED' ? '🔒 STOCK RESERVED' : order.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    🏥 {order.pharmacy_name || 'Pharmacy'} · {order.fulfillment_type === 'PICKUP' ? 'Counter Pickup' : 'Delivery'} · <strong style={{ color: 'var(--primary)' }}>GHS {(Number(order.total_minor || order.total_amount_minor || 0) / 100).toFixed(2)}</strong>
                  </div>
                  {order.delivery_address && <div style={{ fontSize: '0.82rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>📍 Address: {order.delivery_address}</div>}

                  {/* Status Instructions */}
                  {order.status === 'PENDING' && (
                    <div style={{ marginTop: '0.5rem', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.82rem' }}>
                      ⏳ <strong>Order Pending:</strong> Dispensary is confirming physical stock availability.
                    </div>
                  )}

                  {order.status === 'ACCEPTED' && order.fulfillment_type === 'PICKUP' && (
                    <div style={{ marginTop: '0.5rem', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.82rem' }}>
                      🔒 <strong style={{ color: '#10b981' }}>Stock Reserved at Dispensary!</strong>
                      <div style={{ marginTop: '0.2rem', color: 'var(--text-muted)' }}>
                        Visit <strong>{order.pharmacy_name || 'the pharmacy'}</strong> and present Order <strong>#{order.order_number || order.id.substring(0, 8)}</strong> at the counter to verify and collect your medication.
                      </div>
                    </div>
                  )}

                  {order.status === 'ACCEPTED' && order.fulfillment_type === 'DELIVERY' && (
                    <div style={{ marginTop: '0.5rem', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.82rem' }}>
                      🔒 <strong style={{ color: '#10b981' }}>Stock Reserved!</strong>
                      <div style={{ marginTop: '0.2rem', color: 'var(--text-muted)' }}>
                        The pharmacy has locked your medicines and is preparing them for courier dispatch.
                      </div>
                    </div>
                  )}

                  {order.status === 'READY' && (
                    <div style={{ marginTop: '0.5rem', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', fontSize: '0.82rem' }}>
                      ✅ <strong style={{ color: '#10b981' }}>Ready for Counter Pickup!</strong>
                      <div style={{ marginTop: '0.2rem', color: 'var(--text-muted)' }}>
                        Your package is prepared. Present Order <strong>#{order.order_number || order.id.substring(0, 8)}</strong> at the dispensary counter.
                      </div>
                    </div>
                  )}

                  {order.status === 'OUT_FOR_DELIVERY' && (
                    <div style={{ marginTop: '0.5rem', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '0.82rem' }}>
                      🚚 <strong style={{ color: 'var(--primary)' }}>Out for Delivery!</strong>
                      <div style={{ marginTop: '0.2rem', color: 'var(--text-muted)' }}>
                        Courier is en route with your package.
                      </div>
                    </div>
                  )}

                  {order.status === 'COMPLETED' && (
                    <div style={{ marginTop: '0.5rem', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', fontSize: '0.82rem', color: '#10b981', fontWeight: 600 }}>
                      ✓ Dispensed & Collected
                    </div>
                  )}

                  {order.status === 'REJECTED' && order.rejection_reason && (
                    <div style={{ marginTop: '0.6rem', padding: '0.65rem', borderRadius: 'var(--radius-md)', background: 'var(--destructive-bg)', color: 'var(--destructive-text)', fontSize: '0.82rem' }}>
                      <strong>Pharmacy reason:</strong> {order.rejection_reason}
                    </div>
                  )}
                  {order.latest_prescription_status === 'CLARIFICATION_REQUIRED' && (
                    <div style={{ marginTop: '0.6rem', padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--accent)', border: '1px solid var(--border)' }}>
                      <strong>Action required: update your prescription</strong>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {order.latest_prescription_note || 'The pharmacist requested clarification before dispensing.'}
                      </div>
                      <label className="btn btn-primary btn-sm" style={{ display: 'inline-block', marginTop: '0.6rem', cursor: 'pointer' }}>
                        Upload replacement
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png"
                          style={{ display: 'none' }}
                          onChange={(event) => handleReplacementPrescriptionUpload(order.id, event)}
                        />
                      </label>
                    </div>
                  )}
                  {['PENDING', 'ACCEPTED'].includes(order.status) && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ marginTop: '0.65rem' }}
                      onClick={async () => {
                        try {
                          const res = await fetch(`/v1/orders/${order.id}/cancel`, { method: 'POST', headers: { 'Authorization': `Bearer ${currentToken}` } });
                          const data = await res.json();
                          if (!res.ok || !data.data) throw new Error(data.error?.message || 'Could not cancel order.');
                          showToast('Order cancelled.', 'info');
                          fetchMyOrders();
                        } catch (err) {
                          showToast(err.message, 'error');
                        }
                      }}
                    >
                      Cancel order
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION CONTAINER */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Render React App
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
  const appStatus = document.getElementById('app-status');
  if (appStatus) appStatus.remove();
}
