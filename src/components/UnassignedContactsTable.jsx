import React, { useState, useMemo, useEffect } from 'react';

/**
 * UnassignedContactsTable - Table view for unassigned contacts with deadline countdown
 * Displays contacts in a sortable, filterable table with deadline urgency indicators
 */
const UnassignedContactsTable = ({
    conversations = [],
    onSelectConversation,
    onAssign,
    users = [],
    responseDeadlineHours = 24
}) => {
    const [sortBy, setSortBy] = useState('deadline'); // deadline, name, lastActivity
    const [sortOrder, setSortOrder] = useState('asc');
    const [filterScore, setFilterScore] = useState('all'); // all, hot, warm, cold
    const [filterUnread, setFilterUnread] = useState(false);
    const [now, setNow] = useState(new Date());

    // Update "now" every minute for countdown refresh
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Calculate deadline info for a conversation
    const getDeadlineInfo = (conv) => {
        if (!conv.last_message_time) {
            return { msLeft: Infinity, text: 'No activity', status: 'unknown' };
        }

        const lastActivity = new Date(conv.last_message_time);
        const deadlineMs = responseDeadlineHours * 60 * 60 * 1000;
        const deadline = new Date(lastActivity.getTime() + deadlineMs);
        const msLeft = deadline.getTime() - now.getTime();
        const percentLeft = (msLeft / deadlineMs) * 100;

        let status = 'ok';
        if (msLeft <= 0) {
            status = 'overdue';
        } else if (percentLeft <= 10) {
            status = 'critical';
        } else if (percentLeft <= 50) {
            status = 'warning';
        }

        // Format time remaining
        let text;
        if (msLeft <= 0) {
            const hoursOverdue = Math.abs(Math.floor(msLeft / (1000 * 60 * 60)));
            const minsOverdue = Math.abs(Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)));
            text = `⚠️ ${hoursOverdue}h ${minsOverdue}m overdue`;
        } else {
            const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
            const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
            text = `${hoursLeft}h ${minsLeft}m left`;
        }

        return { msLeft, text, status, percentLeft };
    };

    // Get AI score from conversation
    const getAIScore = (conv) => {
        const score = conv.ai_analysis?.leadScore?.score ||
            conv.ai_analysis?.score ||
            'warm';
        return score.toLowerCase();
    };

    // Format time since last activity
    const formatTimeSince = (timestamp) => {
        if (!timestamp) return 'Never';
        const diff = now - new Date(timestamp);
        const mins = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    // Filter unassigned conversations only
    const unassignedConversations = useMemo(() => {
        return conversations.filter(conv => !conv.assigned_to && !conv.linked_client_id);
    }, [conversations]);

    // Apply filters and sorting
    const filteredAndSorted = useMemo(() => {
        let result = [...unassignedConversations];

        // Filter by AI score
        if (filterScore !== 'all') {
            result = result.filter(conv => getAIScore(conv) === filterScore);
        }

        // Filter by unread
        if (filterUnread) {
            result = result.filter(conv => conv.unread_count > 0);
        }

        // Sort
        result.sort((a, b) => {
            let comparison = 0;

            switch (sortBy) {
                case 'deadline':
                    comparison = getDeadlineInfo(a).msLeft - getDeadlineInfo(b).msLeft;
                    break;
                case 'name':
                    comparison = (a.participant_name || 'Unknown').localeCompare(b.participant_name || 'Unknown');
                    break;
                case 'lastActivity':
                    comparison = new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0);
                    break;
                default:
                    break;
            }

            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [unassignedConversations, filterScore, filterUnread, sortBy, sortOrder, now]);

    // Handle sort column click
    const handleSort = (column) => {
        if (sortBy === column) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    // Score badge component
    const ScoreBadge = ({ score }) => {
        const config = {
            hot: { emoji: '🔥', bg: '#ef4444', text: 'Hot' },
            warm: { emoji: '🌡️', bg: '#f59e0b', text: 'Warm' },
            cold: { emoji: '❄️', bg: '#3b82f6', text: 'Cold' }
        };
        const cfg = config[score] || config.warm;

        return (
            <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.5rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: '500',
                background: cfg.bg,
                color: 'white'
            }}>
                {cfg.emoji} {cfg.text}
            </span>
        );
    };

    // Deadline badge component
    const DeadlineBadge = ({ info }) => {
        const colors = {
            ok: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: '#22c55e' },
            warning: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: '#f59e0b' },
            critical: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: '#ef4444' },
            overdue: { bg: '#ef4444', text: 'white', border: '#ef4444' },
            unknown: { bg: 'var(--bg-tertiary)', text: 'var(--text-muted)', border: 'var(--border-color)' }
        };
        const cfg = colors[info.status] || colors.unknown;

        return (
            <span style={{
                display: 'inline-block',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: '500',
                background: cfg.bg,
                color: cfg.text,
                border: `1px solid ${cfg.border}`
            }}>
                {info.text}
            </span>
        );
    };

    return (
        <div style={{
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            overflow: 'hidden'
        }}>
            {/* Filters */}
            <div style={{
                display: 'flex',
                gap: '1rem',
                padding: '1rem',
                borderBottom: '1px solid var(--border-color)',
                flexWrap: 'wrap',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>AI Score:</label>
                    <select
                        value={filterScore}
                        onChange={(e) => setFilterScore(e.target.value)}
                        className="form-input"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem', minWidth: '100px' }}
                    >
                        <option value="all">All</option>
                        <option value="hot">🔥 Hot</option>
                        <option value="warm">🌡️ Warm</option>
                        <option value="cold">❄️ Cold</option>
                    </select>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={filterUnread}
                        onChange={(e) => setFilterUnread(e.target.checked)}
                    />
                    Unread only
                </label>

                <div style={{ marginLeft: 'auto', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {filteredAndSorted.length} unassigned contacts
                </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-secondary)' }}>
                            <th
                                onClick={() => handleSort('name')}
                                style={{
                                    padding: '0.75rem 1rem',
                                    textAlign: 'left',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    color: 'var(--text-muted)',
                                    textTransform: 'uppercase',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    borderBottom: '1px solid var(--border-color)'
                                }}
                            >
                                Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th style={{
                                padding: '0.75rem 1rem',
                                textAlign: 'left',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                borderBottom: '1px solid var(--border-color)'
                            }}>
                                AI Score
                            </th>
                            <th style={{
                                padding: '0.75rem 1rem',
                                textAlign: 'left',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                borderBottom: '1px solid var(--border-color)'
                            }}>
                                Last Message
                            </th>
                            <th
                                onClick={() => handleSort('lastActivity')}
                                style={{
                                    padding: '0.75rem 1rem',
                                    textAlign: 'left',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    color: 'var(--text-muted)',
                                    textTransform: 'uppercase',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    borderBottom: '1px solid var(--border-color)'
                                }}
                            >
                                Time Since {sortBy === 'lastActivity' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                                onClick={() => handleSort('deadline')}
                                style={{
                                    padding: '0.75rem 1rem',
                                    textAlign: 'left',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    color: 'var(--text-muted)',
                                    textTransform: 'uppercase',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    borderBottom: '1px solid var(--border-color)'
                                }}
                            >
                                Deadline {sortBy === 'deadline' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th style={{
                                padding: '0.75rem 1rem',
                                textAlign: 'right',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                borderBottom: '1px solid var(--border-color)'
                            }}>
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAndSorted.length === 0 ? (
                            <tr>
                                <td colSpan="6" style={{
                                    padding: '3rem',
                                    textAlign: 'center',
                                    color: 'var(--text-muted)'
                                }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
                                    <div>No unassigned contacts</div>
                                    <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                                        All contacts are assigned or in the pipeline
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredAndSorted.map((conv) => {
                                const deadlineInfo = getDeadlineInfo(conv);
                                const aiScore = getAIScore(conv);

                                return (
                                    <tr
                                        key={conv.conversation_id}
                                        onClick={() => onSelectConversation?.(conv)}
                                        style={{
                                            cursor: 'pointer',
                                            borderBottom: '1px solid var(--border-color)',
                                            transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{
                                                    width: '36px',
                                                    height: '36px',
                                                    borderRadius: '50%',
                                                    background: 'var(--primary)',
                                                    color: 'white',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '0.875rem',
                                                    fontWeight: '600'
                                                }}>
                                                    {(conv.participant_name || 'U')[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                                                        {conv.participant_name || 'Unknown'}
                                                    </div>
                                                    {conv.unread_count > 0 && (
                                                        <span style={{
                                                            display: 'inline-block',
                                                            background: 'var(--error)',
                                                            color: 'white',
                                                            fontSize: '0.625rem',
                                                            padding: '0.125rem 0.375rem',
                                                            borderRadius: '999px',
                                                            marginTop: '0.25rem'
                                                        }}>
                                                            {conv.unread_count} unread
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <ScoreBadge score={aiScore} />
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{
                                                maxWidth: '200px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                fontSize: '0.875rem',
                                                color: 'var(--text-secondary)'
                                            }}>
                                                {conv.last_message_text || 'No messages'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                                {formatTimeSince(conv.last_message_time)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <DeadlineBadge info={deadlineInfo} />
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectConversation?.(conv);
                                                }}
                                                className="btn btn-sm btn-secondary"
                                                style={{ marginRight: '0.5rem' }}
                                            >
                                                💬 View
                                            </button>
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

export default UnassignedContactsTable;
