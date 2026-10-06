import React, { useState, useEffect } from 'react';

export function MoMoCheckoutModal({ isOpen, onClose, totalAmount, orderId, pharmacyName, onPaymentSuccess }) {
  if (!isOpen) return null;

  const [network, setNetwork] = useState('MTN');
  const [phoneNumber, setPhoneNumber] = useState('0244123456');
  const [step, setStep] = useState('INPUT'); // 'INPUT' | 'PROMPT_WAIT' | 'SUCCESS'
  const [countdown, setCountdown] = useState(5);
  const [ussdPin, setUssdPin] = useState('');

  const networks = [
    { id: 'MTN', name: 'MTN MoMo', icon: '🟡', dialCode: '*170#' },
    { id: 'TELECEL', name: 'Telecel Cash', icon: '🔴', dialCode: '*110#' },
    { id: 'AT', name: 'AT Money', icon: '🔵', dialCode: '*110#' },
    { id: 'CARD', name: 'Debit / Card', icon: '💳', dialCode: 'Online' },
  ];

  useEffect(() => {
    let timer;
    if (step === 'PROMPT_WAIT' && countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    } else if (step === 'PROMPT_WAIT' && countdown === 0) {
      setStep('SUCCESS');
      if (onPaymentSuccess) {
        onPaymentSuccess({
          provider: network,
          transaction_ref: `MOMO-GH-${Math.floor(100000 + Math.random() * 900000)}`,
          amount_minor: Math.round(totalAmount * 100),
          network,
          phone: phoneNumber,
        });
      }
    }
    return () => clearTimeout(timer);
  }, [step, countdown, network, totalAmount, phoneNumber, onPaymentSuccess]);

  const handleInitiate = (e) => {
    e.preventDefault();
    if (!phoneNumber || phoneNumber.length < 9) return;
    setStep('PROMPT_WAIT');
    setCountdown(5);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
              📱
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Ghana Mobile Money</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Instant, encrypted checkout</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {step === 'INPUT' && (
            <form onSubmit={handleInitiate}>
              <div style={{
                background: 'var(--card-alt)',
                padding: '1rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Payable</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary)' }}>
                    GHS {Number(totalAmount).toFixed(2)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fulfilling Partner</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{pharmacyName || 'Partner Pharmacy'}</div>
                </div>
              </div>

              {/* Network Selector Tabs */}
              <label className="form-label">Select Payment Provider</label>
              <div className="momo-network-tabs">
                {networks.map((net) => (
                  <button
                    key={net.id}
                    type="button"
                    className={`momo-tab-btn ${network === net.id ? 'active' : ''}`}
                    onClick={() => setNetwork(net.id)}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{net.icon}</span>
                    <span>{net.name}</span>
                  </button>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">{network === 'CARD' ? 'Cardholder Phone Number' : `${network} Mobile Money Number`}</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="e.g. 0244123456"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  A secure authorization prompt will appear on your phone screen.
                </span>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '0.9rem',
                  fontSize: '1rem',
                  fontWeight: 800,
                  marginTop: '1rem',
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)'
                }}
              >
                Send Payment Prompt (GHS {Number(totalAmount).toFixed(2)}) ➔
              </button>
            </form>
          )}

          {step === 'PROMPT_WAIT' && (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div className="momo-ussd-simulator">
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                  [USSD PROMPT SIMULATOR]
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                  Authorize payment of GHS {Number(totalAmount).toFixed(2)} to PharmaLink Ghana Ltd?
                </div>
                <div style={{ fontSize: '0.85rem', color: '#38bdf8', marginBottom: '1rem' }}>
                  Enter {network} PIN to confirm:
                </div>
                <div style={{
                  background: '#1e293b',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  width: '140px',
                  margin: '0 auto',
                  letterSpacing: '0.4em',
                  fontSize: '1.2rem',
                  color: '#ffffff'
                }}>
                  ••••
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '1rem' }}>
                  Auto-confirming in {countdown}s...
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <span className="status-spinner" style={{ width: '20px', height: '20px', margin: 0 }} />
                <span>Waiting for phone confirmation...</span>
              </div>
            </div>
          )}

          {step === 'SUCCESS' && (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--success-bg)',
                border: '2px solid var(--success-border)',
                color: 'var(--success)',
                fontSize: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem auto'
              }}>
                ✓
              </div>
              <h3 style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--text-main)' }}>Payment Approved!</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.35rem' }}>
                GHS {Number(totalAmount).toFixed(2)} received via {network} Mobile Money.
              </p>
              <div style={{
                margin: '1.25rem 0',
                padding: '0.85rem',
                background: 'var(--card-alt)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                border: '1px solid var(--border)'
              }}>
                TXN REF: MOMO-GH-{Math.floor(100000 + Math.random() * 900000)}
              </div>
              <button className="btn btn-primary" style={{ width: '100%', padding: '0.85rem' }} onClick={onClose}>
                View Order Status & Tracking ➔
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
