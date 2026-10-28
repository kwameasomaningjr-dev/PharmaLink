import React, { useState } from 'react';

export function KanbanOrderBoard({ orders = [], onAccept, onReject, onUpdateStatus }) {
  const [fulfillmentFilter, setFulfillmentFilter] = useState('ALL');
  const [stageScope, setStageScope] = useState('ALL');

  const filteredOrders = orders.filter((ord) => {
    if (fulfillmentFilter === 'PICKUP' && ord.fulfillment_type !== 'PICKUP') return false;
    if (fulfillmentFilter === 'DELIVERY' && ord.fulfillment_type !== 'DELIVERY') return false;
    return true;
  });

  const allColumns = [
    {
      id: 'PENDING',
      stage: 'ACTIVE',
      title: '📥 Incoming New Orders',
      color: '#f59e0b',
      badgeClass: 'badge-likely',
      orders: filteredOrders.filter((o) => ['PENDING', 'DRAFT'].includes(o.status)),
    },
    {
      id: 'ACCEPTED',
      stage: 'ACTIVE',
      title: '🧪 Dispensing & Preparing',
      color: '#0284c7',
      badgeClass: 'badge-uncertain',
      orders: filteredOrders.filter((o) => ['ACCEPTED', 'PROCESSING'].includes(o.status)),
    },
    {
      id: 'READY_OR_OUT',
      stage: 'ACTIVE',
      title: '📦 Ready / Dispatched',
      color: '#059669',
      badgeClass: 'badge-verified',
      orders: filteredOrders.filter((o) => ['READY', 'OUT_FOR_DELIVERY'].includes(o.status)),
    },
    {
      id: 'COMPLETED',
      stage: 'COMPLETED',
      title: '✅ Fulfilled & Done',
      color: '#10b981',
      badgeClass: 'badge-verified',
      orders: filteredOrders.filter((o) => o.status === 'COMPLETED'),
    },
    {
      id: 'CLOSED',
      stage: 'CLOSED',
      title: '✕ Cancelled / Declined',
      color: '#ef4444',
      badgeClass: 'badge-out',
      orders: filteredOrders.filter((o) => ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(o.status)),
    },
  ];

  const visibleColumns = allColumns.filter((col) => {
    if (stageScope === 'ACTIVE') return col.stage === 'ACTIVE';
    if (stageScope === 'COMPLETED') return col.stage === 'COMPLETED';
    if (stageScope === 'CLOSED') return col.stage === 'CLOSED';
    return true;
  });

  // Count breakdowns
  const pickupCount = orders.filter((o) => o.fulfillment_type === 'PICKUP').length;
  const deliveryCount = orders.filter((o) => o.fulfillment_type === 'DELIVERY').length;
  const activeCount = orders.filter((o) => ['PENDING', 'DRAFT', 'ACCEPTED', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY'].includes(o.status)).length;
  const fulfilledCount = orders.filter((o) => o.status === 'COMPLETED').length;
  const closedCount = orders.filter((o) => ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(o.status)).length;

  return (
    <div className="kanban-wrapper">
      {/* Top Filter & Action Bar */}
      <div className="kanban-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)', marginRight: '0.2rem' }}>Fulfillment:</span>
          <button
            className={`btn btn-sm ${fulfillmentFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setFulfillmentFilter('ALL')}
          >
            All Orders ({orders.length})
          </button>
          <button
            className={`btn btn-sm ${fulfillmentFilter === 'PICKUP' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setFulfillmentFilter('PICKUP')}
          >
            🏥 Pickup ({pickupCount})
          </button>
          <button
            className={`btn btn-sm ${fulfillmentFilter === 'DELIVERY' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setFulfillmentFilter('DELIVERY')}
          >
            🚚 Delivery ({deliveryCount})
          </button>

          <span style={{ width: '1px', height: '18px', background: 'var(--border)', margin: '0 0.35rem' }} />

          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)', marginRight: '0.2rem' }}>View:</span>
          <button
            className={`btn btn-sm ${stageScope === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
            onClick={() => setStageScope('ALL')}
          >
            All 5 Stages ({orders.length})
          </button>
          <button
            className={`btn btn-sm ${stageScope === 'ACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
            onClick={() => setStageScope('ACTIVE')}
          >
            ⚡ Active Pipeline ({activeCount})
          </button>
          <button
            className={`btn btn-sm ${stageScope === 'COMPLETED' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
            onClick={() => setStageScope('COMPLETED')}
          >
            ✅ Fulfilled ({fulfilledCount})
          </button>
          {closedCount > 0 && (
            <button
              className={`btn btn-sm ${stageScope === 'CLOSED' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
              onClick={() => setStageScope('CLOSED')}
            >
              ✕ Cancelled ({closedCount})
            </button>
          )}
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          <span>Live Dispatch Sync Active</span>
        </div>
      </div>

      {/* Kanban Board Columns Track */}
      <div className={`kanban-board kanban-cols-${visibleColumns.length}`}>
        {visibleColumns.map((col) => (
          <div className="kanban-col" key={col.id}>
            <div className="kanban-col-header">
              <div className="kanban-col-title">
                <span style={{ fontSize: '0.88rem' }}>{col.title}</span>
              </div>
              <span className="kanban-col-badge">{col.orders.length}</span>
            </div>

            <div className="kanban-col-cards">
              {col.orders.length === 0 ? (
                <div className="kanban-empty-compact">
                  <span className="kanban-empty-icon">✨</span>
                  <span>No orders in this stage</span>
                </div>
              ) : (
                col.orders.map((ord) => (
                  <div className="kanban-card" key={ord.id}>
                    <div className="kanban-card-top">
                      <div>
                        <div className="kanban-card-id">
                          {ord.order_number || `#${ord.id.substring(0, 8)}`}
                        </div>
                        <div className="kanban-card-meta">
                          👤 {ord.customer_name || 'Customer'}
                        </div>
                      </div>
                      <span className={`badge ${ord.fulfillment_type === 'PICKUP' ? 'badge-otc' : 'badge-likely'}`} style={{ fontSize: '0.72rem' }}>
                        {ord.fulfillment_type === 'PICKUP' ? '🏥 Pickup' : '🚚 Delivery'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {ord.customer_phone && <div>📞 {ord.customer_phone}</div>}
                      {ord.delivery_address && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          📍 {ord.delivery_address}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.1rem' }}>
                      <div className="kanban-card-price">
                        GHS {(Number(ord.total_minor || 0) / 100).toFixed(2)}
                      </div>
                      <span className={`badge ${ord.payment_status === 'SUCCESS' ? 'badge-verified' : 'badge-uncertain'}`} style={{ fontSize: '0.68rem' }}>
                        {ord.payment_status === 'SUCCESS' ? '💳 Paid MoMo' : '💵 Pay at Counter'}
                      </span>
                    </div>

                    {/* Customer Note if present */}
                    {ord.customer_note && (
                      <div style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--text-muted)', background: 'var(--card-alt)', padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                        📝 "{ord.customer_note}"
                      </div>
                    )}

                    {/* Rejection/Cancellation reason if applicable */}
                    {['REJECTED', 'CANCELLED', 'EXPIRED'].includes(ord.status) && (
                      <div style={{ fontSize: '0.72rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)', padding: '0.35rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <strong>{ord.status === 'REJECTED' ? '✕ Declined' : ord.status === 'EXPIRED' ? '⏱ Expired' : '✕ Cancelled'}:</strong> {ord.rejection_reason || 'Order not fulfilled'}
                      </div>
                    )}

                    {/* Actions for this card */}
                    <div className="kanban-card-actions">
                      {['PENDING', 'DRAFT'].includes(ord.status) && (
                        <>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1, fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
                            onClick={() => onAccept(ord.id)}
                          >
                            ✓ Accept & Reserve
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
                            onClick={() => onReject(ord.id)}
                            title="Decline Order"
                          >
                            ✕
                          </button>
                        </>
                      )}

                      {['ACCEPTED', 'PROCESSING'].includes(ord.status) && ord.fulfillment_type === 'PICKUP' && (
                        <>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ flex: 1, fontSize: '0.76rem', padding: '0.35rem 0.5rem' }}
                            onClick={() => onUpdateStatus(ord.id, 'READY')}
                          >
                            📦 Mark Ready
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1, fontSize: '0.76rem', padding: '0.35rem 0.5rem' }}
                            onClick={() => onUpdateStatus(ord.id, 'COMPLETED')}
                          >
                            ✓ Dispense
                          </button>
                        </>
                      )}

                      {['ACCEPTED', 'PROCESSING'].includes(ord.status) && ord.fulfillment_type === 'DELIVERY' && (
                        <>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1, fontSize: '0.76rem', padding: '0.35rem 0.5rem' }}
                            onClick={() => onUpdateStatus(ord.id, 'OUT_FOR_DELIVERY')}
                          >
                            🚚 Dispatch Courier
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: '0.76rem', padding: '0.35rem 0.5rem' }}
                            onClick={() => onUpdateStatus(ord.id, 'COMPLETED')}
                          >
                            ✓ Done
                          </button>
                        </>
                      )}

                      {ord.status === 'READY' && (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ width: '100%', fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
                          onClick={() => onUpdateStatus(ord.id, 'COMPLETED')}
                        >
                          ✓ Confirm Customer Pickup
                        </button>
                      )}

                      {ord.status === 'OUT_FOR_DELIVERY' && (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ width: '100%', fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
                          onClick={() => onUpdateStatus(ord.id, 'COMPLETED')}
                        >
                          ✓ Confirm Delivery Received
                        </button>
                      )}

                      {ord.status === 'COMPLETED' && (
                        <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 800 }}>
                          ✓ Dispensed & Fulfilled
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
