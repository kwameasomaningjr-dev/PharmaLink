import React, { useState } from 'react';

export function PrescriptionWorkspaceModal({ prescription, isOpen, onClose, onReview, onViewFile }) {
  if (!isOpen || !prescription) return null;

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [reviewNote, setReviewNote] = useState('');
  const [pharmacistChecks, setPharmacistChecks] = useState({
    nameMatch: true,
    signatureVerified: true,
    dosageValid: true,
    noInteractions: true,
  });

  const allChecksPassed = Object.values(pharmacistChecks).every(Boolean);

  const handleAction = (status) => {
    onReview(prescription.id, status, reviewNote);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '960px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem' }}>🔬</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                Pharmacist Prescription Review Workspace
              </h3>
              <span className="badge badge-rx" style={{ fontSize: '0.72rem' }}>Ghana Pharmacy Council Standard</span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Prescription #{prescription.id.substring(0, 8)} · Patient: <strong>{prescription.customer_first_name || 'Customer'} {prescription.customer_last_name || ''}</strong>
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="rx-workspace-split">
            {/* LEFT PANE: Document / Image Preview & Controls */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Uploaded Prescription Document</span>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.2rem 0.5rem' }}
                    onClick={() => setZoom(z => Math.max(0.7, z - 0.2))}
                    title="Zoom out"
                  >
                    🔍-
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.2rem 0.5rem' }}
                    onClick={() => setZoom(z => Math.min(2.5, z + 0.2))}
                    title="Zoom in"
                  >
                    🔍+
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.2rem 0.5rem' }}
                    onClick={() => setRotation(r => (r + 90) % 360)}
                    title="Rotate 90deg"
                  >
                    🔄
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ padding: '0.2rem 0.5rem' }}
                    onClick={() => onViewFile(prescription.id)}
                    title="Open original file in new tab"
                  >
                    ↗️ Open File
                  </button>
                </div>
              </div>

              <div className="rx-preview-pane">
                <div style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease-in-out',
                  textAlign: 'center',
                  padding: '1rem'
                }}>
                  <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>📄</div>
                  <div style={{ color: '#f8fafc', fontSize: '0.9rem', fontWeight: 700 }}>
                    Prescription Document Attached
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                    Click "Open File" above to view high-res medical document
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT PANE: Clinical Verification Checklist & Actions */}
            <div>
              <div style={{ background: 'var(--card-alt)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                <h4 style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: '0.65rem' }}>
                  📋 Dispensing Pharmacist Checklist
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.84rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pharmacistChecks.nameMatch}
                      onChange={(e) => setPharmacistChecks({ ...pharmacistChecks, nameMatch: e.target.checked })}
                    />
                    <span>Patient name & details match order</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pharmacistChecks.signatureVerified}
                      onChange={(e) => setPharmacistChecks({ ...pharmacistChecks, signatureVerified: e.target.checked })}
                    />
                    <span>Registered Doctor stamp & signature verified</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pharmacistChecks.dosageValid}
                      onChange={(e) => setPharmacistChecks({ ...pharmacistChecks, dosageValid: e.target.checked })}
                    />
                    <span>Prescribed dosage & quantity within safe limits</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pharmacistChecks.noInteractions}
                      onChange={(e) => setPharmacistChecks({ ...pharmacistChecks, noInteractions: e.target.checked })}
                    />
                    <span>No adverse drug-drug interactions detected</span>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Pharmacist Clinical Notes / Instructions</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="e.g. Verified by Pharmacist Boateng. Take 1 tablet after meals twice daily for 5 days."
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              {/* Review Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '0.85rem',
                    fontWeight: 800,
                    background: allChecksPassed ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : undefined
                  }}
                  onClick={() => handleAction('APPROVED')}
                >
                  ✓ Approve & Authorize Dispensing
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.65rem' }}
                    onClick={() => handleAction('CLARIFICATION_REQUIRED')}
                  >
                    ❓ Request Patient Clarification
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ padding: '0.65rem', color: 'var(--destructive)' }}
                    onClick={() => handleAction('REJECTED')}
                  >
                    ✕ Reject Prescription
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
