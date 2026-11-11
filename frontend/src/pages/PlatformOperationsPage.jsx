import React from 'react';
import { PlatformAnalyticsHeatmap } from '../components/PlatformAnalyticsHeatmap';

export function PlatformOperationsDashboard({
  pharmacies = [],
  auditEvents = [],
  isLoading = false,
  activeFilter = 'ALL',
  setActiveFilter,
  onRefresh,
  onVerificationChange,
  activePage = 'network',
}) {
  const counts = pharmacies.reduce((summary, pharmacy) => {
    summary.total += 1;
    summary[pharmacy.verification_status] = (summary[pharmacy.verification_status] || 0) + 1;
    return summary;
  }, { total: 0, PENDING: 0, VERIFIED: 0, REJECTED: 0, SUSPENDED: 0 });

  const isVerificationPage = activePage === 'verification';
  const isAnalyticsPage = activePage === 'analytics';
  const isAuditPage = activePage === 'audit';
  const effectiveFilter = isVerificationPage ? 'PENDING' : activeFilter;
  const visiblePharmacies = effectiveFilter === 'ALL'
    ? pharmacies
    : pharmacies.filter((pharmacy) => pharmacy.verification_status === effectiveFilter);
  const pageTitle = isVerificationPage ? 'Verification queue'
    : isAnalyticsPage ? 'Network analytics'
      : isAuditPage ? 'Audit activity'
        : 'Pharmacy network';

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="admin-eyebrow">🛡️ PLATFORM OPERATIONS</span>
          <h1>{pageTitle}</h1>
          <p>
            {isVerificationPage
              ? 'Review pending pharmacy applications and make auditable onboarding decisions.'
              : isAnalyticsPage
                ? 'Monitor pharmacy coverage, onboarding throughput, and network health.'
                : isAuditPage
                  ? 'Review recent onboarding and administrative activity across the platform.'
                  : 'Manage every pharmacy onboarded to PharmaLink, review verification status, and monitor network health.'}
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onRefresh}>↻ Refresh data</button>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card"><span>Total pharmacies</span><strong>{counts.total}</strong><small>All onboarded records</small></div>
        <div className="admin-stat-card"><span>Verified</span><strong>{counts.VERIFIED}</strong><small>Active marketplace partners</small></div>
        <div className="admin-stat-card"><span>Pending review</span><strong>{counts.PENDING}</strong><small>Applications needing action</small></div>
        <div className="admin-stat-card"><span>Attention needed</span><strong>{counts.REJECTED + counts.SUSPENDED}</strong><small>Rejected or suspended</small></div>
      </div>

      {!isAnalyticsPage && !isAuditPage && <div className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h2>All pharmacies</h2>
            <p>Network directory and onboarding status.</p>
          </div>
          <div className="admin-filter-tabs">
            {(isVerificationPage ? ['PENDING'] : ['ALL', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']).map((filter) => (
              <button
                type="button"
                key={filter}
                className={effectiveFilter === filter ? 'active' : ''}
                onClick={() => setActiveFilter(filter)}
              >
                {filter === 'ALL' ? 'All' : filter.charAt(0) + filter.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="admin-empty-state">Loading pharmacy network...</div>
        ) : visiblePharmacies.length === 0 ? (
          <div className="admin-empty-state">No pharmacies match this status.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Pharmacy</th>
                  <th>Location</th>
                  <th>License</th>
                  <th>Status</th>
                  <th>Last updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePharmacies.map((pharmacy) => (
                  <tr key={pharmacy.id}>
                    <td>
                      <strong>{pharmacy.display_name}</strong>
                      <small>{pharmacy.legal_name || 'Legal name not provided'}</small>
                    </td>
                    <td>{pharmacy.city}, {pharmacy.region}</td>
                    <td>{pharmacy.license_number || 'Not provided'}</td>
                    <td><span className={`admin-status admin-status-${pharmacy.verification_status.toLowerCase()}`}>{pharmacy.verification_status}</span></td>
                    <td>{pharmacy.updated_at ? new Date(pharmacy.updated_at).toLocaleDateString() : 'Not available'}</td>
                    <td>
                      <div className="admin-row-actions">
                        {pharmacy.verification_status === 'PENDING' && (
                          <>
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => onVerificationChange(pharmacy, 'VERIFIED')}>Approve</button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => onVerificationChange(pharmacy, 'REJECTED')}>Reject</button>
                          </>
                        )}
                        {pharmacy.verification_status === 'VERIFIED' && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => onVerificationChange(pharmacy, 'SUSPENDED')}>Suspend</button>
                        )}
                        {(pharmacy.verification_status === 'REJECTED' || pharmacy.verification_status === 'SUSPENDED') && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => onVerificationChange(pharmacy, 'VERIFIED')}>Restore</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {isAnalyticsPage && (
        <PlatformAnalyticsHeatmap
          pharmacies={pharmacies}
          auditLogs={auditEvents}
          onVerifyPharmacy={onVerificationChange}
        />
      )}

      {!isAuditPage && !isAnalyticsPage && <div className="admin-insight-grid">
        <div className="admin-panel">
          <h2>Verification queue</h2>
          <p>Pending applications are surfaced first for license and business-detail review.</p>
          <strong className="admin-insight-number">{counts.PENDING}</strong>
          <span className="admin-insight-label">applications awaiting review</span>
        </div>
        <div className="admin-panel">
          <h2>Network coverage</h2>
          <p>Verified pharmacies currently eligible to receive marketplace orders.</p>
          <strong className="admin-insight-number">{counts.VERIFIED}</strong>
          <span className="admin-insight-label">active verified partners</span>
        </div>
        <div className="admin-panel">
          <h2>Audit readiness</h2>
          <p>All onboarding and pharmacy changes are recorded through the platform audit trail.</p>
          <strong className="admin-insight-number">{auditEvents.length}</strong>
          <span className="admin-insight-label">recent events loaded</span>
        </div>
      </div>}

      {(!isAnalyticsPage || isAuditPage) && <div className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h2>Recent audit activity</h2>
            <p>Verification and onboarding events across the pharmacy network.</p>
          </div>
        </div>
        {auditEvents.length === 0 ? (
          <div className="admin-empty-state">No audit events recorded yet.</div>
        ) : (
          <div className="admin-audit-list">
            {auditEvents.slice(0, 8).map((event) => (
              <div className="admin-audit-item" key={event.id}>
                <span className="admin-audit-dot" />
                <div>
                  <strong>{event.event_type.replaceAll('_', ' ')}</strong>
                  <small>{event.entity_type} · {new Date(event.created_at).toLocaleString()}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      {isAnalyticsPage && (
        <div className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h2>Operational indicators</h2>
              <p>Current demo-network indicators sourced from pharmacy onboarding records.</p>
            </div>
          </div>
          <div className="admin-insight-grid">
            <div><strong className="admin-insight-number">{counts.VERIFIED}</strong><span className="admin-insight-label">verified pharmacies receiving orders</span></div>
            <div><strong className="admin-insight-number">{counts.PENDING}</strong><span className="admin-insight-label">applications awaiting review</span></div>
            <div><strong className="admin-insight-number">{auditEvents.length}</strong><span className="admin-insight-label">audit events in current activity window</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlatformOperationsDashboard;
