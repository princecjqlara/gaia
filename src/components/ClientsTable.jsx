import React, { useMemo, useState, useEffect } from 'react';
import CustomColumnModal from './CustomColumnModal';


const ClientsTable = ({ clients, filters, onViewClient, onEditClient, onMoveClient, onUpdateClient }) => {
  // Column management state
  const [availableColumns] = useState(() => {
    // Default columns with their IDs, labels, and render functions
    return [
      {
        id: 'priority',
        label: 'Priority',
        type: 'system',
        width: '40px',
        renderHeader: () => 'Priority',
        renderCell: (client) => (
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
        )
      },
      {
        id: 'clientName',
        label: 'Client Name',
        type: 'system',
        renderHeader: () => 'Client Name',
        renderCell: (client) => (
          <div style={{ fontWeight: '500' }}>{client.clientName || '—'}</div>
        )
      },
      {
        id: 'businessName',
        label: 'Business',
        type: 'system',
        renderHeader: () => 'Business',
        renderCell: (client) => client.businessName || '—'
      },
      {
        id: 'phase',
        label: 'Phase',
        type: 'system',
        renderHeader: () => 'Phase',
        renderCell: (client) => {
          return (
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
          );
        }
      },
      {
        id: 'lastActivity',
        label: 'Last Activity',
        type: 'system',
        width: '100px',
        renderHeader: () => '⏰ Last Activity',
        renderCell: (client) => {
          const lastActivityInfo = getLastActivityInfo(client);
          return (
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
          );
        }
      },
      {
        id: 'assignedTo',
        label: 'Assigned To',
        type: 'system',
        renderHeader: () => 'Assigned To',
        renderCell: (client) => client.assignedUser?.name || client.assignedUser?.email || client.assignedTo || '—'
      },
      {
        id: 'actions',
        label: 'Actions',
        type: 'system',
        width: '100px',
        renderHeader: () => 'Actions',
        renderCell: (client) => (
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
        )
      }
    ];
  });

  const [visibleColumns, setVisibleColumns] = useState(() => {
    // Load from localStorage or default to all system columns
    try {
      const saved = localStorage.getItem('gaia_table_columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate: ensure it's an array of IDs
        if (Array.isArray(parsed)) {
          // Filter out any IDs that don't exist in availableColumns
          const validIds = parsed.filter(id => 
            availableColumns.some(col => col.id === id) || 
            id.startsWith('custom_')
          );
          return validIds;
        }
      }
    } catch (err) {
      console.error('Error loading column preferences:', err);
    }
    // Default: all system columns
    return availableColumns.filter(col => col.type === 'system').map(col => col.id);
  });

  // Custom columns from localStorage
  const [customColumns, setCustomColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('gaia_custom_columns');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.error('Error loading custom columns:', err);
    }
    return [];
  });

  // Modal states
  const [showCustomColumnModal, setShowCustomColumnModal] = useState(false);
  const [editingColumn, setEditingColumn] = useState(null);

  // Save column preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('gaia_table_columns', JSON.stringify(visibleColumns));
    } catch (err) {
      console.error('Error saving column preferences:', err);
    }
  }, [visibleColumns]);

  // Save custom columns to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('gaia_custom_columns', JSON.stringify(customColumns));
    } catch (err) {
      console.error('Error saving custom columns:', err);
    }
  }, [customColumns]);

  // Combine system and custom columns
  const allColumns = useMemo(() => {
    const combined = [...availableColumns];
    
    // Add custom columns
    customColumns.forEach(customCol => {
      combined.push({
        id: customCol.id,
        label: customCol.name,
        type: 'custom',
        dataType: customCol.dataType,
        options: customCol.options,
        width: customCol.width || 'auto',
        renderHeader: () => customCol.name,
        renderCell: (client) => {
          const value = client.customData?.[customCol.id] ?? '';
          
          switch (customCol.dataType) {
            case 'dropdown':
              return (
                <select
                  className="form-select"
                  value={value}
                  onChange={(e) => handleCustomFieldChange(client, customCol.id, e.target.value, customCol.dataType)}
                  style={{
                    fontSize: '0.875rem',
                    padding: '0.375rem 0.5rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    minWidth: '120px'
                  }}
                >
                  <option value="">Select...</option>
                  {customCol.options?.map((option, idx) => (
                    <option key={idx} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              );
            
            case 'number':
              return (
                <input
                  type="number"
                  value={value}
                  onChange={(e) => handleCustomFieldChange(client, customCol.id, e.target.value, customCol.dataType)}
                  style={{
                    fontSize: '0.875rem',
                    padding: '0.375rem 0.5rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    width: '100px'
                  }}
                />
              );
            
            case 'price':
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span>$</span>
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => handleCustomFieldChange(client, customCol.id, e.target.value, customCol.dataType)}
                    style={{
                      fontSize: '0.875rem',
                      padding: '0.375rem 0.5rem',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      width: '90px'
                    }}
                  />
                </div>
              );
            
            case 'short-text':
            default:
              return (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleCustomFieldChange(client, customCol.id, e.target.value, customCol.dataType)}
                  style={{
                    fontSize: '0.875rem',
                    padding: '0.375rem 0.5rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    minWidth: '120px'
                  }}
                />
              );
          }
        }
      });
    });
    
    return combined;
  }, [availableColumns, customColumns]);
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

  const handlePhaseChange = (clientId, newPhase) => {
    if (onMoveClient) {
      onMoveClient(clientId, newPhase);
    }
  };

  const handleCustomFieldChange = (client, fieldId, value, dataType) => {
    if (!onUpdateClient) {
      console.warn('onUpdateClient not provided for custom column updates');
      return;
    }

    let normalizedValue = value;
    if ((dataType === 'number' || dataType === 'price') && value !== '') {
      const parsed = Number(value);
      normalizedValue = Number.isNaN(parsed) ? value : parsed;
    }

    const nextCustomData = {
      ...(client.customData || {}),
      [fieldId]: normalizedValue
    };

    onUpdateClient(client.id, { customData: nextCustomData });
  };

  const handleAddCustomColumn = (columnData) => {
    const newColumn = {
      id: columnData.id,
      name: columnData.name,
      dataType: columnData.dataType,
      width: columnData.width,
      options: columnData.options
    };

    setCustomColumns(prev => {
      const newColumns = [...prev];
      // If editing, replace the column
      if (editingColumn) {
        const index = newColumns.findIndex(col => col.id === editingColumn.id);
        if (index !== -1) {
          newColumns[index] = newColumn;
        }
      } else {
        newColumns.push(newColumn);
      }
      return newColumns;
    });

    // Add to visible columns
    setVisibleColumns(prev => {
      if (!prev.includes(columnData.id)) {
        return [...prev, columnData.id];
      }
      return prev;
    });

    setEditingColumn(null);
  };

  const handleEditColumn = (columnId) => {
    const column = customColumns.find(col => col.id === columnId);
    if (column) {
      setEditingColumn(column);
      setShowCustomColumnModal(true);
    }
  };

  const handleDeleteColumn = (columnId) => {
    if (!window.confirm('Are you sure you want to delete this column? This will also remove all data for this column.')) {
      return;
    }

    setCustomColumns(prev => prev.filter(col => col.id !== columnId));
    setVisibleColumns(prev => prev.filter(id => id !== columnId));

    if (onUpdateClient) {
      clients.forEach(client => {
        if (client.customData && Object.prototype.hasOwnProperty.call(client.customData, columnId)) {
          const { [columnId]: _removed, ...rest } = client.customData;
          onUpdateClient(client.id, { customData: rest });
        }
      });
    }
  };

  const handleToggleColumn = (columnId) => {
    setVisibleColumns(prev => {
      if (prev.includes(columnId)) {
        return prev.filter(id => id !== columnId);
      } else {
        return [...prev, columnId];
      }
    });
  };

  // Get filtered columns based on visibleColumns
  const filteredColumns = useMemo(() => {
    return allColumns.filter(col => visibleColumns.includes(col.id));
  }, [allColumns, visibleColumns]);

  return (
    <div className="clients-table-container">
      {/* Column Management Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        padding: '0.75rem',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ fontWeight: '500', fontSize: '0.875rem' }}>
          Columns: {filteredColumns.length} visible
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {/* Column Toggles */}
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {allColumns.map(col => (
              <button
                key={col.id}
                className={`btn btn-sm ${visibleColumns.includes(col.id) ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleToggleColumn(col.id)}
                title={`${col.label} - ${visibleColumns.includes(col.id) ? 'Hide' : 'Show'}`}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                {col.type === 'custom' && '📋'}
                {visibleColumns.includes(col.id) ? '✓' : '✗'} {col.label}
              </button>
            ))}
          </div>

          {/* Custom Column Actions */}
          <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem' }}>
            <button
              className="btn btn-sm btn-success"
              onClick={() => {
                setEditingColumn(null);
                setShowCustomColumnModal(true);
              }}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            >
              ➕ Add Custom
            </button>
          </div>
        </div>
      </div>

      {/* Custom Columns List */}
      {customColumns.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: '500', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            Custom Columns:
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {customColumns.map(col => (
              <div
                key={col.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.375rem 0.75rem',
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${visibleColumns.includes(col.id) ? 'var(--primary)' : 'var(--border-color)'}`,
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.75rem'
                }}
              >
                <span>📋</span>
                <span>{col.name}</span>
                <span style={{ color: 'var(--text-muted)' }}>({col.dataType})</span>
                <button
                  className="btn btn-sm"
                  onClick={() => handleEditColumn(col.id)}
                  title="Edit"
                  style={{ padding: '0.125rem', fontSize: '0.625rem' }}
                >
                  ✏️
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => handleDeleteColumn(col.id)}
                  title="Delete"
                  style={{ padding: '0.125rem', fontSize: '0.625rem', color: 'var(--danger)' }}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table className="data-table clients-table">
          <thead>
            <tr>
              {filteredColumns.map(col => (
                <th 
                  key={col.id}
                  style={{ 
                    width: col.width || 'auto',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{col.renderHeader()}</span>
                    {col.type === 'custom' && (
                      <button
                        className="btn btn-sm"
                        onClick={() => handleEditColumn(col.id)}
                        title="Edit Column"
                        style={{ 
                          padding: '0.125rem',
                          fontSize: '0.625rem',
                          opacity: 0.5,
                          marginLeft: '0.25rem'
                        }}
                      >
                        ✎
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan={filteredColumns.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No clients found matching your filters
                </td>
              </tr>
            ) : (
              filteredClients.map(client => (
                <tr key={client.id} className="client-table-row">
                  {filteredColumns.map(col => (
                    <td key={col.id}>
                      {col.renderCell(client)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Custom Column Modal */}
      <CustomColumnModal
        isOpen={showCustomColumnModal}
        onClose={() => {
          setShowCustomColumnModal(false);
          setEditingColumn(null);
        }}
        onSubmit={handleAddCustomColumn}
        existingColumn={editingColumn}
      />
    </div>
  );
};

export default ClientsTable;

