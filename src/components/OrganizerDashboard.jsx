import React, { useState, useEffect } from 'react';
import { getOrganizationTeams, createTeamWithAdmin, deleteTeam } from '../services/teamService';
import { showToast } from '../utils/toast';

/**
 * Organizer Dashboard
 * Shows list of admins/teams with their stats
 * Only visible to organizers
 */
export default function OrganizerDashboard({ onLogout, onThemeToggle }) {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newTeam, setNewTeam] = useState({
        teamName: '',
        adminEmail: '',
        adminName: '',
        adminPassword: ''
    });
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        loadTeams();
    }, []);

    async function loadTeams() {
        setLoading(true);
        const { data, error } = await getOrganizationTeams();
        if (error) {
            console.error('Error loading teams:', error);
        }
        setTeams(data || []);
        setLoading(false);
    }

    async function handleCreateTeam(e) {
        e.preventDefault();
        if (!newTeam.teamName || !newTeam.adminEmail || !newTeam.adminName || !newTeam.adminPassword) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        setCreating(true);
        try {
            const { error } = await createTeamWithAdmin(
                newTeam.teamName,
                newTeam.adminEmail,
                newTeam.adminName,
                newTeam.adminPassword
            );

            if (error) {
                showToast('Failed to create team: ' + error.message, 'error');
            } else {
                showToast('Team and admin created successfully!', 'success');
                setNewTeam({ teamName: '', adminEmail: '', adminName: '', adminPassword: '' });
                setShowAddForm(false);
                await loadTeams();
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setCreating(false);
        }
    }

    async function handleDeleteTeam(teamId, teamName) {
        if (!confirm(`Are you sure you want to delete "${teamName}"? This will delete all team data.`)) {
            return;
        }

        const { error } = await deleteTeam(teamId);
        if (error) {
            showToast('Failed to delete team: ' + error.message, 'error');
        } else {
            showToast('Team deleted', 'success');
            await loadTeams();
        }
    }

    return (
        <div className="organizer-dashboard">
            {/* Header */}
            <header className="dashboard-header">
                <div className="header-left">
                    <span className="logo">🏢</span>
                    <h1>GAIA Organizer</h1>
                </div>
                <div className="header-right">
                    <button className="btn btn-secondary" onClick={onThemeToggle}>🌙</button>
                    <button className="btn btn-secondary" onClick={onLogout}>🚪 Logout</button>
                </div>
            </header>

            {/* Main Content */}
            <main className="dashboard-main">
                <div className="dashboard-title">
                    <h2>👥 Admin Teams</h2>
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowAddForm(!showAddForm)}
                    >
                        {showAddForm ? '✕ Cancel' : '➕ Add Admin Team'}
                    </button>
                </div>

                {/* Add Team Form */}
                {showAddForm && (
                    <div className="add-team-form">
                        <h3>Create New Admin Team</h3>
                        <form onSubmit={handleCreateTeam}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Team Name</label>
                                    <input
                                        type="text"
                                        value={newTeam.teamName}
                                        onChange={(e) => setNewTeam({ ...newTeam, teamName: e.target.value })}
                                        placeholder="e.g., Sales Team Alpha"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Admin Name</label>
                                    <input
                                        type="text"
                                        value={newTeam.adminName}
                                        onChange={(e) => setNewTeam({ ...newTeam, adminName: e.target.value })}
                                        placeholder="John Doe"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Admin Email</label>
                                    <input
                                        type="email"
                                        value={newTeam.adminEmail}
                                        onChange={(e) => setNewTeam({ ...newTeam, adminEmail: e.target.value })}
                                        placeholder="admin@example.com"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Admin Password</label>
                                    <input
                                        type="password"
                                        value={newTeam.adminPassword}
                                        onChange={(e) => setNewTeam({ ...newTeam, adminPassword: e.target.value })}
                                        placeholder="Min 6 characters"
                                        minLength={6}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={creating}>
                                    {creating ? 'Creating...' : 'Create Team & Admin'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Teams Grid */}
                {loading ? (
                    <div className="loading">Loading teams...</div>
                ) : teams.length === 0 ? (
                    <div className="empty-state">
                        <p>No admin teams yet. Create your first team above.</p>
                    </div>
                ) : (
                    <div className="teams-grid">
                        {teams.map((team) => (
                            <div key={team.team_id} className="team-card">
                                <div className="team-header">
                                    <h3>{team.team_name}</h3>
                                    <button
                                        className="btn btn-danger btn-sm"
                                        onClick={() => handleDeleteTeam(team.team_id, team.team_name)}
                                    >
                                        🗑️
                                    </button>
                                </div>

                                <div className="admin-info">
                                    <div className="admin-avatar">
                                        {team.admin_name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <div>
                                        <div className="admin-name">{team.admin_name || 'No Admin'}</div>
                                        <div className="admin-email">{team.admin_email || '-'}</div>
                                    </div>
                                </div>

                                <div className="team-stats">
                                    <div className="stat">
                                        <span className="stat-value">{team.user_count || 0}</span>
                                        <span className="stat-label">Users</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-value">{team.client_count || 0}</span>
                                        <span className="stat-label">Clients</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-value">{team.facebook_page_count || 0}</span>
                                        <span className="stat-label">FB Pages</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-value">{team.property_count || 0}</span>
                                        <span className="stat-label">Properties</span>
                                    </div>
                                </div>

                                <div className="team-footer">
                                    <small>Created {new Date(team.created_at).toLocaleDateString()}</small>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            <style jsx>{`
                .organizer-dashboard {
                    min-height: 100vh;
                    background: var(--bg-primary, #0f0f1a);
                    color: var(--text-primary, #fff);
                }

                .dashboard-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 24px;
                    background: var(--bg-secondary, #1a1a2e);
                    border-bottom: 1px solid var(--border-color, #333);
                }

                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .logo {
                    font-size: 2rem;
                }

                .header-left h1 {
                    margin: 0;
                    font-size: 1.5rem;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .header-right {
                    display: flex;
                    gap: 12px;
                }

                .dashboard-main {
                    max-width: 1400px;
                    margin: 0 auto;
                    padding: 32px 24px;
                }

                .dashboard-title {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                }

                .dashboard-title h2 {
                    margin: 0;
                    font-size: 1.75rem;
                }

                .add-team-form {
                    background: var(--bg-secondary, #1a1a2e);
                    border-radius: 12px;
                    padding: 24px;
                    margin-bottom: 24px;
                    border: 1px solid var(--border-color, #333);
                }

                .add-team-form h3 {
                    margin: 0 0 20px 0;
                }

                .form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    margin-bottom: 20px;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 6px;
                    color: var(--text-secondary, #aaa);
                    font-size: 0.875rem;
                }

                .form-group input {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid var(--border-color, #444);
                    border-radius: 8px;
                    background: var(--bg-primary, #0f0f1a);
                    color: var(--text-primary, #fff);
                    font-size: 14px;
                }

                .form-actions {
                    display: flex;
                    justify-content: flex-end;
                }

                .teams-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 20px;
                }

                .team-card {
                    background: var(--bg-secondary, #1a1a2e);
                    border-radius: 12px;
                    padding: 20px;
                    border: 1px solid var(--border-color, #333);
                    transition: transform 0.2s, box-shadow 0.2s;
                }

                .team-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
                }

                .team-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }

                .team-header h3 {
                    margin: 0;
                    font-size: 1.1rem;
                }

                .admin-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    background: var(--bg-tertiary, #252540);
                    border-radius: 8px;
                    margin-bottom: 16px;
                }

                .admin-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    font-size: 1.1rem;
                }

                .admin-name {
                    font-weight: 500;
                }

                .admin-email {
                    font-size: 0.8rem;
                    color: var(--text-secondary, #888);
                }

                .team-stats {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 8px;
                    margin-bottom: 16px;
                }

                .stat {
                    text-align: center;
                    padding: 8px;
                    background: var(--bg-primary, #0f0f1a);
                    border-radius: 6px;
                }

                .stat-value {
                    display: block;
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--accent-color, #6366f1);
                }

                .stat-label {
                    display: block;
                    font-size: 0.7rem;
                    color: var(--text-secondary, #888);
                    text-transform: uppercase;
                }

                .team-footer {
                    text-align: right;
                    color: var(--text-muted, #666);
                }

                .loading, .empty-state {
                    text-align: center;
                    padding: 60px 20px;
                    color: var(--text-secondary, #888);
                }

                .btn {
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                    transition: all 0.2s;
                }

                .btn-sm {
                    padding: 6px 12px;
                    font-size: 0.875rem;
                }

                .btn-primary {
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                }

                .btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
                }

                .btn-secondary {
                    background: var(--bg-tertiary, #333);
                    color: var(--text-primary, #fff);
                }

                .btn-danger {
                    background: #ef4444;
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
