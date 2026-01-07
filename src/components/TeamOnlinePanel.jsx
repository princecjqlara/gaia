import React, { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../services/supabase';

/**
 * TeamOnlinePanel
 * Admin panel component showing online team members and auto-assign settings
 */
const TeamOnlinePanel = ({ onClose }) => {
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Calculate duration from clock in time
    const calculateDuration = (clockInTime) => {
        if (!clockInTime) return 0;
        const now = new Date();
        const clockIn = new Date(clockInTime);
        return Math.floor((now - clockIn) / (1000 * 60)); // minutes
    };

    // Format duration for display
    const formatDuration = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    };

    // Load online users and settings
    const loadData = useCallback(async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        try {
            setLoading(true);

            // Get all users
            const { data: users, error: usersError } = await supabase
                .from('users')
                .select('id, name, email, role, is_clocked_in, last_clock_in')
                .order('name');

            if (usersError) throw usersError;

            // Add duration to clocked in users
            const usersWithDuration = (users || []).map(user => ({
                ...user,
                duration: user.is_clocked_in ? calculateDuration(user.last_clock_in) : 0,
                durationFormatted: user.is_clocked_in ? formatDuration(calculateDuration(user.last_clock_in)) : ''
            }));

            setAllUsers(usersWithDuration);
            setOnlineUsers(usersWithDuration.filter(u => u.is_clocked_in));

            // Get auto-assign setting
            const { data: setting } = await supabase
                .from('facebook_settings')
                .select('setting_value')
                .eq('setting_key', 'auto_assign_enabled')
                .single();

            if (setting?.setting_value?.enabled !== undefined) {
                setAutoAssignEnabled(setting.setting_value.enabled);
            }

        } catch (err) {
            console.error('Error loading team data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Toggle auto-assign
    const toggleAutoAssign = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        setSaving(true);
        try {
            const newValue = !autoAssignEnabled;

            const { error } = await supabase
                .from('facebook_settings')
                .upsert({
                    setting_key: 'auto_assign_enabled',
                    setting_value: { enabled: newValue }
                }, { onConflict: 'setting_key' });

            if (error) throw error;

            setAutoAssignEnabled(newValue);
        } catch (err) {
            console.error('Error saving auto-assign setting:', err);
        } finally {
            setSaving(false);
        }
    };

    // Update user role
    const updateUserRole = async (userId, newRole) => {
        const supabase = getSupabaseClient();
        if (!supabase) {
            alert('Database connection not available');
            return;
        }

        try {
            const { error } = await supabase
                .from('users')
                .update({ role: newRole })
                .eq('id', userId);

            if (error) {
                console.error('Supabase error:', error);
                alert(`Failed to update role: ${error.message}`);
                return;
            }

            // Update local state immediately for responsiveness
            setAllUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, role: newRole } : u
            ));
            setOnlineUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, role: newRole } : u
            ));

            console.log(`Role updated for ${userId} to ${newRole}`);
        } catch (err) {
            console.error('Error updating user role:', err);
            alert(`Error: ${err.message}`);
        }
    };

    useEffect(() => {
        loadData();
        // Refresh every 30 seconds
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, [loadData]);

    return (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
            <div className="modal" style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h2>👥 Team & Auto-Assign</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div className="modal-body" style={{ padding: '1.5rem' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                            Loading...
                        </div>
                    ) : (
                        <>
                            {/* Auto-Assign Toggle */}
                            <div style={{
                                background: 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-lg)',
                                padding: '1rem 1.25rem',
                                marginBottom: '1.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                                        ⚡ Auto-Assign Round Robin
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Automatically assign new conversations to clocked-in users (excludes admin and chat support)
                                    </div>
                                </div>
                                <button
                                    onClick={toggleAutoAssign}
                                    disabled={saving}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: 'var(--radius-md)',
                                        border: 'none',
                                        cursor: saving ? 'wait' : 'pointer',
                                        fontWeight: '600',
                                        background: autoAssignEnabled ? '#22c55e' : 'var(--bg-tertiary)',
                                        color: autoAssignEnabled ? 'white' : 'var(--text-secondary)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {autoAssignEnabled ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            {/* Online Team Section */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <h3 style={{
                                    margin: '0 0 1rem 0',
                                    fontSize: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    🟢 Online Now ({onlineUsers.length})
                                </h3>

                                {onlineUsers.length === 0 ? (
                                    <div style={{
                                        padding: '1.5rem',
                                        textAlign: 'center',
                                        color: 'var(--text-muted)',
                                        background: 'var(--bg-secondary)',
                                        borderRadius: 'var(--radius-md)'
                                    }}>
                                        No team members are currently online
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {onlineUsers.map(user => (
                                            <div key={user.id} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '0.75rem 1rem',
                                                background: 'var(--bg-secondary)',
                                                borderRadius: 'var(--radius-md)',
                                                borderLeft: '3px solid #22c55e'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <span style={{
                                                        width: '10px',
                                                        height: '10px',
                                                        borderRadius: '50%',
                                                        background: '#22c55e',
                                                        boxShadow: '0 0 8px #22c55e'
                                                    }} />
                                                    <div>
                                                        <div style={{ fontWeight: '500' }}>
                                                            {user.name || user.email}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            {user.role} • Online for {user.durationFormatted}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* All Team Members */}
                            <div>
                                <h3 style={{
                                    margin: '0 0 1rem 0',
                                    fontSize: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    👤 All Team Members ({allUsers.length})
                                </h3>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {allUsers.map(user => (
                                        <div key={user.id} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.75rem 1rem',
                                            background: 'var(--bg-secondary)',
                                            borderRadius: 'var(--radius-md)',
                                            opacity: user.is_clocked_in ? 1 : 0.7
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <span style={{
                                                    width: '10px',
                                                    height: '10px',
                                                    borderRadius: '50%',
                                                    background: user.is_clocked_in ? '#22c55e' : '#6b7280'
                                                }} />
                                                <div>
                                                    <div style={{ fontWeight: '500' }}>
                                                        {user.name || user.email}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {user.is_clocked_in ? `Online ${user.durationFormatted}` : 'Offline'}
                                                    </div>
                                                </div>
                                            </div>
                                            <select
                                                value={user.role || 'user'}
                                                onChange={(e) => updateUserRole(user.id, e.target.value)}
                                                style={{
                                                    padding: '0.35rem 0.5rem',
                                                    borderRadius: 'var(--radius-sm)',
                                                    border: '1px solid var(--border-color)',
                                                    background: 'var(--bg-primary)',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <option value="user">👤 User</option>
                                                <option value="chat_support">💬 Chat Support</option>
                                                <option value="admin">👑 Admin</option>
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="modal-footer" style={{
                    borderTop: '1px solid var(--border-color)',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'flex-end'
                }}>
                    <button className="btn btn-secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TeamOnlinePanel;
