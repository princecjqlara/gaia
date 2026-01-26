import React, { useState, useEffect } from 'react';
import { useOrganization } from '../hooks/useOrganization';
import { updateOrganization, getOrganizationStats } from '../services/organizationService';
import { showToast } from '../utils/toast';

/**
 * Organization Settings Component
 * Allows organizers to manage their organization settings
 */
export default function OrganizationSettings({ onClose }) {
    const { organization, isOrganizer, refreshOrganization } = useOrganization();
    const [name, setName] = useState('');
    const [stats, setStats] = useState(null);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (organization) {
            setName(organization.name || '');
            loadStats();
        }
    }, [organization]);

    async function loadStats() {
        setLoading(true);
        const { data } = await getOrganizationStats();
        setStats(data);
        setLoading(false);
    }

    async function handleSave() {
        if (!organization || !isOrganizer) return;

        setSaving(true);
        try {
            const { error } = await updateOrganization(organization.id, { name });
            if (error) {
                showToast('Failed to update organization: ' + error.message, 'error');
            } else {
                showToast('Organization updated successfully!', 'success');
                await refreshOrganization();
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    }

    if (!organization) {
        return (
            <div className="organization-settings-modal">
                <div className="modal-header">
                    <h2>Organization Settings</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <p>No organization found. Please contact support.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="organization-settings-modal">
            <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img src="/logo.jpg" alt="GAIA Logo" style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover' }} />
                    <h2 style={{ margin: 0 }}>Organization Settings</h2>
                </div>
                <button className="close-btn" onClick={onClose}>×</button>
            </div>

            <div className="modal-body">
                {/* Organization Info */}
                <div className="settings-section">
                    <h3>Organization Info</h3>

                    <div className="form-group">
                        <label>Organization Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={!isOrganizer}
                            placeholder="Enter organization name"
                        />
                    </div>

                    <div className="form-group">
                        <label>Slug (URL Identifier)</label>
                        <input
                            type="text"
                            value={organization.slug || ''}
                            disabled
                            className="disabled-input"
                        />
                        <small>This cannot be changed</small>
                    </div>

                    <div className="form-group">
                        <label>Created</label>
                        <input
                            type="text"
                            value={new Date(organization.created_at).toLocaleDateString()}
                            disabled
                            className="disabled-input"
                        />
                    </div>
                </div>

                {/* Organization Stats */}
                <div className="settings-section">
                    <h3>📊 Organization Stats</h3>
                    {loading ? (
                        <p>Loading stats...</p>
                    ) : stats ? (
                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-number">{stats.members}</div>
                                <div className="stat-label">Team Members</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-number">{stats.clients}</div>
                                <div className="stat-label">Clients</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-number">{stats.facebookPages}</div>
                                <div className="stat-label">Facebook Pages</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-number">{stats.properties}</div>
                                <div className="stat-label">Properties</div>
                            </div>
                        </div>
                    ) : (
                        <p>Unable to load stats</p>
                    )}
                </div>

                {/* Danger Zone (for organizers only) */}
                {isOrganizer && (
                    <div className="settings-section danger-zone">
                        <h3>⚠️ Danger Zone</h3>
                        <p>These actions are irreversible. Please be careful.</p>
                        <button className="btn btn-danger" disabled>
                            Delete Organization
                        </button>
                        <small>Contact support to delete your organization</small>
                    </div>
                )}
            </div>

            <div className="modal-footer">
                <button className="btn btn-secondary" onClick={onClose}>
                    Cancel
                </button>
                {isOrganizer && (
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                )}
            </div>

            <style jsx>{`
                .organization-settings-modal {
                    background: var(--bg-secondary, #1e1e2e);
                    border-radius: 12px;
                    width: 100%;
                    max-width: 600px;
                    max-height: 90vh;
                    overflow-y: auto;
                    color: var(--text-primary, #fff);
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px;
                    border-bottom: 1px solid var(--border-color, #333);
                }

                .modal-header h2 {
                    margin: 0;
                    font-size: 1.5rem;
                }

                .close-btn {
                    background: none;
                    border: none;
                    color: var(--text-secondary, #888);
                    font-size: 1.5rem;
                    cursor: pointer;
                }

                .modal-body {
                    padding: 20px;
                }

                .settings-section {
                    margin-bottom: 24px;
                    padding: 16px;
                    background: var(--bg-tertiary, #2a2a3e);
                    border-radius: 8px;
                }

                .settings-section h3 {
                    margin: 0 0 16px 0;
                    font-size: 1.1rem;
                }

                .form-group {
                    margin-bottom: 16px;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 6px;
                    font-weight: 500;
                    color: var(--text-secondary, #aaa);
                }

                .form-group input {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid var(--border-color, #444);
                    border-radius: 6px;
                    background: var(--bg-primary, #121220);
                    color: var(--text-primary, #fff);
                    font-size: 14px;
                }

                .form-group input:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .form-group small {
                    display: block;
                    margin-top: 4px;
                    color: var(--text-muted, #666);
                    font-size: 12px;
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                }

                .stat-card {
                    background: var(--bg-primary, #121220);
                    padding: 16px;
                    border-radius: 8px;
                    text-align: center;
                }

                .stat-number {
                    font-size: 2rem;
                    font-weight: 700;
                    color: var(--accent-color, #6366f1);
                }

                .stat-label {
                    font-size: 0.85rem;
                    color: var(--text-secondary, #888);
                }

                .danger-zone {
                    border: 1px solid #ef4444;
                    background: rgba(239, 68, 68, 0.1);
                }

                .danger-zone h3 {
                    color: #ef4444;
                }

                .btn-danger {
                    background: #ef4444;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    margin-right: 10px;
                }

                .btn-danger:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    padding: 20px;
                    border-top: 1px solid var(--border-color, #333);
                }

                .btn {
                    padding: 10px 20px;
                    border-radius: 6px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                }

                .btn-secondary {
                    background: var(--bg-tertiary, #333);
                    color: var(--text-primary, #fff);
                }

                .btn-primary {
                    background: var(--accent-color, #6366f1);
                    color: white;
                }

                .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
}
