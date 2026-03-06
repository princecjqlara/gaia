import React, { useMemo, useState } from 'react';

/**
 * UnassignedClientsPanel - Shows clients without assigned users
 * Allows assigning clients to team members
 */
const UnassignedClientsPanel = ({ clients, users, onAssign, onViewClient, onEditClient }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [assigningClient, setAssigningClient] = useState(null);

    // Filter unassigned clients
    const unassignedClients = useMemo(() => {
        return clients.filter(client => !client.assignedTo && !client.assignedUser);
    }, [clients]);

    // Handle assignment
    const handleAssign = async (clientId, userId) => {
        if (onAssign) {
            await onAssign(clientId, userId);
        }
        setAssigningClient(null);
    };

    return (
        <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: unassignedClients.length > 0 ? '1px solid var(--warning)' : '1px solid var(--border-color)',
            overflow: 'hidden',
            flex: 1
        }}>
            {/* Header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '0.75rem 1rem',
                    background: unassignedClients.length > 0 ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    borderBottom: isExpanded && unassignedClients.length > 0 ? '1px solid var(--border-color)' : 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>👤</span>
                    <h4 style={{ margin: 0, color: unassignedClients.length > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
                        Unassigned Clients
                    </h4>
                    <span style={{
                        background: unassignedClients.length > 0 ? 'var(--warning)' : 'var(--success)',
                        color: 'white',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                    }}>
                        {unassignedClients.length > 0 ? unassignedClients.length : '✓'}
                    </span>
                </div>
                <span style={{ color: 'var(--text-muted)' }}>
                    {isExpanded ? '▲' : '▼'}
                </span>
            </div>

            {/* Content */}
            {isExpanded && (
                unassignedClients.length === 0 ? (
                    <div style={{
                        padding: '1rem',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '0.875rem'
                    }}>
                        ✅ All clients are assigned
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', maxHeight: '300px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-tertiary)', zIndex: 1 }}>
                                <tr>
                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Client</th>
                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Phase</th>
                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Created</th>
                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Assign To</th>
                                </tr>
                            </thead>
                            <tbody>
                                {unassignedClients.map(client => (
                                    <tr
                                        key={client.id}
                                        style={{
                                            borderBottom: '1px solid var(--border-color)'
                                        }}
                                    >
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div>
                                                <span style={{ fontWeight: '500' }}>{client.clientName || '—'}</span>
                                                {client.businessName && (
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {client.businessName}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <span style={{
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                background: 'var(--bg-tertiary)'
                                            }}>
                                                {client.phase === 'evaluated' && '✅ Evaluated'}
                                                {client.phase === 'booked' && '📅 Booked'}
                                                {!['evaluated', 'booked'].includes(client.phase) && (client.phase || '—')}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {client.createdAt || client.created_at
                                                ? new Date(client.createdAt || client.created_at).toLocaleDateString()
                                                : '—'
                                            }
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            {assigningClient === client.id ? (
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    {users.map(user => (
                                                        <button
                                                            key={user.id}
                                                            className="btn btn-sm btn-secondary"
                                                            onClick={() => handleAssign(client.id, user.id)}
                                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                                                        >
                                                            {user.name || user.email?.split('@')[0]}
                                                        </button>
                                                    ))}
                                                    <button
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={() => setAssigningClient(null)}
                                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        className="btn btn-sm btn-primary"
                                                        onClick={() => setAssigningClient(client.id)}
                                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                    >
                                                        👤 Assign
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => onViewClient(client.id)}
                                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                    >
                                                        👁️
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}
        </div>
    );
};

export default UnassignedClientsPanel;
