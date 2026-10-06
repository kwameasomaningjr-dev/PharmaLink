import React from 'react';

export function OrderTimelineTracker({ order }) {
  if (!order) return null;

  const status = order.status || 'PENDING';
  const isPickup = order.fulfillment_type === 'PICKUP';

  const steps = [
    { key: 'PENDING', label: 'Order Placed', icon: '📝' },
    { key: 'ACCEPTED', label: 'Dispensary Confirmed', icon: '🧪' },
    { key: isPickup ? 'READY' : 'OUT_FOR_DELIVERY', label: isPickup ? 'Ready for Pickup' : 'Rider Dispatched', icon: isPickup ? '📦' : '🚚' },
    { key: 'COMPLETED', label: isPickup ? 'Collected' : 'Delivered', icon: '✅' },
  ];

  const statusRank = {
    PENDING: 1,
    ACCEPTED: 2,
    READY: 3,
    OUT_FOR_DELIVERY: 3,
    COMPLETED: 4,
    CANCELLED: 0,
    REJECTED: 0,
  };

  const currentRank = statusRank[status] || 1;

  if (['CANCELLED', 'REJECTED'].includes(status)) {
    return (
      <div style={{
        padding: '0.75rem 1rem',
        background: 'var(--destructive-bg)',
        border: '1px solid var(--destructive-border)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--destructive-text)',
        fontSize: '0.85rem',
        marginTop: '0.65rem'
      }}>
        <strong>Order Status: {status}</strong>
        <div style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
          {order.rejection_reason || 'This order was cancelled and inventory reservations were returned to stock.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '0.85rem', padding: '0.85rem', background: 'var(--card-alt)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Live Fulfillment Tracker
        </span>
        <span className="badge badge-verified" style={{ fontSize: '0.7rem' }}>
          {isPickup ? 'Counter Pickup' : 'Doorstep Courier'}
        </span>
      </div>

      <div className="order-tracker-timeline">
        {steps.map((s, idx) => {
          const stepRank = idx + 1;
          const isDone = currentRank > stepRank || (currentRank === 4 && stepRank === 4);
          const isCurrent = currentRank === stepRank && currentRank !== 4;

          return (
            <div
              key={s.key}
              className={`order-tracker-step ${isDone ? 'completed' : ''} ${isCurrent ? 'active' : ''}`}
            >
              <div className="order-tracker-step-dot">
                {isDone ? '✓' : s.icon}
              </div>
              <span className="order-tracker-step-label">{s.label}</span>
            </div>
          );
        })}
      </div>

      {!isPickup && ['ACCEPTED', 'OUT_FOR_DELIVERY'].includes(status) && (
        <div style={{
          marginTop: '0.85rem',
          padding: '0.65rem 0.85rem',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          fontSize: '0.82rem'
        }}>
          <div style={{ fontSize: '1.25rem' }}>🏍️</div>
          <div>
            <strong>Assigned Courier: Kwame Osei (Express Dispatch)</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Vehicle: Boxer 150 (GW-4421-23) · Phone: +233 24 987 6543
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
