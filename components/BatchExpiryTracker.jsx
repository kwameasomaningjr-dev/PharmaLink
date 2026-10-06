import React, { useState } from 'react';

export function BatchExpiryTracker({ inventory = [], onUpdateStock, onOpenCsvModal }) {
  const [filterState, setFilterState] = useState('ALL'); // 'ALL' | 'LOW' | 'EXPIRING'
  const [searchTerm, setSearchTerm] = useState('');

  // Sample batch data simulation for shelf management
  const enrichedInventory = inventory.map((item, i) => {
    const isLow = item.available_quantity < 15;
    const expiryMonths = (i % 3 === 0) ? 2 : (i % 2 === 0) ? 6 : 14;
    const batchNo = `LOT-GH-${2024 + (i % 2)}-${100 + i}`;
    return {
      ...item,
      batchNo,
      expiryMonths,
      isLow,
      expiryStatus: expiryMonths <= 3 ? 'EXPIRING_SOON' : 'FRESH',
    };
  });

  const filtered = enrichedInventory.filter((item) => {
    const matchesSearch = item.generic_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.brand_name?.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (filterState === 'LOW') return item.isLow;
    if (filterState === 'EXPIRING') return item.expiryStatus === 'EXPIRING_SOON';
    return true;
  });

  const handleExportCsv = () => {
    const headers = 'Medicine,Brand,Batch No,Available Units,Reserved,Unit Price GHS,Expiry Status\n';
    const rows = enrichedInventory.map(item =>
      `"${item.generic_name}","${item.brand_name || 'Generic'}","${item.batchNo}",${item.available_quantity},${item.reserved_quantity},${(item.unit_price_minor / 100).toFixed(2)},${item.expiryStatus}`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmalink_inventory_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search shelf stock..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '220px', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
          />
          <button
            className={`btn btn-sm ${filterState === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterState('ALL')}
          >
            All Stock ({inventory.length})
          </button>
          <button
            className={`btn btn-sm ${filterState === 'LOW' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterState('LOW')}
          >
            ⚠️ Low Stock ({enrichedInventory.filter(i => i.isLow).length})
          </button>
          <button
            className={`btn btn-sm ${filterState === 'EXPIRING' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterState('EXPIRING')}
          >
            ⏳ Expiring &lt;90 Days ({enrichedInventory.filter(i => i.expiryStatus === 'EXPIRING_SOON').length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
            📥 Export CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={onOpenCsvModal}>
            📤 Import CSV Catalog
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-responsive-wrapper" style={{ background: 'var(--surface)', borderRadius: 'var(--radius-2xl)', border: '1px solid var(--border)', overflowX: 'auto', boxShadow: 'var(--shadow-xs)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem', minWidth: '780px' }}>
          <thead>
            <tr style={{ background: 'var(--card-alt)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '0.9rem 1.15rem' }}>Medicine Name</th>
              <th style={{ padding: '0.9rem 1.15rem' }}>Batch & Expiry</th>
              <th style={{ padding: '0.9rem 1.15rem' }}>Shelf Units</th>
              <th style={{ padding: '0.9rem 1.15rem' }}>Reserved</th>
              <th style={{ padding: '0.9rem 1.15rem' }}>Unit Price</th>
              <th style={{ padding: '0.9rem 1.15rem' }}>Status</th>
              <th style={{ padding: '0.9rem 1.15rem' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No matching medicines found on shelf.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.9rem 1.15rem' }}>
                    <strong>{item.generic_name}</strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.brand_name || 'Generic'}</div>
                  </td>
                  <td style={{ padding: '0.9rem 1.15rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700 }}>{item.batchNo}</div>
                    <div style={{ fontSize: '0.74rem', color: item.expiryStatus === 'EXPIRING_SOON' ? '#d97706' : '#10b981', fontWeight: 600 }}>
                      {item.expiryStatus === 'EXPIRING_SOON' ? `⏳ Expiring in ${item.expiryMonths} mos` : `✓ Fresh (${item.expiryMonths} mos)`}
                    </div>
                  </td>
                  <td style={{ padding: '0.9rem 1.15rem' }}>
                    <span style={{ fontWeight: 800, color: item.isLow ? 'var(--destructive)' : 'var(--text-main)' }}>
                      {item.available_quantity} units
                    </span>
                    {item.isLow && <span className="badge badge-uncertain" style={{ marginLeft: '6px', fontSize: '0.68rem' }}>LOW</span>}
                  </td>
                  <td style={{ padding: '0.9rem 1.15rem' }}>{item.reserved_quantity} units</td>
                  <td style={{ padding: '0.9rem 1.15rem', color: 'var(--primary)', fontWeight: 800 }}>
                    GHS {(item.unit_price_minor / 100).toFixed(2)}
                  </td>
                  <td style={{ padding: '0.9rem 1.15rem' }}>
                    <span className="badge badge-verified">{item.availability_state}</span>
                  </td>
                  <td style={{ padding: '0.9rem 1.15rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onUpdateStock(item)}
                    >
                      ✏️ Count
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
