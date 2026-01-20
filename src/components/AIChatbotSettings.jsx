import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

/**
 * AI Chatbot Settings Component
 * Admin panel for configuring the AI chatbot system
 */
export default function AIChatbotSettings({ onClose }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState({
        enabled: true,
        default_cooldown_hours: 4,
        min_confidence_threshold: 0.6,
        max_messages_per_day: 5,
        auto_takeover_on_low_confidence: true,
        default_message_split_threshold: 500,
        intuition_silence_hours: 24,
        best_time_lookback_days: 30,
        auto_respond_to_new_messages: true,
        auto_greet_new_contacts: true, // Send greeting when new contact clicks ad/button
        enable_silence_followups: true,
        enable_intuition_followups: true
    });
    const [stats, setStats] = useState({
        totalConversations: 0,
        aiEnabled: 0,
        humanTakeover: 0,
        pendingFollowups: 0,
        messagesSentToday: 0
    });

    const supabase = getSupabaseClient();

    useEffect(() => {
        loadSettings();
        loadStats();
    }, []);

    const loadSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'ai_chatbot_config')
                .single();

            if (!error && data?.value) {
                setConfig(prev => ({ ...prev, ...data.value }));
            }
        } catch (err) {
            console.error('Error loading settings:', err);
        }
        setLoading(false);
    };

    const loadStats = async () => {
        try {
            // Get conversation stats
            const { count: totalConversations } = await supabase
                .from('facebook_conversations')
                .select('*', { count: 'exact', head: true });

            const { count: aiEnabled } = await supabase
                .from('facebook_conversations')
                .select('*', { count: 'exact', head: true })
                .eq('ai_enabled', true);

            const { count: humanTakeover } = await supabase
                .from('facebook_conversations')
                .select('*', { count: 'exact', head: true })
                .eq('human_takeover', true);

            const { count: pendingFollowups } = await supabase
                .from('ai_followup_schedule')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            // Get messages sent today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const { count: messagesSentToday } = await supabase
                .from('ai_action_log')
                .select('*', { count: 'exact', head: true })
                .eq('action_type', 'message_sent')
                .gte('created_at', today.toISOString());

            setStats({
                totalConversations: totalConversations || 0,
                aiEnabled: aiEnabled || 0,
                humanTakeover: humanTakeover || 0,
                pendingFollowups: pendingFollowups || 0,
                messagesSentToday: messagesSentToday || 0
            });
        } catch (err) {
            console.error('Error loading stats:', err);
        }
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('settings')
                .upsert({
                    key: 'ai_chatbot_config',
                    value: config,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (error) throw error;
            alert('Settings saved successfully!');
        } catch (err) {
            alert('Failed to save: ' + err.message);
        }
        setSaving(false);
    };

    const enableAIForAll = async () => {
        if (!confirm('Enable AI for all conversations? This will turn on AI messaging for every contact.')) return;

        try {
            const { error } = await supabase
                .from('facebook_conversations')
                .update({ ai_enabled: true, updated_at: new Date().toISOString() })
                .neq('opt_out', true);

            if (error) throw error;
            alert('AI enabled for all conversations!');
            loadStats();
        } catch (err) {
            alert('Failed: ' + err.message);
        }
    };

    const disableAIForAll = async () => {
        if (!confirm('Disable AI for all conversations?')) return;

        try {
            const { error } = await supabase
                .from('facebook_conversations')
                .update({ ai_enabled: false, updated_at: new Date().toISOString() });

            if (error) throw error;
            alert('AI disabled for all conversations');
            loadStats();
        } catch (err) {
            alert('Failed: ' + err.message);
        }
    };

    const styles = {
        overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        },
        panel: {
            background: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '700px',
            maxHeight: '85vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        },
        header: {
            padding: '20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
            color: 'white'
        },
        title: {
            margin: 0,
            fontSize: '18px',
            fontWeight: 600
        },
        closeBtn: {
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            color: 'white',
            padding: '4px 10px',
            borderRadius: '4px'
        },
        content: {
            padding: '20px',
            overflowY: 'auto',
            flex: 1
        },
        statsGrid: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '12px',
            marginBottom: '24px'
        },
        statCard: {
            background: '#f9fafb',
            borderRadius: '8px',
            padding: '16px',
            textAlign: 'center'
        },
        statNumber: {
            fontSize: '24px',
            fontWeight: 700,
            color: '#7c3aed'
        },
        statLabel: {
            fontSize: '12px',
            color: '#6b7280',
            marginTop: '4px'
        },
        section: {
            marginBottom: '24px'
        },
        sectionTitle: {
            fontSize: '14px',
            fontWeight: 600,
            color: '#374151',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        },
        formRow: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px',
            background: '#f9fafb',
            borderRadius: '8px',
            marginBottom: '8px'
        },
        label: {
            fontSize: '14px',
            color: '#374151'
        },
        input: {
            width: '80px',
            padding: '6px 10px',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            fontSize: '14px'
        },
        toggle: {
            position: 'relative',
            width: '48px',
            height: '24px',
            background: '#e5e7eb',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'background 0.2s'
        },
        toggleActive: {
            background: '#7c3aed'
        },
        toggleKnob: {
            position: 'absolute',
            top: '2px',
            left: '2px',
            width: '20px',
            height: '20px',
            background: 'white',
            borderRadius: '50%',
            transition: 'left 0.2s'
        },
        toggleKnobActive: {
            left: '26px'
        },
        button: {
            padding: '10px 20px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500
        },
        buttonPrimary: {
            background: '#7c3aed',
            color: 'white'
        },
        buttonSecondary: {
            background: '#f3f4f6',
            color: '#374151'
        },
        buttonDanger: {
            background: '#fee2e2',
            color: '#991b1b'
        },
        footer: {
            padding: '16px 20px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between'
        }
    };

    const Toggle = ({ value, onChange }) => (
        <div
            style={{ ...styles.toggle, ...(value ? styles.toggleActive : {}) }}
            onClick={() => onChange(!value)}
        >
            <div style={{ ...styles.toggleKnob, ...(value ? styles.toggleKnobActive : {}) }} />
        </div>
    );

    if (loading) {
        return (
            <div style={styles.overlay}>
                <div style={{ ...styles.panel, padding: '40px', textAlign: 'center' }}>
                    Loading AI Settings...
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
                        <h2 style={styles.title}>🤖 AI Chatbot Settings</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.9 }}>
                            Configure automated messaging and follow-ups
                        </p>
                    </div>
                    <button style={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                {/* Content */}
                <div style={styles.content}>
                    {/* Stats */}
                    <div style={styles.statsGrid}>
                        <div style={styles.statCard}>
                            <div style={styles.statNumber}>{stats.aiEnabled}</div>
                            <div style={styles.statLabel}>AI Enabled</div>
                        </div>
                        <div style={styles.statCard}>
                            <div style={styles.statNumber}>{stats.humanTakeover}</div>
                            <div style={styles.statLabel}>Human Takeover</div>
                        </div>
                        <div style={styles.statCard}>
                            <div style={styles.statNumber}>{stats.pendingFollowups}</div>
                            <div style={styles.statLabel}>Pending Follow-ups</div>
                        </div>
                        <div style={styles.statCard}>
                            <div style={styles.statNumber}>{stats.messagesSentToday}</div>
                            <div style={styles.statLabel}>Sent Today</div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div style={styles.section}>
                        <h3 style={styles.sectionTitle}>⚡ Quick Actions</h3>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                style={{ ...styles.button, ...styles.buttonPrimary }}
                                onClick={enableAIForAll}
                            >
                                ✅ Enable AI for All
                            </button>
                            <button
                                style={{ ...styles.button, ...styles.buttonDanger }}
                                onClick={disableAIForAll}
                            >
                                ⏸️ Disable AI for All
                            </button>
                        </div>
                    </div>

                    {/* Core Settings */}
                    <div style={styles.section}>
                        <h3 style={styles.sectionTitle}>⚙️ Core Settings</h3>

                        <div style={styles.formRow}>
                            <span style={styles.label}>Auto-respond to new messages</span>
                            <Toggle
                                value={config.auto_respond_to_new_messages}
                                onChange={v => setConfig(p => ({ ...p, auto_respond_to_new_messages: v }))}
                            />
                        </div>

                        <div style={styles.formRow}>
                            <div>
                                <span style={styles.label}>Auto-greet new contacts (ads/buttons)</span>
                                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                    AI sends welcome message when someone clicks an ad or button
                                </div>
                            </div>
                            <Toggle
                                value={config.auto_greet_new_contacts}
                                onChange={v => setConfig(p => ({ ...p, auto_greet_new_contacts: v }))}
                            />
                        </div>

                        <div style={styles.formRow}>
                            <span style={styles.label}>Enable silence follow-ups (24h inactivity)</span>
                            <Toggle
                                value={config.enable_silence_followups}
                                onChange={v => setConfig(p => ({ ...p, enable_silence_followups: v }))}
                            />
                        </div>

                        <div style={styles.formRow}>
                            <span style={styles.label}>Enable intuition-based follow-ups</span>
                            <Toggle
                                value={config.enable_intuition_followups}
                                onChange={v => setConfig(p => ({ ...p, enable_intuition_followups: v }))}
                            />
                        </div>

                        <div style={styles.formRow}>
                            <span style={styles.label}>Auto-takeover on low confidence</span>
                            <Toggle
                                value={config.auto_takeover_on_low_confidence}
                                onChange={v => setConfig(p => ({ ...p, auto_takeover_on_low_confidence: v }))}
                            />
                        </div>
                    </div>

                    {/* Timing Settings */}
                    <div style={styles.section}>
                        <h3 style={styles.sectionTitle}>⏱️ Timing</h3>

                        <div style={styles.formRow}>
                            <span style={styles.label}>Cooldown between messages (hours)</span>
                            <input
                                type="number"
                                style={styles.input}
                                value={config.default_cooldown_hours}
                                onChange={e => setConfig(p => ({ ...p, default_cooldown_hours: parseInt(e.target.value) || 4 }))}
                                min="1"
                                max="72"
                            />
                        </div>

                        <div style={styles.formRow}>
                            <span style={styles.label}>Silence threshold (hours)</span>
                            <input
                                type="number"
                                style={styles.input}
                                value={config.intuition_silence_hours}
                                onChange={e => setConfig(p => ({ ...p, intuition_silence_hours: parseInt(e.target.value) || 24 }))}
                                min="12"
                                max="168"
                            />
                        </div>

                        <div style={styles.formRow}>
                            <span style={styles.label}>Max messages per day per contact</span>
                            <input
                                type="number"
                                style={styles.input}
                                value={config.max_messages_per_day}
                                onChange={e => setConfig(p => ({ ...p, max_messages_per_day: parseInt(e.target.value) || 5 }))}
                                min="1"
                                max="10"
                            />
                        </div>
                    </div>

                    {/* Confidence Settings */}
                    <div style={styles.section}>
                        <h3 style={styles.sectionTitle}>🎯 AI Confidence</h3>

                        <div style={styles.formRow}>
                            <span style={styles.label}>Minimum confidence threshold (0-1)</span>
                            <input
                                type="number"
                                style={styles.input}
                                value={config.min_confidence_threshold}
                                onChange={e => setConfig(p => ({ ...p, min_confidence_threshold: parseFloat(e.target.value) || 0.6 }))}
                                min="0.1"
                                max="1"
                                step="0.1"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <button
                        style={{ ...styles.button, ...styles.buttonSecondary }}
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        style={{ ...styles.button, ...styles.buttonPrimary, opacity: saving ? 0.5 : 1 }}
                        onClick={saveSettings}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : '💾 Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
}
