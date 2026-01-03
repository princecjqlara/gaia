import React, { useMemo } from 'react';
import { getPackageInfo, formatPrice } from '../utils/clients';

const ClientsTable = ({ clients, filters, onViewClient, onEditClient, onMoveClient }) => {
  // Apply filters
  const filteredClients = useMemo(() => {
    let filtered = [...clients];

    // Search filter
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(client => {
        const searchable = [
          client.clientName,
          client.businessName,
          client.contactDetails,
          ...(client.tags || [])
        ].join(' ').toLowerCase();
        return searchable.includes(term);
      });
    }

    // Phase filter
    if (filters.filterPhase) {
      filtered = filtered.filter(c => c.phase === filters.filterPhase);
    }

    // Package filter
    if (filters.filterPackage) {
      filtered = filtered.filter(c => c.package === filters.filterPackage);
    }

    // Payment filter
    if (filters.filterPayment) {
      filtered = filtered.filter(c => c.paymentStatus === filters.filterPayment);
    }

    // Sort by priority, then by name
    filtered.sort((a, b) => {
      const priorityDiff = (a.priority || 999) - (b.priority || 999);
      if (priorityDiff !== 0) return priorityDiff;
      return (a.clientName || '').localeCompare(b.clientName || '');
    });

    return filtered;
  }, [clients, filters]);

  const getPhaseConfig = (phase) => {
    const configs = {
      'booked': { emoji: '📅', title: 'Booked', color: 'var(--phase-booked)' },
      'follow-up': { emoji: '📞', title: 'Follow Up', color: 'var(--text-muted)' },
      'preparing': { emoji: '⏳', title: 'Preparing', color: 'var(--phase-preparing)' },
      'testing': { emoji: '🧪', title: 'Testing', color: 'var(--phase-testing)' },
      'running': { emoji: '🚀', title: 'Running', color: 'var(--phase-running)' }
    };
    return configs[phase] || { emoji: '❓', title: phase, color: 'var(--text-muted)' };
  };

  const getPaymentIcon = (status) => {
    const icons = {
      'paid': '✅',
      'partial': '⚠️',
      'unpaid': '❌'
    };
    return icons[status] || '❓';
  };

  const handlePhaseChange = (clientId, newPhase) => {
    if (onMoveClient) {
      onMoveClient(clientId, newPhase);
    }
  };

  return (
    <div className="clients-table-container">
      <div className="table-responsive">
        <table className="data-table clients-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>Priority</th>
              <th>Client Name</th>
              <th>Business</th>
              <th>Package</th>
              <th>Phase</th>
              <th>Payment Status</th>
              <th>Payment Schedule</th>
              <th>Assigned To</th>
              <th>Months</th>
              <th style={{ width: '120px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No clients found matching your filters
                </td>
              </tr>
            ) : (
              filteredClients.map(client => {
                const pkg = getPackageInfo(client);
                const phaseConfig = getPhaseConfig(client.phase);
                const paymentIcon = getPaymentIcon(client.paymentStatus);

                return (
                  <tr key={client.id} className="client-table-row">
                    <td>
                      <span className="priority-badge" style={{ 
                        background: client.priority === 1 ? 'var(--danger)' : 
                                   client.priority === 2 ? 'var(--warning)' : 
                                   'var(--text-muted)',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}>
                        {client.priority || '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '500' }}>{client.clientName || '—'}</div>
                    </td>
                    <td>{client.businessName || '—'}</td>
                    <td>
                      <span className={`package-badge package-${client.package}`} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}>
                        {pkg.emoji} {formatPrice(pkg.price)}
                      </span>
                    </td>
                    <td>
                      <select
                        className="form-select"
                        value={client.phase || 'booked'}
                        onChange={(e) => {
                          e.stopPropagation();
                          handlePhaseChange(client.id, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{ 
                          minWidth: '140px',
                          fontSize: '0.875rem',
                          padding: '0.375rem 0.5rem',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="booked">📅 Booked</option>
                        <option value="follow-up">📞 Follow Up</option>
                        <option value="preparing">⏳ Preparing</option>
                        <option value="testing">🧪 Testing</option>
                        <option value="running">🚀 Running</option>
                      </select>
                    </td>
                    <td>
                      <span style={{ 
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        {paymentIcon} {client.paymentStatus || 'unpaid'}
                      </span>
                    </td>
                    <td>{client.paymentSchedule || '—'}</td>
                    <td>{client.assignedTo || '—'}</td>
                    <td>
                      {client.monthsWithClient > 0 ? (
                        <span>{client.monthsWithClient}mo</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => onViewClient(client.id)}
                          title="View Client"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          👁️
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => onEditClient(client.id)}
                          title="Edit Client"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          ✏️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClientsTable;

