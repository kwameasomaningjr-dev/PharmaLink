import React from 'react';

export function HowItWorksPage({ onBrowseMedicines }) {
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

      {onBrowseMedicines && (
        <div style={{ textAlign: 'center', marginTop: '2.5rem', marginBottom: '2rem' }}>
          <button type="button" className="btn btn-primary" onClick={onBrowseMedicines}>
            Start Searching Medicines →
          </button>
        </div>
      )}
    </div>
  );
}

export default HowItWorksPage;
