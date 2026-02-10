import React, { useMemo, useState, useEffect } from 'react';


const ClientsTable = ({ clients, filters, onViewClient, onEditClient, onMoveClient }) => {
  // Calculate simple last activity indicator for a client
  const getLastActivityInfo = (client) => {
    const lastActivityDate = client.lastActivity ? new Date(client.lastActivity) :
      client.created_at ? new Date(client.created_at) : null;

    if (!lastActivityDate) {
      return { text: '—', color: 'var(--text-muted)' };
    }

    const now = new Date();
    const hoursSinceActivity = (now - lastActivityDate) / (1000 * 60 * 60);

    if (hoursSinceActivity < 24) {
      return {
        text: `${Math.floor(hoursSinceActivity)}h ago`,
        color: 'var(--success)'
      };
    } else if (hoursSinceActivity < 168) { // 7 days
      return {
        text: `${Math.floor(hoursSinceActivity / 24)}d ago`,
        color: 'var(--text-muted)'
      };
    } else {
      return {
        text: `${Math.floor(hoursSinceActivity / 24)}d ago`,
        color: 'var(--text-secondary)'
      };
    }
  };

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

    // Assigned To filter
    if (filters.filterAssignedTo) {
      if (filters.filterAssignedTo === 'unassigned') {
        filtered = filtered.filter(c => !c.assignedTo);
      } else {
        filtered = filtered.filter(c => c.assignedTo === filters.filterAssignedTo);
      }
    }

    // Sort by priority, then name
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
               <th>Phase</th>
               <th style={{ width: '100px' }}>⏰ Last Activity</th>
               <th>Assigned To</th>
               <th style={{ width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 ? (
              <tr>
                 <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No clients found matching your filters
                </td>
              </tr>
            ) : (
               filteredClients.map(client => {
                const phaseConfig = getPhaseConfig(client.phase);
                const lastActivityInfo = getLastActivityInfo(client);

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
                         padding: '0.25rem 0.5rem',
                         borderRadius: '4px',
                         fontSize: '0.75rem',
                         fontWeight: '600',
                         color: lastActivityInfo.color,
                         background: `${lastActivityInfo.color}20`
                       }}>
                         {lastActivityInfo.text}
                       </span>
                    </td>

                    <td>{client.assignedUser?.name || client.assignedUser?.email || client.assignedTo || '—'}</td>
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

