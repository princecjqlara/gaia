import React, { useState } from 'react';
import { useOrganization } from '../hooks/useOrganization';
import { addOrganizationMember, updateMemberRole, removeMember } from '../services/organizationService';
import { showToast } from '../utils/toast';

/**
 * Admin Management Component
 * Allows organizers to add, edit, and remove admins in their organization
 */
export default function AdminManagement({ onClose }) {
    const { organization, members, isOrganizer, refreshMembers } = useOrganization();
    const [showAddForm, setShowAddForm] = useState(false);
    const [newMember, setNewMember] = useState({ email: '', name: '', password: '', role: 'admin' });
    const [loading, setLoading] = useState(false);

    async function handleAddMember(e) {
        e.preventDefault();
        if (!newMember.email || !newMember.name || !newMember.password) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        setLoading(true);
        try {
            const { error } = await addOrganizationMember(
                newMember.email,
                newMember.name,
                newMember.password,
                newMember.role
            );

            if (error) {
                showToast('Failed to add member: ' + error.message, 'error');
            } else {
                showToast('Member added successfully!', 'success');
                setNewMember({ email: '', name: '', password: '', role: 'admin' });
                setShowAddForm(false);
                await refreshMembers();
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    async function handleRoleChange(userId, newRole) {
        const { error } = await updateMemberRole(userId, newRole);
        if (error) {
            showToast('Failed to update role: ' + error.message, 'error');
        } else {
            showToast('Role updated!', 'success');
            await refreshMembers();
        }
    }

    async function handleRemoveMember(userId, memberName) {
        if (!confirm(`Are you sure you want to remove ${memberName} from the organization?`)) {
            return;
        }

        const { error } = await removeMember(userId);
        if (error) {
            showToast('Failed to remove member: ' + error.message, 'error');
        } else {
            showToast('Member removed', 'success');
            await refreshMembers();
        }
    }

    function getRoleBadgeClass(role) {
        switch (role) {
            case 'organizer': return 'badge-purple';
            case 'admin': return 'badge-blue';
            default: return 'badge-gray';
        }
    }

    if (!organization) {
        return (
            <div className="admin-management-modal">
                <div className="modal-header">
                    <h2>Team Management</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <p>No organization found.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-management-modal">
            <div className="modal-header">
                <h2>👥 Team Management</h2>
                <button className="close-btn" onClick={onClose}>×</button>
            </div>

            <div className="modal-body">
                {/* Add Member Button */}
                {isOrganizer && !showAddForm && (
                    <button
                        className="btn btn-primary add-member-btn"
                        onClick={() => setShowAddForm(true)}
                    >
                        + Add Team Member
                    </button>
                )}

                {/* Add Member Form */}
                {showAddForm && (
                    <div className="add-member-form">
                        <h3>Add New Team Member</h3>
                        <form onSubmit={handleAddMember}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        value={newMember.email}
                                        onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                                        placeholder="member@example.com"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Name</label>
                                    <input
                                        type="text"
                                        value={newMember.name}
                                        onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                                        placeholder="John Doe"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Password</label>
                                    <input
                                        type="password"
                                        value={newMember.password}
                                        onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                                        placeholder="Temporary password"
                                        required
                                        minLength={6}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Role</label>
                                    <select
                                        value={newMember.role}
                                        onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                                    >
                                        <option value="admin">Admin</option>
                                        <option value="user">User</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'Adding...' : 'Add Member'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Members List */}
                <div className="members-section">
                    <h3>Team Members ({members.length})</h3>

                    {members.length === 0 ? (
                        <p className="empty-state">No team members yet. Add your first member above.</p>
                    ) : (
                        <div className="members-list">
                            {members.map((member) => (
                                <div key={member.id} className="member-card">
                                    <div className="member-info">
                                        <div className="member-avatar">
                                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                        <div className="member-details">
                                            <div className="member-name">{member.name}</div>
                                            <div className="member-email">{member.email}</div>
                                        </div>
                                        <span className={`role-badge ${getRoleBadgeClass(member.role)}`}>
                                            {member.role}
                                        </span>
                                    </div>

                                    {isOrganizer && member.role !== 'organizer' && (
                                        <div className="member-actions">
                                            <select
                                                value={member.role}
                                                onChange={(e) => handleRoleChange(member.id, e.target.value)}
                                                className="role-select"
                                            >
                                                <option value="admin">Admin</option>
                                                <option value="user">User</option>
                                            </select>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => handleRemoveMember(member.id, member.name)}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    )}

                                    {member.role === 'organizer' && (
                                        <div className="member-actions">
                                            <span className="owner-label">Owner</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="modal-footer">
                <button className="btn btn-secondary" onClick={onClose}>
                    Close
                </button>
            </div>

            <style jsx>{`
                .admin-management-modal {
                    background: var(--bg-secondary, #1e1e2e);
                    border-radius: 12px;
                    width: 100%;
                    max-width: 700px;
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

                .add-member-btn {
                    width: 100%;
                    margin-bottom: 20px;
                }

                .add-member-form {
                    background: var(--bg-tertiary, #2a2a3e);
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }

                .add-member-form h3 {
                    margin: 0 0 16px 0;
                }

                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                    margin-bottom: 16px;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                }

                .form-group label {
                    margin-bottom: 6px;
                    font-weight: 500;
                    color: var(--text-secondary, #aaa);
                }

                .form-group input,
                .form-group select {
                    padding: 10px 12px;
                    border: 1px solid var(--border-color, #444);
                    border-radius: 6px;
                    background: var(--bg-primary, #121220);
                    color: var(--text-primary, #fff);
                    font-size: 14px;
                }

                .form-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    margin-top: 16px;
                }

                .members-section h3 {
                    margin: 0 0 16px 0;
                }

                .empty-state {
                    text-align: center;
                    color: var(--text-muted, #666);
                    padding: 40px;
                }

                .members-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .member-card {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: var(--bg-tertiary, #2a2a3e);
                    padding: 16px;
                    border-radius: 8px;
                }

                .member-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .member-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: var(--accent-color, #6366f1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    font-size: 1.1rem;
                }

                .member-name {
                    font-weight: 500;
                }

                .member-email {
                    font-size: 0.85rem;
                    color: var(--text-secondary, #888);
                }

                .role-badge {
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 0.75rem;
                    font-weight: 500;
                    text-transform: uppercase;
                }

                .badge-purple {
                    background: rgba(139, 92, 246, 0.2);
                    color: #a78bfa;
                }

                .badge-blue {
                    background: rgba(59, 130, 246, 0.2);
                    color: #60a5fa;
                }

                .badge-gray {
                    background: rgba(156, 163, 175, 0.2);
                    color: #9ca3af;
                }

                .member-actions {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .role-select {
                    padding: 6px 10px;
                    border: 1px solid var(--border-color, #444);
                    border-radius: 6px;
                    background: var(--bg-primary, #121220);
                    color: var(--text-primary, #fff);
                    font-size: 13px;
                }

                .owner-label {
                    color: var(--text-muted, #666);
                    font-style: italic;
                }

                .btn {
                    padding: 10px 20px;
                    border-radius: 6px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                }

                .btn-sm {
                    padding: 6px 12px;
                    font-size: 13px;
                }

                .btn-secondary {
                    background: var(--bg-tertiary, #333);
                    color: var(--text-primary, #fff);
                }

                .btn-primary {
                    background: var(--accent-color, #6366f1);
                    color: white;
                }

                .btn-danger {
                    background: #ef4444;
                    color: white;
                }

                .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    padding: 20px;
                    border-top: 1px solid var(--border-color, #333);
                }

                @media (max-width: 600px) {
                    .form-row {
                        grid-template-columns: 1fr;
                    }
                    
                    .member-card {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 12px;
                    }
                    
                    .member-actions {
                        width: 100%;
                        justify-content: flex-end;
                    }
                }
            `}</style>
        </div>
    );
}
