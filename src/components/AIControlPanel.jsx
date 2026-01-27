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
    const [scheduledFollowUps, setScheduledFollowUps] = useState([]);
    const [bestTime, setBestTime] = useState(null);
    const [agentContext, setAgentContext] = useState(''); // External context for AI
    const [savingContext, setSavingContext] = useState(false);
    const [bestTimeDisabled, setBestTimeDisabled] = useState(false);
    const [activeTab, setActiveTab] = useState('status');
    const [actionLog, setActionLog] = useState([]);
    const [activeGoal, setActiveGoal] = useState(null);
    const [showGoalSelector, setShowGoalSelector] = useState(false);
    const [adminConfig, setAdminConfig] = useState(null);

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
            const [safety, followUps, time, convData, goal, actions] = await Promise.all([
                checkSafetyStatus(conversationId),
                getScheduledFollowUps(conversationId, { includeAll: true }),
                calculateBestTimeToContact(conversationId),
                supabase.from('facebook_conversations')
                    .select('agent_context, intuition_followup_disabled, best_time_scheduling_disabled')
                    .eq('conversation_id', conversationId)
                    .single(),
                getActiveGoal(conversationId),
                loadActionLog()
            ]);

            setSafetyStatus(safety);
            setScheduledFollowUps(followUps);
            setBestTime(time);
            setAgentContext(convData?.data?.agent_context || '');
            setActiveGoal(goal);
            setActionLog(actions);

            // Merge disabled flags into safetyStatus object for easy access or separate state
            // Re-using safetyStatus structure or extending it
            if (convData?.data) {
                // If the checkSafetyStatus didn't include these (it likely didn't), we manually track
                // Actually safetyStatus from checkSafetyStatus might just be local logic.
                // Let's store disabled states in safetyStatus to keep consistent with existing code pattern
                // existing code used safetyStatus?.intuitionDisabled. 
                // But checkSafetyStatus implementation is unknown.
                // The existing code line 471 uses safetyStatus?.intuitionDisabled.
                // Let's ensure we populate it accurately.
                if (safetyStatus) {
                    safetyStatus.intuitionDisabled = convData.data.intuition_followup_disabled;
                }
                setBestTimeDisabled(convData.data.best_time_scheduling_disabled);
            }

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

    // Save agent context
    const handleSaveContext = async () => {
        setSavingContext(true);
        try {
            await supabase
                .from('facebook_conversations')
                .update({ agent_context: agentContext })
                .eq('conversation_id', conversationId);
            console.log('[AI Panel] Agent context saved');
        } catch (err) {
            console.error('[AI Panel] Error saving context:', err);
        }
        setSavingContext(false);
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
                <div style={styles.header}>
                    <div>
                        <h2 style={styles.title}>🤖 AI Settings</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9ca3af' }}>
                            {participantName || 'Contact'}
                        </p>
                    </div>
                    <button style={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                <div style={styles.content}>
                    <div style={styles.section}>
                        <h3 style={styles.sectionTitle}>General Controls</h3>

                        <div style={styles.statusCard}>
                            <div style={styles.statusRow}>
                                <span>AI Response Status</span>
                                <span style={{
                                    ...styles.badge,
                                    ...(safetyStatus?.canAIRespond ? styles.badgeGreen : styles.badgeRed)
                                }}>
                                    {safetyStatus?.canAIRespond ? 'Active' : 'Paused'}
                                </span>
                            </div>

                            {safetyStatus?.blockReason && (
                                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                                    Reason: {safetyStatus.blockReason.replace('_', ' ')}
                                </div>
                            )}
                        </div>

                        {/* AI Messaging Toggle */}
                        <div style={{ marginBottom: '16px' }}>
                            <button
                                style={{
                                    ...styles.button,
                                    ...(safetyStatus?.canAIRespond ? styles.buttonDanger : styles.buttonPrimary),
                                    width: '100%'
                                }}
                                onClick={handleToggleAI}
                                disabled={safetyStatus?.optedOut}
                            >
                                {safetyStatus?.canAIRespond ? '⏸️ Pause AI Messaging' : '▶️ Resume AI Messaging'}
                            </button>
                            {safetyStatus?.optedOut && (
                                <div style={{ fontSize: '11px', color: '#f87171', marginTop: '4px', textAlign: 'center' }}>
                                    ⚠️ Contact has opted out
                                </div>
                            )}
                        </div>

                        {/* Intuition Follow-ups Toggle */}
                        <div style={{ marginBottom: '12px' }}>
                            <button
                                style={{
                                    ...styles.button,
                                    ...styles.buttonSecondary,
                                    width: '100%',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                                onClick={async () => {
                                    try {
                                        const { data: conv } = await supabase
                                            .from('facebook_conversations')
                                            .select('intuition_followup_disabled')
                                            .eq('conversation_id', conversationId)
                                            .single();

                                        const newValue = !conv?.intuition_followup_disabled;
                                        await supabase
                                            .from('facebook_conversations')
                                            .update({ intuition_followup_disabled: newValue })
                                            .eq('conversation_id', conversationId);

                                        await loadAllData();
                                    } catch (err) {
                                        console.error('Error toggling intuition:', err);
                                    }
                                }}
                            >
                                <span>🔮 Intuition Follow-ups</span>
                                <span style={{
                                    ...styles.badge,
                                    ...(safetyStatus?.intuitionDisabled ? styles.badgeRed : styles.badgeGreen)
                                }}>
                                    {safetyStatus?.intuitionDisabled ? 'OFF' : 'ON'}
                                </span>
                            </button>
                        </div>

                        {/* Smart Scheduling Toggle */}
                        <div style={{ marginBottom: '12px' }}>
                            <button
                                style={{
                                    ...styles.button,
                                    ...styles.buttonSecondary,
                                    width: '100%',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                                onClick={async () => {
                                    try {
                                        const newValue = !bestTimeDisabled;
                                        await supabase
                                            .from('facebook_conversations')
                                            .update({ best_time_scheduling_disabled: newValue })
                                            .eq('conversation_id', conversationId);

                                        await loadAllData();
                                    } catch (err) {
                                        console.error('Error toggling smart scheduling:', err);
                                    }
                                }}
                            >
                                <span>📅 Smart Scheduling</span>
                                <span style={{
                                    ...styles.badge,
                                    ...(bestTimeDisabled ? styles.badgeRed : styles.badgeGreen)
                                }}>
                                    {bestTimeDisabled ? 'OFF' : 'ON'}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Simple Action Summary if history exists */}
                    {actionLog.length > 0 && (
                        <div style={{ ...styles.section, marginTop: '24px' }}>
                            <h3 style={styles.sectionTitle}>Recent Activity</h3>
                            <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                                {actionLog[0].action_type.replace(/_/g, ' ')} — {new Date(actionLog[0].created_at).toLocaleTimeString()}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
