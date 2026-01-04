// AI Settings Component for Admin Panel
import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';
import DocumentUpload from './DocumentUpload';

const AISettings = ({ onClose }) => {
    const [settings, setSettings] = useState({
        ai_enabled: true,
        auto_correct_captions: true,
        show_reply_suggestions: true,
        show_conversation_scoring: true,
        custom_prompt: '',
        conversation_flow_prompt: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showDocs, setShowDocs] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const client = getSupabaseClient();
            if (!client) return;

            const { data } = await client
                .from('ai_settings')
                .select('*')
                .single();

            if (data) {
                setSettings(data);
            }
        } catch (e) {
            console.warn('No AI settings found:', e);
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            const client = getSupabaseClient();
            if (!client) return;

            await client
                .from('ai_settings')
                .upsert(settings, { onConflict: 'user_id' });

            alert('Settings saved!');
        } catch (e) {
            console.error('Failed to save:', e);
            alert('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="modal-overlay active">
                <div className="modal" style={{ padding: '2rem', textAlign: 'center' }}>
                    Loading AI Settings...
                </div>
            </div>
        );
    }

    if (showDocs) {
        return <DocumentUpload onClose={() => setShowDocs(false)} />;
    }

    return (
        <div className="modal-overlay active">
            <div className="modal" style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h3 className="modal-title">🤖 AI Settings</h3>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {/* Toggle switches */}
                    <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={settings.ai_enabled}
                                onChange={e => setSettings({ ...settings, ai_enabled: e.target.checked })}
                            />
                            <span>Enable AI Features</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={settings.auto_correct_captions}
                                onChange={e => setSettings({ ...settings, auto_correct_captions: e.target.checked })}
                            />
                            <span>Auto-correct Captions</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={settings.show_reply_suggestions}
                                onChange={e => setSettings({ ...settings, show_reply_suggestions: e.target.checked })}
                            />
                            <span>Show Reply Suggestions</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={settings.show_conversation_scoring}
                                onChange={e => setSettings({ ...settings, show_conversation_scoring: e.target.checked })}
                            />
                            <span>Show Conversation Scoring</span>
                        </label>
                    </div>

                    {/* Custom prompts */}
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label className="form-label">Custom AI System Prompt</label>
                        <textarea
                            className="form-input"
                            rows={3}
                            value={settings.custom_prompt || ''}
                            onChange={e => setSettings({ ...settings, custom_prompt: e.target.value })}
                            placeholder="e.g., You are a helpful sales assistant for a marketing agency..."
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label className="form-label">Conversation Flow Prompt</label>
                        <textarea
                            className="form-input"
                            rows={3}
                            value={settings.conversation_flow_prompt || ''}
                            onChange={e => setSettings({ ...settings, conversation_flow_prompt: e.target.value })}
                            placeholder="Define the ideal conversation flow for your meetings..."
                        />
                    </div>

                    {/* Knowledge Base button */}
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowDocs(true)}
                        style={{ width: '100%', marginBottom: '1rem' }}
                    >
                        📄 Manage Knowledge Base
                    </button>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AISettings;
