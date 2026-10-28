import React from 'react';
import { OrderTimelineTracker } from './OrderTimelineTracker';

export function CustomerOrdersModal({
  isOpen,
  onClose,
  myOrders = [],
  ordersLoading = false,
  ordersError = null,
  myNotifications = [],
  isProcessingPayment = false,
  onPayWithPaystack,
  onReplacementPrescriptionUpload,
  onCancelOrder,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>My Orders</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
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
          {ordersError && (
            <div style={{ color: 'var(--destructive-text)', background: 'var(--destructive-bg)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              {ordersError}
            </div>
          )}
          {!ordersLoading && !ordersError && myOrders.length === 0 && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>You have not placed any orders yet.</p>
          )}

          {!ordersLoading && !ordersError && myOrders.map((order) => {
            const totalGhs = (Number(order.total_minor || order.total_amount_minor || 0) / 100).toFixed(2);
            return (
              <div
                key={order.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.1rem',
                  marginBottom: '1rem',
                  background: 'var(--surface)',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>
                    {order.order_number || `#${order.id.substring(0, 8)}`}
                  </strong>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {order.payment_status === 'SUCCESS' ? (
                      <span className="badge badge-verified" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 700 }}>
                        💳 PAID ONLINE
                      </span>
                    ) : order.payment_status === 'REFUNDED' ? (
                      <span className="badge badge-verified" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.3)', fontWeight: 700 }}>
                        🔄 REFUNDED
                      </span>
                    ) : order.status === 'COMPLETED' ? (
                      <span className="badge badge-verified" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 700, fontSize: '0.75rem' }}>
                        ✓ PAID ON {order.fulfillment_type === 'PICKUP' ? 'PICKUP' : 'DELIVERY'}
                      </span>
                    ) : order.payment_method !== 'ONLINE' ? (
                      <span className="badge" style={{ background: 'rgba(14, 165, 233, 0.12)', color: '#0284c7', border: '1px solid rgba(14, 165, 233, 0.3)', fontWeight: 700, fontSize: '0.75rem' }}>
                        💵 PAY ON {order.fulfillment_type === 'PICKUP' ? 'PICKUP' : 'DELIVERY'}
                      </span>
                    ) : (
                      <span className="badge badge-uncertain" style={{ fontSize: '0.75rem' }}>
                        ⏳ UNPAID
                      </span>
                    )}
                    <span className={`badge ${['ACCEPTED', 'READY', 'COMPLETED'].includes(order.status) ? 'badge-verified' : order.status === 'REJECTED' || order.status === 'CANCELLED' ? 'badge-uncertain' : 'badge-likely'}`}>
                      {order.status === 'ACCEPTED' ? '🔒 STOCK RESERVED' : order.status}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  🏥 {order.pharmacy_name || 'Pharmacy'} · {order.fulfillment_type === 'PICKUP' ? 'Counter Pickup' : 'Delivery'} · <strong style={{ color: 'var(--primary)', fontSize: '0.95rem' }}>GHS {totalGhs}</strong>
                </div>
                {order.delivery_address && (
                  <div style={{ fontSize: '0.82rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>
                    📍 Address: {order.delivery_address}
                  </div>
                )}

                {/* Live Interactive Fulfillment Timeline Tracker */}
                <OrderTimelineTracker order={order} />

                {/* Payment Status / Action Banner (Only show while order is active and unfulfilled) */}
                {order.payment_status !== 'SUCCESS' && order.payment_status !== 'REFUNDED' && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(order.status) && (
                  order.payment_method === 'ONLINE' ? (
                    /* Online Prepayment Chosen */
                    <div style={{
                      marginTop: '0.75rem',
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(5, 150, 105, 0.08)',
                      border: '1px solid rgba(5, 150, 105, 0.25)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.6rem'
                    }}>
                      <div>
                        <strong style={{ fontSize: '0.88rem', color: 'var(--primary)', display: 'block' }}>💳 Pay Online via Paystack</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>MTN Mobile Money, Telecel Cash, AT Money, or Bank Card</div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{
                          padding: '0.5rem 1.1rem',
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                          boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)',
                        }}
                        disabled={isProcessingPayment}
                        onClick={() => onPayWithPaystack && onPayWithPaystack(order)}
                      >
                        {isProcessingPayment ? 'Connecting...' : `Pay GHS ${totalGhs} Now`}
                      </button>
                    </div>
                  ) : (
                    /* Pay on Pickup / Delivery chosen */
                    <div style={{
                      marginTop: '0.75rem',
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(14, 165, 233, 0.07)',
                      border: '1px solid rgba(14, 165, 233, 0.25)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.6rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '1.4rem' }}>💵</span>
                        <div>
                          <strong style={{ fontSize: '0.88rem', color: 'var(--primary)', display: 'block' }}>
                            {order.fulfillment_type === 'PICKUP' ? 'Pay at Pharmacy Counter' : 'Pay on Delivery'}
                          </strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            GHS {totalGhs} due upon {order.fulfillment_type === 'PICKUP' ? 'collection (Cash or MoMo at counter)' : 'delivery (Cash or MoMo to courier)'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{
                          fontSize: '0.78rem',
                          padding: '0.35rem 0.75rem',
                          borderColor: 'rgba(14, 165, 233, 0.4)',
                          color: 'var(--text-main)',
                        }}
                        onClick={() => onPayWithPaystack && onPayWithPaystack(order)}
                        title="Pay online instead if you prefer cashless prepayment"
                      >
                        💳 Pay Online Instead
                      </button>
                    </div>
                  )
                )}

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

                {order.status === 'REJECTED' && (
                  <div style={{ marginTop: '0.6rem', padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--destructive-bg)', color: 'var(--destructive-text)', fontSize: '0.84rem' }}>
                    <div><strong>Pharmacy Rejection Reason:</strong> {order.rejection_reason || 'Pharmacy unable to fulfill order at this time'}</div>
                    {order.payment_status === 'REFUNDED' && (
                      <div style={{ marginTop: '0.45rem', paddingTop: '0.45rem', borderTop: '1px solid var(--destructive-border)', color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>🔄 Full payment refund of GHS {totalGhs} automatically reversed to your payment method.</span>
                      </div>
                    )}
                  </div>
                )}

                {order.status === 'CANCELLED' && (
                  <div style={{ marginTop: '0.6rem', padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--card-alt)', color: 'var(--text-muted)', fontSize: '0.84rem', border: '1px solid var(--border)' }}>
                    <div><strong>Order Cancelled</strong></div>
                    {order.payment_status === 'REFUNDED' && (
                      <div style={{ marginTop: '0.45rem', paddingTop: '0.45rem', borderTop: '1px solid var(--border)', color: '#15803d', fontWeight: 700 }}>
                        🔄 Payment refund of GHS {totalGhs} automatically reversed.
                      </div>
                    )}
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
                        onChange={(event) => onReplacementPrescriptionUpload && onReplacementPrescriptionUpload(order.id, event)}
                      />
                    </label>
                  </div>
                )}

                {['PENDING', 'ACCEPTED'].includes(order.status) && (
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: '0.65rem' }}
                    onClick={() => onCancelOrder && onCancelOrder(order.id)}
                  >
                    Cancel order
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
