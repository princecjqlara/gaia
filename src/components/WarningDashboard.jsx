import React, { useState, useMemo } from 'react';

/**
 * WarningDashboard - Shows a comprehensive list of contacts needing attention
 * Categories: Critical, Warning, Unassigned, Awaiting Reply, No Tags
 */
const WarningDashboard = ({
    conversations = [],
    onSelectConversation,
    onClose,
    warningSettings
}) => {
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [sortBy, setSortBy] = useState('time'); // time, name

    // Default settings if not provided
    const settings = warningSettings || {
        warning_hours: 24,
        danger_hours: 48,
        warning_color: '#f59e0b',
        danger_color: '#ef4444',
        enable_no_activity_warning: true,
        enable_no_tag_warning: true,
        enable_proposal_stuck_warning: true,
        enable_unassigned_warning: true,
        enable_awaiting_reply_warning: true
    };

    // Categorize all conversations
    const categorizedConversations = useMemo(() => {
        const now = new Date();
        const categories = {
            critical: [],
            warning: [],
            unassigned: [],
            awaiting_reply: [],
            no_tags: [],
            ok: []
        };

        conversations.forEach(conv => {
            const lastActivity = conv.last_message_time ? new Date(conv.last_message_time) : null;
            const hoursSinceActivity = lastActivity ? (now - lastActivity) / (1000 * 60 * 60) : Infinity;

            const issues = [];

            // Check critical (overdue)
            if (settings.enable_no_activity_warning && hoursSinceActivity >= settings.danger_hours) {
                issues.push({ type: 'critical', reason: `No activity for ${Math.floor(hoursSinceActivity)}h` });
            }
            // Check warning (delayed)
            else if (settings.enable_no_activity_warning && hoursSinceActivity >= settings.warning_hours) {
                issues.push({ type: 'warning', reason: `Inactive for ${Math.floor(hoursSinceActivity)}h` });
            }

            // Check unassigned
            if (settings.enable_unassigned_warning !== false && !conv.assigned_to) {
                issues.push({ type: 'unassigned', reason: 'Not assigned to any user' });
            }

            // Check awaiting reply (customer sent last message and has unread)
            if (settings.enable_awaiting_reply_warning !== false &&
                !conv.last_message_from_page &&
                conv.unread_count > 0) {
                issues.push({ type: 'awaiting_reply', reason: 'Customer awaiting your reply' });
            }

            // Check no tags
            if (settings.enable_no_tag_warning && (!conv.tags || conv.tags.length === 0)) {
                issues.push({ type: 'no_tags', reason: 'No tags assigned' });
            }

            // Check stuck proposal
            if (settings.enable_proposal_stuck_warning &&
                conv.proposal_status === 'sent' &&
                hoursSinceActivity > settings.warning_hours) {
                issues.push({ type: 'warning', reason: 'Proposal sent but no response' });
            }

            // Add to appropriate categories
            const convWithIssues = { ...conv, issues, hoursSinceActivity };

            if (issues.some(i => i.type === 'critical')) {
                categories.critical.push(convWithIssues);
            } else if (issues.some(i => i.type === 'warning')) {
                categories.warning.push(convWithIssues);
            }

            if (issues.some(i => i.type === 'unassigned')) {
                categories.unassigned.push(convWithIssues);
            }
            if (issues.some(i => i.type === 'awaiting_reply')) {
                categories.awaiting_reply.push(convWithIssues);
            }
            if (issues.some(i => i.type === 'no_tags')) {
                categories.no_tags.push(convWithIssues);
            }

            if (issues.length === 0) {
                categories.ok.push(convWithIssues);
            }
        });

        // Sort each category
        const sortFn = sortBy === 'name'
            ? (a, b) => (a.participant_name || '').localeCompare(b.participant_name || '')
            : (a, b) => b.hoursSinceActivity - a.hoursSinceActivity;

        Object.keys(categories).forEach(key => {
            categories[key].sort(sortFn);
        });

        return categories;
    }, [conversations, settings, sortBy]);

    // Get conversations for selected category
    const displayConversations = useMemo(() => {
        if (selectedCategory === 'all') {
            // Combine all issues (no duplicates)
            const allWithIssues = conversations.filter(conv => {
                const found = categorizedConversations.critical.find(c => c.id === conv.id) ||
                    categorizedConversations.warning.find(c => c.id === conv.id) ||
                    categorizedConversations.unassigned.find(c => c.id === conv.id) ||
                    categorizedConversations.awaiting_reply.find(c => c.id === conv.id) ||
                    categorizedConversations.no_tags.find(c => c.id === conv.id);
                return found;
            }).map(conv => {
                const found = categorizedConversations.critical.find(c => c.id === conv.id) ||
                    categorizedConversations.warning.find(c => c.id === conv.id) ||
                    categorizedConversations.unassigned.find(c => c.id === conv.id) ||
                    categorizedConversations.awaiting_reply.find(c => c.id === conv.id) ||
                    categorizedConversations.no_tags.find(c => c.id === conv.id);
                return found || conv;
            });
            return allWithIssues;
        }
        return categorizedConversations[selectedCategory] || [];
    }, [selectedCategory, categorizedConversations, conversations]);

    const categoryTabs = [
        {
            key: 'all', label: '📋 All Issues', count: new Set([
                ...categorizedConversations.critical,
                ...categorizedConversations.warning,
                ...categorizedConversations.unassigned,
                ...categorizedConversations.awaiting_reply,
                ...categorizedConversations.no_tags
            ].map(c => c.id)).size
        },
        { key: 'critical', label: '🔴 Critical', count: categorizedConversations.critical.length, color: settings.danger_color },
        { key: 'warning', label: '🟠 Warning', count: categorizedConversations.warning.length, color: settings.warning_color },
        { key: 'awaiting_reply', label: '💬 Awaiting Reply', count: categorizedConversations.awaiting_reply.length, color: '#3b82f6' },
        { key: 'unassigned', label: '👤 Unassigned', count: categorizedConversations.unassigned.length, color: '#8b5cf6' },
        { key: 'no_tags', label: '🏷️ No Tags', count: categorizedConversations.no_tags.length, color: '#6b7280' },
    ];

    return (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
            <div className="modal" style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>⚠️ Warning Dashboard</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                {/* Category Tabs */}
                <div style={{
                    display: 'flex',
                    gap: '0.25rem',
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid var(--border-color)',
                    overflowX: 'auto',
                    flexShrink: 0
                }}>
                    {categoryTabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setSelectedCategory(tab.key)}
                            style={{
                                padding: '0.5rem 0.75rem',
                                borderRadius: 'var(--radius-md)',
                                border: 'none',
                                background: selectedCategory === tab.key
                                    ? (tab.color || 'var(--primary)')
                                    : 'var(--bg-secondary)',
                                color: selectedCategory === tab.key ? 'white' : 'var(--text-primary)',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: '500',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            {tab.label}
                            {tab.count > 0 && (
                                <span style={{
                                    background: selectedCategory === tab.key ? 'rgba(255,255,255,0.3)' : (tab.color || 'var(--primary)'),
                                    color: selectedCategory === tab.key ? 'white' : 'white',
                                    padding: '0.125rem 0.375rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600'
                                }}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Sort Controls */}
                <div style={{ padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {displayConversations.length} contacts need attention
                    </span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            fontSize: '0.75rem'
                        }}
                    >
                        <option value="time">Sort by Urgency</option>
                        <option value="name">Sort by Name</option>
                    </select>
                </div>

                {/* Conversations List */}
                <div className="modal-body custom-scrollbar" style={{ flex: 1, padding: '0', overflow: 'auto' }}>
                    {displayConversations.length === 0 ? (
                        <div style={{
                            padding: '3rem',
                            textAlign: 'center',
                            color: 'var(--text-muted)'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                            <div style={{ fontWeight: '500' }}>All caught up!</div>
                            <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                                No contacts need attention in this category.
                            </div>
                        </div>
                    ) : (
                        displayConversations.map(conv => (
                            <div
                                key={conv.id}
                                onClick={() => {
                                    onSelectConversation?.(conv);
                                    onClose?.();
                                }}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderBottom: '1px solid var(--border-color)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                {/* Avatar */}
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    background: 'var(--primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    flexShrink: 0
                                }}>
                                    {conv.participant_picture_url ? (
                                        <img
                                            src={conv.participant_picture_url}
                                            alt=""
                                            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        conv.participant_name?.charAt(0)?.toUpperCase() || '?'
                                    )}
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                                        {conv.participant_name || 'Unknown'}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {conv.issues?.map((issue, idx) => (
                                            <span
                                                key={idx}
                                                style={{
                                                    fontSize: '0.7rem',
                                                    padding: '0.125rem 0.5rem',
                                                    borderRadius: '9999px',
                                                    background: issue.type === 'critical' ? settings.danger_color :
                                                        issue.type === 'warning' ? settings.warning_color :
                                                            issue.type === 'awaiting_reply' ? '#3b82f6' :
                                                                issue.type === 'unassigned' ? '#8b5cf6' : '#6b7280',
                                                    color: 'white'
                                                }}
                                            >
                                                {issue.reason}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Time indicator */}
                                <div style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                    textAlign: 'right',
                                    flexShrink: 0
                                }}>
                                    {conv.hoursSinceActivity === Infinity ? 'Never' :
                                        conv.hoursSinceActivity < 1 ? 'Just now' :
                                            conv.hoursSinceActivity < 24 ? `${Math.floor(conv.hoursSinceActivity)}h ago` :
                                                `${Math.floor(conv.hoursSinceActivity / 24)}d ago`}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer" style={{
                    borderTop: '1px solid var(--border-color)',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0
                }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        ⚙️ Configure warning rules in Admin Settings
                    </span>
                    <button className="btn btn-secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WarningDashboard;
