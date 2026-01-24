import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

/**
 * ContactsWithPhonePanel Component
 * Shows a list of contacts who have provided their phone numbers
 */
export default function ContactsWithPhonePanel({ onViewContact }) {
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const stored = localStorage.getItem('contacts_phone_collapsed');
        return stored === 'true';
    });

    const supabase = getSupabaseClient();

    useEffect(() => {
        loadContactsWithPhone();
    }, []);

    const loadContactsWithPhone = async () => {
        if (!supabase) {
            setLoading(false);
            return;
        }

        try {
            // Load a larger recent set and filter client-side to handle schemas without phone_number
            const baseSelect = 'conversation_id, participant_name, participant_id, pipeline_stage, last_message_time, page_id, extracted_details, phone_number';
            let { data, error } = await supabase
                .from('facebook_conversations')
                .select(baseSelect)
                .order('last_message_time', { ascending: false })
                .limit(200);

            if (error && /phone_number/i.test(error.message || '')) {
                const fallbackSelect = 'conversation_id, participant_name, participant_id, pipeline_stage, last_message_time, page_id, extracted_details';
                const fallback = await supabase
                    .from('facebook_conversations')
                    .select(fallbackSelect)
                    .order('last_message_time', { ascending: false })
                    .limit(200);
                data = fallback.data;
                error = fallback.error;
            }

            if (error) {
                console.error('[ContactsWithPhone] Error loading:', error);
                setContacts([]);
            } else {
                const normalized = (data || [])
                    .map(contact => {
                        const phone = (contact.phone_number || contact.extracted_details?.phone || '').toString().trim();
                        return { ...contact, phone_number: phone };
                    })
                    .filter(contact => contact.phone_number);

                setContacts(normalized.slice(0, 50));
            }
        } catch (err) {
            console.error('[ContactsWithPhone] Error:', err);
            setContacts([]);
        }
        setLoading(false);
    };

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem('contacts_phone_collapsed', String(newState));
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Unknown';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const getPipelineColor = (stage) => {
        const colors = {
            'new': '#3b82f6',
            'contacted': '#f59e0b',
            'qualified': '#8b5cf6',
            'booked': '#10b981',
            'converted': '#22c55e',
            'lost': '#ef4444'
        };
        return colors[stage] || '#6b7280';
    };

    const styles = {
        container: {
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            overflow: 'hidden'
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%)',
            borderBottom: isCollapsed ? 'none' : '1px solid var(--border-color)',
            cursor: 'pointer'
        },
        headerLeft: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        },
        title: {
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)'
        },
        badge: {
            background: '#10b981',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: 600
        },
        toggleBtn: {
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px'
        },
        content: {
            maxHeight: isCollapsed ? '0' : '300px',
            overflow: 'hidden',
            transition: 'max-height 0.3s ease'
        },
        list: {
            padding: '8px',
            overflowY: 'auto',
            maxHeight: '280px'
        },
        contactItem: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            background: 'var(--bg-tertiary)',
            borderRadius: '8px',
            marginBottom: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: '1px solid transparent'
        },
        contactInfo: {
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flex: 1
        },
        contactName: {
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--text-primary)'
        },
        phoneNumber: {
            fontSize: '13px',
            color: '#10b981',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
        },
        meta: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        },
        stageBadge: {
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500,
            textTransform: 'capitalize'
        },
        time: {
            fontSize: '11px',
            color: 'var(--text-muted)'
        },
        emptyState: {
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px'
        },
        copyBtn: {
            background: 'rgba(16, 185, 129, 0.2)',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            color: '#10b981',
            cursor: 'pointer',
            marginLeft: '8px'
        }
    };

    const copyToClipboard = async (e, phoneNumber) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(phoneNumber);
            // Show brief feedback
            const btn = e.target;
            const originalText = btn.innerText;
            btn.innerText = '✓ Copied!';
            setTimeout(() => {
                btn.innerText = originalText;
            }, 1500);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header} onClick={toggleCollapse}>
                <div style={styles.headerLeft}>
                    <span style={{ fontSize: '18px' }}>📱</span>
                    <h3 style={styles.title}>Contacts with Phone Numbers</h3>
                    <span style={styles.badge}>{contacts.length}</span>
                </div>
                <button style={styles.toggleBtn}>
                    {isCollapsed ? '▼' : '▲'}
                </button>
            </div>

            <div style={styles.content}>
                {loading ? (
                    <div style={styles.emptyState}>Loading...</div>
                ) : contacts.length === 0 ? (
                    <div style={styles.emptyState}>
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>📞</div>
                        No contacts have provided phone numbers yet
                    </div>
                ) : (
                    <div style={styles.list}>
                        {contacts.map(contact => (
                            <div
                                key={contact.conversation_id}
                                style={styles.contactItem}
                                onClick={() => onViewContact?.(contact.conversation_id)}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = '#10b981';
                                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = 'transparent';
                                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                                }}
                            >
                                <div style={styles.contactInfo}>
                                    <span style={styles.contactName}>
                                        {contact.participant_name || 'Unknown'}
                                    </span>
                                    <span style={styles.phoneNumber}>
                                        📞 {contact.phone_number}
                                        <button
                                            style={styles.copyBtn}
                                            onClick={(e) => copyToClipboard(e, contact.phone_number)}
                                        >
                                            Copy
                                        </button>
                                    </span>
                                </div>
                                <div style={styles.meta}>
                                    {contact.pipeline_stage && (
                                        <span style={{
                                            ...styles.stageBadge,
                                            background: `${getPipelineColor(contact.pipeline_stage)}20`,
                                            color: getPipelineColor(contact.pipeline_stage)
                                        }}>
                                            {contact.pipeline_stage}
                                        </span>
                                    )}
                                    <span style={styles.time}>
                                        {formatDate(contact.last_message_time)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
