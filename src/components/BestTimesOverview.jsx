import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

/**
 * Best Times Overview Component
 * Shows all contacts' best times to contact in a concise table view
 */
export default function BestTimesOverview({ onClose }) {
    const [loading, setLoading] = useState(true);
    const [contacts, setContacts] = useState([]);
    const [filter, setFilter] = useState('all'); // all, today, soon

    const supabase = getSupabaseClient();

    useEffect(() => {
        loadBestTimes();
    }, []);

    const loadBestTimes = async () => {
        try {
            // Get all conversations with engagement data
            const { data: conversations, error } = await supabase
                .from('facebook_conversations')
                .select(`
                    conversation_id,
                    participant_name,
                    participant_id,
                    ai_enabled,
                    last_message_time
                `)
                .eq('ai_enabled', true)
                .order('last_message_time', { ascending: false })
                .limit(100);

            if (error) throw error;

            // Get engagement data for all conversations
            const convIds = conversations?.map(c => c.conversation_id) || [];

            const { data: engagements } = await supabase
                .from('contact_engagement')
                .select('conversation_id, day_of_week, hour_of_day, engagement_score')
                .in('conversation_id', convIds)
                .eq('message_direction', 'inbound');

            // Calculate best time for each contact
            const contactsWithBestTimes = (conversations || []).map(conv => {
                const convEngagements = (engagements || []).filter(e => e.conversation_id === conv.conversation_id);

                if (convEngagements.length < 3) {
                    // Default if not enough data
                    return {
                        ...conv,
                        bestDay: 2, // Tuesday
                        bestHour: 10, // 10 AM
                        confidence: 0.3,
                        dataPoints: convEngagements.length,
                        nextBestTime: getNextOccurrence(2, 10)
                    };
                }

                // Calculate scores per time slot
                const timeScores = {};
                for (const eng of convEngagements) {
                    const key = `${eng.day_of_week}-${eng.hour_of_day}`;
                    if (!timeScores[key]) {
                        timeScores[key] = { day: eng.day_of_week, hour: eng.hour_of_day, score: 0, count: 0 };
                    }
                    timeScores[key].score += eng.engagement_score || 1;
                    timeScores[key].count++;
                }

                // Find best slot
                const slots = Object.values(timeScores);
                slots.sort((a, b) => (b.score / b.count) - (a.score / a.count));
                const best = slots[0] || { day: 2, hour: 10 };

                return {
                    ...conv,
                    bestDay: best.day,
                    bestHour: best.hour,
                    confidence: Math.min(convEngagements.length / 20, 1),
                    dataPoints: convEngagements.length,
                    nextBestTime: getNextOccurrence(best.day, best.hour)
                };
            });

            // Sort by next best time
            contactsWithBestTimes.sort((a, b) => a.nextBestTime - b.nextBestTime);
            setContacts(contactsWithBestTimes);
        } catch (err) {
            console.error('Error loading best times:', err);
        }
        setLoading(false);
    };

    const getNextOccurrence = (dayOfWeek, hourOfDay) => {
        const now = new Date();
        const result = new Date(now);

        // Set to the target hour
        result.setHours(hourOfDay, 0, 0, 0);

        // Calculate days until target day
        const currentDay = now.getDay();
        let daysUntil = dayOfWeek - currentDay;

        if (daysUntil < 0 || (daysUntil === 0 && now.getHours() >= hourOfDay)) {
            daysUntil += 7;
        }

        result.setDate(result.getDate() + daysUntil);
        return result;
    };

    const formatTimeUntil = (date) => {
        const now = new Date();
        const diff = date - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h`;
        return 'Soon';
    };

    const getDayName = (day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day];

    const filteredContacts = contacts.filter(c => {
        if (filter === 'all') return true;
        const hoursUntil = (c.nextBestTime - new Date()) / (1000 * 60 * 60);
        if (filter === 'today') return hoursUntil < 24;
        if (filter === 'soon') return hoursUntil < 4;
        return true;
    });

    const styles = {
        overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        },
        panel: {
            background: '#1a1a2e',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '800px',
            maxHeight: '80vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #2d2d44'
        },
        header: {
            padding: '16px 20px',
            borderBottom: '1px solid #2d2d44',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        title: {
            margin: 0,
            fontSize: '16px',
            fontWeight: 600,
            color: '#ffffff'
        },
        closeBtn: {
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#9ca3af'
        },
        filters: {
            display: 'flex',
            gap: '8px',
            padding: '12px 20px',
            borderBottom: '1px solid #2d2d44'
        },
        filterBtn: {
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            background: '#252542',
            color: '#9ca3af'
        },
        filterBtnActive: {
            background: '#6366f1',
            color: 'white'
        },
        content: {
            padding: '0',
            overflowY: 'auto',
            flex: 1
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse'
        },
        th: {
            padding: '12px 16px',
            textAlign: 'left',
            fontSize: '12px',
            fontWeight: 600,
            color: '#9ca3af',
            background: '#252542',
            borderBottom: '1px solid #2d2d44',
            position: 'sticky',
            top: 0
        },
        td: {
            padding: '12px 16px',
            fontSize: '13px',
            color: '#e5e7eb',
            borderBottom: '1px solid #2d2d44'
        },
        badge: {
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500
        },
        badgeGreen: {
            background: 'rgba(16, 185, 129, 0.2)',
            color: '#34d399'
        },
        badgeYellow: {
            background: 'rgba(245, 158, 11, 0.2)',
            color: '#fbbf24'
        },
        badgePurple: {
            background: 'rgba(139, 92, 246, 0.2)',
            color: '#a78bfa'
        }
    };

    if (loading) {
        return (
            <div style={styles.overlay}>
                <div style={{ ...styles.panel, padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                    Loading best times...
                </div>
            </div>
        );
    }

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.panel} onClick={e => e.stopPropagation()}>
                <div style={styles.header}>
                    <h3 style={styles.title}>📊 Best Times to Contact</h3>
                    <button style={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                <div style={styles.filters}>
                    {[
                        { key: 'all', label: 'All Contacts' },
                        { key: 'today', label: 'Today' },
                        { key: 'soon', label: 'Soon (4h)' }
                    ].map(f => (
                        <button
                            key={f.key}
                            style={{
                                ...styles.filterBtn,
                                ...(filter === f.key ? styles.filterBtnActive : {})
                            }}
                            onClick={() => setFilter(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#6b7280' }}>
                        {filteredContacts.length} contacts
                    </span>
                </div>

                <div style={styles.content}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Contact</th>
                                <th style={styles.th}>Best Time</th>
                                <th style={styles.th}>Next Window</th>
                                <th style={styles.th}>Confidence</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredContacts.map(contact => (
                                <tr key={contact.conversation_id}>
                                    <td style={styles.td}>
                                        <div style={{ fontWeight: 500 }}>
                                            {contact.participant_name || 'Unknown'}
                                        </div>
                                    </td>
                                    <td style={styles.td}>
                                        <span style={{ ...styles.badge, ...styles.badgePurple }}>
                                            {getDayName(contact.bestDay)} {contact.bestHour}:00
                                        </span>
                                    </td>
                                    <td style={styles.td}>
                                        <span style={{
                                            ...styles.badge,
                                            ...(formatTimeUntil(contact.nextBestTime).includes('h') && !formatTimeUntil(contact.nextBestTime).includes('d')
                                                ? styles.badgeGreen
                                                : styles.badgeYellow)
                                        }}>
                                            {formatTimeUntil(contact.nextBestTime)}
                                        </span>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={{
                                            width: '60px',
                                            height: '6px',
                                            background: '#374151',
                                            borderRadius: '3px',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                width: `${contact.confidence * 100}%`,
                                                height: '100%',
                                                background: contact.confidence > 0.7 ? '#34d399' : contact.confidence > 0.4 ? '#fbbf24' : '#6b7280',
                                                borderRadius: '3px'
                                            }} />
                                        </div>
                                        <span style={{ fontSize: '10px', color: '#6b7280' }}>
                                            {contact.dataPoints} pts
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredContacts.length === 0 && (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                            No contacts found with the selected filter
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
