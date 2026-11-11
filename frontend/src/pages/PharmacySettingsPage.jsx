import React from 'react';

export function PharmacySettingsPage({ pharmacyData, onOpenCsvImport }) {
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

export default PharmacySettingsPage;
