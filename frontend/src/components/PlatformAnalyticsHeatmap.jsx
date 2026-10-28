import React, { useState } from 'react';

export function PlatformAnalyticsHeatmap({ pharmacies = [], auditLogs = [], onVerifyPharmacy }) {
  const [selectedMetric, setSelectedMetric] = useState('demand');

  const regionMetrics = [
    { region: 'Greater Accra', searchShare: 58, fulfillmentRate: 94, topMeds: 'Paracetamol, Amoxicillin, Coartem', verifiedPharmacies: 8 },
    { region: 'Ashanti (Kumasi)', searchShare: 22, fulfillmentRate: 88, topMeds: 'Vitamin C, Coartem, ORS', verifiedPharmacies: 4 },
    { region: 'Western (Takoradi)', searchShare: 11, fulfillmentRate: 82, topMeds: 'Amoxicillin, Cetirizine', verifiedPharmacies: 2 },
    { region: 'Central (Cape Coast)', searchShare: 5, fulfillmentRate: 79, topMeds: 'Paracetamol, Ibuprofen', verifiedPharmacies: 2 },
    { region: 'Northern (Tamale)', searchShare: 4, fulfillmentRate: 76, topMeds: 'Coartem, ORS, Zinc', verifiedPharmacies: 1 },
  ];

  return (
    <div>
      {/* Metrics Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '1.25rem', boxShadow: 'var(--shadow-xs)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Verified Dispensaries</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--primary)', marginTop: '0.35rem' }}>
            {pharmacies.filter(p => p.verification_status === 'VERIFIED').length} 🏥
          </div>
          <div style={{ fontSize: '0.78rem', color: '#10b981', marginTop: '0.2rem' }}>Ghana Pharmacy Council Accredited</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '1.25rem', boxShadow: 'var(--shadow-xs)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Pending Verifications</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--warning)', marginTop: '0.35rem' }}>
            {pharmacies.filter(p => p.verification_status === 'PENDING').length} ⏳
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Awaiting license checks</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '1.25rem', boxShadow: 'var(--shadow-xs)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>National Stock Fill Rate</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0284c7', marginTop: '0.35rem' }}>
            91.4% 📈
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Across 16 regions</div>
        </div>
      </div>

      {/* Regional Demand & Heatmap Bars */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-xs)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>📊 Ghana Regional Medicine Demand & Stock Coverage</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Search traffic density & fulfillment efficiency by region</p>
          </div>
          <span className="badge badge-verified">Live Telemetry</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {regionMetrics.map((rm) => (
            <div key={rm.region} style={{ background: 'var(--card-alt)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <div>
                  <strong style={{ fontSize: '0.95rem' }}>📍 {rm.region}</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                    Top Searches: <em>{rm.topMeds}</em>
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{rm.searchShare}% of Ghana traffic</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Fill Rate: {rm.fulfillmentRate}%</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${rm.searchShare}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #059669 0%, #10b981 100%)',
                  borderRadius: '4px'
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
