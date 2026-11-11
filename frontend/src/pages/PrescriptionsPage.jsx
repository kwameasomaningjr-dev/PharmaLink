import React, { useState, useMemo } from 'react';

export function PrescriptionsPage({
  currentUser,
  currentToken,
  searchResults = [],
  verifiedPharmacies = [],
  location,
  onBrowseMedicines,
  onSignIn,
  showToast,
  onOrderCreated,
}) {
  const [selectedPharmacyId, setSelectedPharmacyId] = useState('');
  const [rxNotes, setRxNotes] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState(location?.name || 'East Legon, Accra, Ghana');
  const [rxFile, setRxFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Extract unique pharmacies from verifiedPharmacies or searchResults
  const pharmacies = useMemo(() => {
    if (verifiedPharmacies && verifiedPharmacies.length > 0) {
      return verifiedPharmacies;
    }
    return Array.from(
      (searchResults || []).reduce((pharmacyMap, item) => {
        if (item.pharmacy && !pharmacyMap.has(item.pharmacy.id)) {
          pharmacyMap.set(item.pharmacy.id, item.pharmacy);
        }
        return pharmacyMap;
      }, new Map()).values()
    );
  }, [verifiedPharmacies, searchResults]);

  const handleRxFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      if (showToast) showToast('Prescription files must be 5 MB or smaller.', 'error');
      return;
    }
    const validExtensions = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!validExtensions.includes(file.type) && !/\.(pdf|jpe?g|png)$/i.test(file.name)) {
      if (showToast) showToast('Upload a PDF, JPG, or PNG prescription.', 'error');
      return;
    }
    setRxFile(file);
    if (showToast) showToast(`Prescription "${file.name}" attached successfully!`, 'success');
  };

  const handleSubmitRx = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      if (showToast) showToast('Please sign in or register to submit your prescription.', 'info');
      if (onSignIn) onSignIn();
      return;
    }
    if (!rxFile) {
      if (showToast) showToast('Please attach a clear photo or PDF of your doctor prescription.', 'error');
      return;
    }
    const pharmacyId = selectedPharmacyId || pharmacies[0]?.id;
    if (!pharmacyId) {
      if (showToast) showToast('Please select a dispensing pharmacy.', 'error');
      return;
    }

    const pharmacyMedicines = (searchResults || []).filter((item) => item.pharmacy?.id === pharmacyId);
    const primaryMedicine = pharmacyMedicines[0]?.medicine;

    if (!primaryMedicine) {
      if (showToast) showToast('Please browse medicines first to select the specific prescription drug required.', 'info');
      if (onBrowseMedicines) onBrowseMedicines();
      return;
    }

    setIsSubmitting(true);
    try {
      const orderRes = await fetch('/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({
          pharmacy_id: pharmacyId,
          fulfillment_type: fulfillmentType,
          customer_note: rxNotes.trim() ? `[Doctor Prescription Order] ${rxNotes.trim()}` : '[Doctor Prescription Order]',
          delivery_address: fulfillmentType === 'DELIVERY' ? deliveryAddress : undefined,
          items: [{ medicine_id: primaryMedicine.id, quantity: 1 }]
        })
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.data) {
        throw new Error(orderData.error?.message || 'Could not create prescription order.');
      }

      const createdOrder = orderData.data;

      const formData = new FormData();
      formData.append('order_id', createdOrder.id);
      formData.append('file', rxFile);

      const uploadRes = await fetch('/v1/prescriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` },
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.data) {
        throw new Error(uploadData.error?.message || 'Order created, but prescription upload failed.');
      }

      if (showToast) showToast(`Prescription #${createdOrder.id.substring(0, 8)} uploaded for licensed pharmacist review!`, 'success');
      setRxFile(null);
      setRxNotes('');
      if (onOrderCreated) onOrderCreated();
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="catalog-page">
      <section className="catalog-hero container-page">
        <span className="hero-pill"><span className="hero-dot"></span> Safe & Regulated Healthcare in Ghana</span>
        <h1 className="catalog-title">Pharmacist-Reviewed Prescriptions</h1>
        <p className="catalog-subtitle">
          Upload your doctor's prescription directly or browse our licensed catalog. A certified dispensing pharmacist reviews and verifies every request before fulfillment.
        </p>
      </section>

      {/* INTERACTIVE RX UPLOAD & CONSULTATION CARD */}
      <section className="container-page" style={{ marginTop: '2rem' }}>
        <div style={{
          background: 'var(--card)',
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-2xl)',
          padding: '2rem',
          boxShadow: 'var(--shadow-md)',
          maxWidth: '820px',
          margin: '0 auto'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', background: 'var(--badge-rx-bg)', color: 'var(--badge-rx-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
              📋
            </div>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>Submit Doctor Prescription</h2>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                Directly transmit your prescription to a verified Ghana pharmacy for dispensing.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmitRx}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Select Dispensing Pharmacy</label>
                <select
                  className="form-select"
                  value={selectedPharmacyId || (pharmacies[0]?.id || '')}
                  onChange={(e) => setSelectedPharmacyId(e.target.value)}
                >
                  {pharmacies.length > 0 ? (
                    pharmacies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name} ({p.city || location?.name || 'Accra'})
                      </option>
                    ))
                  ) : (
                    <option value="">Airport Residential Pharmacy (Accra)</option>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Fulfillment Option</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <button
                    type="button"
                    className={`btn ${fulfillmentType === 'PICKUP' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ padding: '0.65rem', fontSize: '0.85rem' }}
                    onClick={() => setFulfillmentType('PICKUP')}
                  >
                    🏥 Counter Pickup
                  </button>
                  <button
                    type="button"
                    className={`btn ${fulfillmentType === 'DELIVERY' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ padding: '0.65rem', fontSize: '0.85rem' }}
                    onClick={() => setFulfillmentType('DELIVERY')}
                  >
                    🚚 Courier Delivery
                  </button>
                </div>
              </div>
            </div>

            {fulfillmentType === 'DELIVERY' && (
              <div className="form-group" style={{ marginTop: '0.5rem' }}>
                <label className="form-label">Delivery Address in Ghana</label>
                <input
                  type="text"
                  className="form-input"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="e.g. House 24, Lagos Avenue, East Legon, Accra"
                  required
                />
              </div>
            )}

            <div className="form-group" style={{ marginTop: '0.5rem' }}>
              <label className="form-label">Doctor's Instructions or Medication Names (Optional)</label>
              <textarea
                className="form-textarea"
                rows="2"
                value={rxNotes}
                onChange={(e) => setRxNotes(e.target.value)}
                placeholder="e.g. Amoxicillin 500mg capsules 3x daily as prescribed by Dr. Mensah..."
              />
            </div>

            <div className="form-group" style={{
              marginTop: '1rem',
              border: '2px dashed var(--border)',
              borderRadius: 'var(--radius-xl)',
              padding: '1.5rem',
              textAlign: 'center',
              background: 'var(--card-alt)'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📸</div>
              <label className="form-label" style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.25rem', cursor: 'pointer' }}>
                {rxFile ? rxFile.name : 'Click to Upload Prescription File'}
              </label>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
                Clear camera photo or document (PDF, JPG, PNG up to 5 MB)
              </p>
              <input
                type="file"
                id="rx-direct-upload"
                style={{ display: 'none' }}
                accept="application/pdf,image/jpeg,image/png,image/jpg"
                onChange={handleRxFileSelect}
              />
              <label htmlFor="rx-direct-upload" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                {rxFile ? '✓ Change File' : 'Browse / Snap Photo'}
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={onBrowseMedicines}
              >
                🔍 Browse All Medicines
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '0.85rem 1.8rem', fontWeight: 800 }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Uploading & Submitting...' : 'Submit to Pharmacist →'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* GUIDELINES GRID */}
      <section className="container-page prescription-guide-grid" style={{ marginTop: '3rem' }}>
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

export default PrescriptionsPage;
