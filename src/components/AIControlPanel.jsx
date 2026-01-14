import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { checkSafetyStatus, toggleAI, activateHumanTakeover, deactivateTakeover } from '../services/safetyLayer';
import { getActiveGoal, setConversationGoal, abandonGoal, GOAL_TYPES, getGoalTemplates } from '../services/goalController';
import { getScheduledFollowUps, cancelFollowUp, scheduleFollowUp, calculateBestTimeToContact } from '../services/followUpScheduler';

/**
 * AI Control Panel Component
 * Module 8: User Controls & Transparency
 * Shows AI status, scheduled follow-ups, goals, and action history
 */
export default function AIControlPanel({ conversationId, participantName, onClose }) {
    const [loading, setLoading] = useState(true);
    const [safetyStatus, setSafetyStatus] = useState(null);
    const [activeGoal, setActiveGoal] = useState(null);
    const [scheduledFollowUps, setScheduledFollowUps] = useState([]);
    const [actionLog, setActionLog] = useState([]);
    const [goalTemplates, setGoalTemplates] = useState([]);
    const [bestTime, setBestTime] = useState(null);
    const [activeTab, setActiveTab] = useState('status');
    const [showGoalSelector, setShowGoalSelector] = useState(false);
    const [adminConfig, setAdminConfig] = useState(null); // Admin AI chatbot config

    const supabase = getSupabaseClient();

    // Load all data
    useEffect(() => {
        if (conversationId) {
            loadAllData();
        }
    }, [conversationId]);

    const loadAllData = async () => {
        setLoading(true);
        try {
            const [safety, goal, followUps, logs, templates, time] = await Promise.all([
                checkSafetyStatus(conversationId),
                getActiveGoal(conversationId),
                getScheduledFollowUps(conversationId, { includeAll: true }),
                loadActionLog(),
                getGoalTemplates(),
                calculateBestTimeToContact(conversationId)
            ]);

            setSafetyStatus(safety);
            setActiveGoal(goal);
            setScheduledFollowUps(followUps);
            setActionLog(logs);
            setGoalTemplates(templates);
            setBestTime(time);

            // Load admin config to check if goals are admin-controlled
            // Check localStorage first (always available), then try database
            let loadedConfig = null;
            try {
                const localConfig = localStorage.getItem('ai_chatbot_config');
                if (localConfig) {
                    loadedConfig = JSON.parse(localConfig);
                }
            } catch { }

            // Try database as secondary source
            try {
                const { data: settings } = await supabase
                    .from('settings')
                    .select('value')
                    .eq('key', 'ai_chatbot_config')
                    .single();
                if (settings?.value) {
                    loadedConfig = settings.value;
                }
            } catch (e) {
                console.log('[AI Panel] Could not load admin config from DB:', e.message);
            }

            setAdminConfig(loadedConfig);
        } catch (error) {
            console.error('Error loading AI panel data:', error);
        }
        setLoading(false);
    };

    const loadActionLog = async () => {
        const { data } = await supabase
            .from('ai_action_log')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(20);
        return data || [];
    };

    // Handlers
    const handleToggleAI = async () => {
        const newEnabled = !safetyStatus?.canAIRespond && !safetyStatus?.humanTakeover;

        if (safetyStatus?.humanTakeover) {
            await deactivateTakeover(conversationId);
        } else if (newEnabled) {
            await toggleAI(conversationId, true);
        } else {
            await activateHumanTakeover(conversationId, 'admin_override', {
                triggeredBy: 'admin',
                durationHours: 24
            });
        }

        await loadAllData();
    };

    const handleSetGoal = async (goalType) => {
        await setConversationGoal(conversationId, goalType);
        setShowGoalSelector(false);
        await loadAllData();
    };

    const handleAbandonGoal = async () => {
        if (activeGoal) {
            await abandonGoal(activeGoal.id, 'User abandoned');
            await loadAllData();
        }
    };

    const handleCancelFollowUp = async (followUpId) => {
        await cancelFollowUp(followUpId, 'User cancelled');
        await loadAllData();
    };

    const handleScheduleFollowUp = async () => {
        await scheduleFollowUp(conversationId, {
            type: 'manual',
            useBestTime: true,
            reason: 'Manual follow-up scheduled'
        });
        await loadAllData();
    };

    // Styles - Dark theme to match system
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
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #2d2d44'
        },
        header: {
            padding: '20px',
            borderBottom: '1px solid #2d2d44',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        title: {
            margin: 0,
            fontSize: '18px',
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
        tabs: {
            display: 'flex',
            borderBottom: '1px solid #2d2d44'
        },
        tab: {
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#9ca3af',
            borderBottom: '2px solid transparent'
        },
        activeTab: {
            color: '#818cf8',
            borderBottomColor: '#818cf8'
        },
        content: {
            padding: '20px',
            overflowY: 'auto',
            flex: 1
        },
        section: {
            marginBottom: '24px'
        },
        sectionTitle: {
            fontSize: '14px',
            fontWeight: 600,
            color: '#e5e7eb',
            marginBottom: '12px'
        },
        statusCard: {
            background: '#252542',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '12px',
            border: '1px solid #2d2d44'
        },
        statusRow: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
            color: '#d1d5db'
        },
        badge: {
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 500
        },
        badgeGreen: {
            background: 'rgba(16, 185, 129, 0.2)',
            color: '#34d399'
        },
        badgeRed: {
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#f87171'
        },
        badgeYellow: {
            background: 'rgba(245, 158, 11, 0.2)',
            color: '#fbbf24'
        },
        badgePurple: {
            background: 'rgba(139, 92, 246, 0.2)',
            color: '#a78bfa'
        },
        button: {
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500
        },
        buttonPrimary: {
            background: '#6366f1',
            color: 'white'
        },
        buttonSecondary: {
            background: '#374151',
            color: '#e5e7eb'
        },
        buttonDanger: {
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#f87171'
        },
        goalCard: {
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            borderRadius: '8px',
            padding: '16px',
            color: 'white',
            marginBottom: '12px'
        },
        followUpItem: {
            background: '#252542',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            border: '1px solid #2d2d44'
        },
        logItem: {
            padding: '12px 0',
            borderBottom: '1px solid #2d2d44',
            fontSize: '13px',
            color: '#d1d5db'
        },
        goalOption: {
            background: '#252542',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '8px',
            cursor: 'pointer',
            border: '2px solid transparent',
            transition: 'all 0.2s',
            color: '#e5e7eb'
        }
    };

    if (loading) {
        return (
            <div style={styles.overlay}>
                <div style={{ ...styles.panel, padding: '40px', textAlign: 'center' }}>
                    Loading AI Controls...
                </div>
            </div>
        );
    }

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.panel} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <div>
                        <h2 style={styles.title}>🤖 AI Controls</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9ca3af' }}>
                            {participantName || 'Contact'}
                        </p>
                    </div>
                    <button style={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                {/* Tabs */}
                <div style={styles.tabs}>
                    {['status', 'goals', 'followups', 'history'].map(tab => (
                        <button
                            key={tab}
                            style={{
                                ...styles.tab,
                                ...(activeTab === tab ? styles.activeTab : {})
                            }}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab === 'status' && '📊 Status'}
                            {tab === 'goals' && '🎯 Goals'}
                            {tab === 'followups' && '📅 Follow-ups'}
                            {tab === 'history' && '📜 History'}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={styles.content}>
                    {/* Status Tab */}
                    {activeTab === 'status' && (
                        <>
                            <div style={styles.section}>
                                <h3 style={styles.sectionTitle}>AI Status</h3>
                                <div style={styles.statusCard}>
                                    <div style={styles.statusRow}>
                                        <span>AI Messaging</span>
                                        <span style={{
                                            ...styles.badge,
                                            ...(safetyStatus?.canAIRespond ? styles.badgeGreen : styles.badgeRed)
                                        }}>
                                            {safetyStatus?.canAIRespond ? 'Active' : 'Paused'}
                                        </span>
                                    </div>

                                    {safetyStatus?.blockReason && (
                                        <div style={styles.statusRow}>
                                            <span>Reason</span>
                                            <span style={{ ...styles.badge, ...styles.badgeYellow }}>
                                                {safetyStatus.blockReason.replace('_', ' ')}
                                            </span>
                                        </div>
                                    )}

                                    <div style={styles.statusRow}>
                                        <span>Confidence</span>
                                        <span style={{
                                            ...styles.badge,
                                            ...(safetyStatus?.confidence >= 0.7 ? styles.badgeGreen :
                                                safetyStatus?.confidence >= 0.4 ? styles.badgeYellow : styles.badgeRed)
                                        }}>
                                            {((safetyStatus?.confidence || 0) * 100).toFixed(0)}%
                                        </span>
                                    </div>

                                    {safetyStatus?.optedOut && (
                                        <div style={{
                                            marginTop: '12px',
                                            padding: '8px 12px',
                                            background: 'rgba(239, 68, 68, 0.2)',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            color: '#f87171'
                                        }}>
                                            ⚠️ Contact has opted out of AI messaging
                                        </div>
                                    )}
                                </div>

                                <button
                                    style={{
                                        ...styles.button,
                                        ...(safetyStatus?.canAIRespond ? styles.buttonDanger : styles.buttonPrimary),
                                        width: '100%'
                                    }}
                                    onClick={handleToggleAI}
                                    disabled={safetyStatus?.optedOut}
                                >
                                    {safetyStatus?.canAIRespond ? '⏸️ Pause AI' : '▶️ Resume AI'}
                                </button>
                            </div>

                            {bestTime && (
                                <div style={styles.section}>
                                    <h3 style={styles.sectionTitle}>Best Time to Contact</h3>
                                    <div style={styles.statusCard}>
                                        <div style={styles.statusRow}>
                                            <span>Optimal Time</span>
                                            <span style={{ fontWeight: 500 }}>
                                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][bestTime.dayOfWeek]} at {bestTime.hourOfDay}:00
                                            </span>
                                        </div>
                                        <div style={styles.statusRow}>
                                            <span>Next Occurrence</span>
                                            <span style={{ fontSize: '13px', color: '#9ca3af' }}>
                                                {new Date(bestTime.nextBestTime).toLocaleString()}
                                            </span>
                                        </div>
                                        <div style={styles.statusRow}>
                                            <span>Confidence</span>
                                            <span style={{ ...styles.badge, ...styles.badgePurple }}>
                                                {(bestTime.confidence * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Goals Tab */}
                    {activeTab === 'goals' && (
                        <>
                            {/* Check if admin has set a global goal */}
                            {adminConfig?.default_goal && !activeGoal ? (
                                <div style={styles.section}>
                                    <h3 style={styles.sectionTitle}>Goal Management</h3>
                                    <div style={{
                                        ...styles.statusCard,
                                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
                                        border: '1px solid rgba(129, 140, 248, 0.3)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                            <span style={{ fontSize: '32px' }}>🔒</span>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '16px', color: '#e5e7eb', marginBottom: '4px' }}>
                                                    Goals Managed by Admin
                                                </div>
                                                <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                                                    A global goal has been set for all contacts
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '12px',
                                            background: 'rgba(0,0,0,0.2)',
                                            borderRadius: '8px'
                                        }}>
                                            <span style={{ fontSize: '20px' }}>
                                                {adminConfig.default_goal === 'booking' ? '📅' :
                                                    adminConfig.default_goal === 'closing' ? '💰' :
                                                        adminConfig.default_goal === 'follow_up' ? '🔄' :
                                                            adminConfig.default_goal === 'qualification' ? '🎯' :
                                                                adminConfig.default_goal === 'information' ? 'ℹ️' : '🎯'}
                                            </span>
                                            <div style={{ color: '#e5e7eb', fontWeight: 500 }}>
                                                {adminConfig.default_goal === 'booking' ? 'Book a Call' :
                                                    adminConfig.default_goal === 'closing' ? 'Close Sale' :
                                                        adminConfig.default_goal === 'follow_up' ? 'Re-engage Lead' :
                                                            adminConfig.default_goal === 'qualification' ? 'Qualify Lead' :
                                                                adminConfig.default_goal === 'information' ? 'Provide Information' :
                                                                    adminConfig.default_goal}
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '12px', fontSize: '12px', color: '#6b7280' }}>
                                            Contact your admin to change goal settings
                                        </div>
                                    </div>
                                </div>
                            ) : activeGoal ? (
                                <div style={styles.section}>
                                    <h3 style={styles.sectionTitle}>Active Goal</h3>
                                    <div style={styles.goalCard}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '24px' }}>
                                                {GOAL_TYPES[activeGoal.goal_type]?.icon || '🎯'}
                                            </span>
                                            <span style={{ fontSize: '16px', fontWeight: 600 }}>
                                                {GOAL_TYPES[activeGoal.goal_type]?.name || activeGoal.goal_type}
                                            </span>
                                        </div>
                                        <div style={{
                                            background: 'rgba(255,255,255,0.2)',
                                            borderRadius: '4px',
                                            height: '8px',
                                            marginBottom: '8px'
                                        }}>
                                            <div style={{
                                                background: 'white',
                                                borderRadius: '4px',
                                                height: '100%',
                                                width: `${activeGoal.progress_score || 0}%`
                                            }} />
                                        </div>
                                        <div style={{ fontSize: '12px', opacity: 0.9 }}>
                                            Progress: {activeGoal.progress_score || 0}%
                                        </div>
                                    </div>
                                    <button
                                        style={{ ...styles.button, ...styles.buttonDanger }}
                                        onClick={handleAbandonGoal}
                                    >
                                        Abandon Goal
                                    </button>
                                </div>
                            ) : (
                                <div style={styles.section}>
                                    <h3 style={styles.sectionTitle}>Set a Goal</h3>
                                    {Object.entries(GOAL_TYPES).map(([type, info]) => (
                                        <div
                                            key={type}
                                            style={styles.goalOption}
                                            onClick={() => handleSetGoal(type)}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.borderColor = '#818cf8';
                                                e.currentTarget.style.background = '#2d2d44';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.borderColor = 'transparent';
                                                e.currentTarget.style.background = '#252542';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ fontSize: '24px' }}>{info.icon}</span>
                                                <div>
                                                    <div style={{ fontWeight: 500 }}>{info.name}</div>
                                                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                                                        {info.description}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Follow-ups Tab */}
                    {activeTab === 'followups' && (
                        <>
                            <div style={styles.section}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Scheduled Follow-ups</h3>
                                    <button
                                        style={{ ...styles.button, ...styles.buttonPrimary }}
                                        onClick={handleScheduleFollowUp}
                                    >
                                        + Schedule
                                    </button>
                                </div>

                                {scheduledFollowUps.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                                        No scheduled follow-ups
                                    </div>
                                ) : (
                                    scheduledFollowUps.map(fu => (
                                        <div key={fu.id} style={styles.followUpItem}>
                                            <div>
                                                <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                                                    {fu.follow_up_type.replace('_', ' ')}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                                    {new Date(fu.scheduled_at).toLocaleString()}
                                                </div>
                                                {fu.reason && (
                                                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                                        {fu.reason}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{
                                                    ...styles.badge,
                                                    ...(fu.status === 'pending' ? styles.badgeYellow :
                                                        fu.status === 'sent' ? styles.badgeGreen : styles.badgeRed)
                                                }}>
                                                    {fu.status}
                                                </span>
                                                {fu.status === 'pending' && (
                                                    <button
                                                        style={{ ...styles.button, ...styles.buttonSecondary, padding: '4px 8px' }}
                                                        onClick={() => handleCancelFollowUp(fu.id)}
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}

                    {/* History Tab */}
                    {activeTab === 'history' && (
                        <div style={styles.section}>
                            <h3 style={styles.sectionTitle}>AI Action Log</h3>
                            {actionLog.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                                    No actions recorded yet
                                </div>
                            ) : (
                                actionLog.map(log => (
                                    <div key={log.id} style={styles.logItem}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{
                                                fontWeight: 500,
                                                color: log.action_type.includes('sent') ? '#059669' :
                                                    log.action_type.includes('takeover') ? '#dc2626' : '#374151'
                                            }}>
                                                {log.action_type.replace(/_/g, ' ')}
                                            </span>
                                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                                                {new Date(log.created_at).toLocaleTimeString()}
                                            </span>
                                        </div>
                                        {log.explanation && (
                                            <div style={{ color: '#6b7280', fontSize: '12px' }}>
                                                {log.explanation}
                                            </div>
                                        )}
                                        {log.confidence_score && (
                                            <div style={{ marginTop: '4px' }}>
                                                <span style={{ ...styles.badge, ...styles.badgePurple }}>
                                                    {(log.confidence_score * 100).toFixed(0)}% confidence
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
