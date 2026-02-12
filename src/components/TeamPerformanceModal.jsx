import React, { useState, useMemo, useEffect } from 'react';
import { formatPrice, getPackagePrice } from '../utils/clients';
import { getSupabaseClient } from '../services/supabase';

const TeamPerformanceModal = ({ clients = [], users = [], onClose }) => {
  const [selectedUser, setSelectedUser] = useState('all');
  const [viewMode, setViewMode] = useState('overview'); // 'overview', 'leaderboard', 'activity'
  const [stageHistory, setStageHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // Calculate team performance metrics
  const teamMetrics = useMemo(() => {
    const metrics = {};

    // Initialize metrics for all users
    users.forEach(user => {
      metrics[user.id] = {
        userId: user.id,
        userName: user.name || user.email,
        userEmail: user.email,
        totalClients: 0,
        booked: 0,
        preparing: 0,
        testing: 0,
        running: 0,
        paidClients: 0,
        monthlyRevenue: 0,
        totalExpenses: 0,
        netProfit: 0
      };
    });

    // Add "All Team" option
    metrics.all = {
      userId: 'all',
      userName: 'All Team',
      userEmail: '',
      totalClients: 0,
      booked: 0,
      preparing: 0,
      testing: 0,
      running: 0,
      paidClients: 0,
      monthlyRevenue: 0,
      totalExpenses: 0,
      netProfit: 0
    };

    // Calculate metrics from clients
    clients.forEach(client => {
      // Handle assignedTo - could be UUID or name string
      let assignedUserId = 'unassigned';
      if (client.assignedTo) {
        // Check if it's a UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(client.assignedTo)) {
          assignedUserId = client.assignedTo;
        } else {
          // It's a name string, find matching user by name or email
          const matchingUser = users.find(u =>
            u.name === client.assignedTo || u.email === client.assignedTo
          );
          assignedUserId = matchingUser ? matchingUser.id : 'unassigned';
        }
      }

      // Update individual user metrics
      if (metrics[assignedUserId]) {
        metrics[assignedUserId].totalClients++;
        if (client.phase === 'booked') metrics[assignedUserId].booked++;
        if (client.phase === 'preparing') metrics[assignedUserId].preparing++;
        if (client.phase === 'testing') metrics[assignedUserId].testing++;
        if (client.phase === 'running') metrics[assignedUserId].running++;
        if (client.paymentStatus === 'paid') metrics[assignedUserId].paidClients++;

        // Revenue from running paid clients
        if (client.phase === 'running' && client.paymentStatus === 'paid') {
          const revenue = getPackagePrice(client);
          metrics[assignedUserId].monthlyRevenue += revenue;
        }
      }

      // Update "All Team" metrics
      metrics.all.totalClients++;
      if (client.phase === 'booked') metrics.all.booked++;
      if (client.phase === 'preparing') metrics.all.preparing++;
      if (client.phase === 'testing') metrics.all.testing++;
      if (client.phase === 'running') metrics.all.running++;
      if (client.paymentStatus === 'paid') metrics.all.paidClients++;

      if (client.phase === 'running' && client.paymentStatus === 'paid') {
        const revenue = getPackagePrice(client);
        metrics.all.monthlyRevenue += revenue;
      }
    });

    // Calculate expenses for each metric
    const expenses = JSON.parse(localStorage.getItem('gaia_expenses') || '{}');
    Object.values(metrics).forEach(metric => {
      // Find clients assigned to this user/metric
      const runningClients = clients.filter(c => {
        if (c.phase !== 'running' || c.paymentStatus !== 'paid') return false;

        if (metric.userId === 'all') return true;

        // Handle assignedTo - could be UUID or name string
        if (!c.assignedTo) return metric.userId === 'unassigned';

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(c.assignedTo)) {
          return c.assignedTo === metric.userId;
        } else {
          // It's a name string
          const matchingUser = users.find(u =>
            (u.name === c.assignedTo || u.email === c.assignedTo) && u.id === metric.userId
          );
          return !!matchingUser;
        }
      });

      metric.totalExpenses = runningClients.reduce((total, client) => {
        const pkgExpense = expenses[client.package] || 0;
        const adsExpense = client.adsExpense || 0;
        return total + pkgExpense + adsExpense;
      }, 0);

      metric.netProfit = metric.monthlyRevenue - metric.totalExpenses;
    });

    return metrics;
  }, [clients, users]);

  // Load stage history for activity tracking
  useEffect(() => {
    const loadStageHistory = async () => {
      const client = getSupabaseClient();
      if (!client) return;

      try {
        setLoading(true);
        const { data, error } = await client
          .from('stage_history')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(500);

        if (!error && data) {
          setStageHistory(data);
        }
      } catch (err) {
        console.error('Error loading stage history:', err);
      } finally {
        setLoading(false);
      }
    };

    loadStageHistory();
  }, []);

  // Calculate user activity metrics
  const userActivity = useMemo(() => {
    const activity = {};

    users.forEach(user => {
      activity[user.id] = {
        userId: user.id,
        userName: user.name || user.email,
        userEmail: user.email,
        clientsCreated: 0,
        phaseChanges: 0,
        lastActivity: null,
        recentActions: []
      };
    });

    // Count clients created by each user
    clients.forEach(client => {
      if (client.createdBy) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(client.createdBy)) {
          if (activity[client.createdBy]) {
            activity[client.createdBy].clientsCreated++;
          }
        }
      }
    });

    // Count phase changes by each user
    stageHistory.forEach(history => {
      if (history.changed_by) {
        if (activity[history.changed_by]) {
          activity[history.changed_by].phaseChanges++;
          const timestamp = new Date(history.timestamp);
          if (!activity[history.changed_by].lastActivity || timestamp > new Date(activity[history.changed_by].lastActivity)) {
            activity[history.changed_by].lastActivity = history.timestamp;
          }
          // Add to recent actions (last 10)
          if (activity[history.changed_by].recentActions.length < 10) {
            activity[history.changed_by].recentActions.push({
              action: `Moved client to ${history.to_phase}`,
              timestamp: history.timestamp,
              clientId: history.client_id
            });
          }
        }
      }
    });

    // Sort recent actions by timestamp
    Object.values(activity).forEach(act => {
      act.recentActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    });

    return activity;
  }, [users, clients, stageHistory]);

  // Leaderboard rankings
  const leaderboard = useMemo(() => {
    const members = Object.values(teamMetrics)
      .filter(m => m.userId !== 'all' && m.userId !== 'unassigned' && m.userEmail !== 'aresmedia2026@gmail.com')
      .map(member => ({
        ...member,
        rank: 0, // Will be set below
        score: member.netProfit + (member.totalClients * 100) + (member.running * 500) // Scoring system
      }))
      .sort((a, b) => b.score - a.score);

    // Assign ranks
    members.forEach((member, index) => {
      member.rank = index + 1;
    });

    return members;
  }, [teamMetrics]);

  const currentMetrics = teamMetrics[selectedUser] || teamMetrics.all;
  const teamMembers = Object.values(teamMetrics).filter(m => m.userId !== 'all' && m.userId !== 'unassigned' && m.userEmail !== 'aresmedia2026@gmail.com');

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">👥 Team Performance</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* View Mode Tabs */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1.5rem',
            borderBottom: '2px solid var(--border-color)',
            paddingBottom: '0.5rem'
          }}>
            <button
              className={`btn ${viewMode === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('overview')}
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            >
              📊 Overview
            </button>
            <button
              className={`btn ${viewMode === 'leaderboard' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('leaderboard')}
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            >
              🏆 Leaderboard
            </button>
            <button
              className={`btn ${viewMode === 'activity' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('activity')}
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            >
              📈 User Activity
            </button>
          </div>

          {/* Overview Mode */}
          {viewMode === 'overview' && (
            <>
              {/* Team Member Selector */}
              <div style={{ marginBottom: '2rem' }}>
                <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  View Performance For:
                </label>
                <select
                  className="form-select"
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  style={{ width: '100%', maxWidth: '400px' }}
                >
                  <option value="all">All Team Members</option>
                  {teamMembers.map(member => (
                    <option key={member.userId} value={member.userId}>
                      {member.userName} ({member.userEmail})
                    </option>
                  ))}
                </select>
              </div>

              {/* Performance Stats Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
              }}>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-icon">👥</div>
                  <div className="stat-value">{currentMetrics.totalClients}</div>
                  <div className="stat-label">Total Clients</div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-icon">📅</div>
                  <div className="stat-value">{currentMetrics.booked}</div>
                  <div className="stat-label">Booked</div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-icon">⏳</div>
                  <div className="stat-value">{currentMetrics.preparing}</div>
                  <div className="stat-label">Preparing</div>
                </div>

              </div>

              {/* Team Members Breakdown */}
              {selectedUser === 'all' && (
                <div>
                  <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Team Members Breakdown</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left' }}>Team Member</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center' }}>Total Clients</th>

                        </tr>
                      </thead>
                      <tbody>
                        {teamMembers
                          .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)
                          .map(member => (
                            <tr key={member.userId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.75rem' }}>
                                <div style={{ fontWeight: '500' }}>{member.userName}</div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                  {member.userEmail}
                                </div>
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>{member.totalClients}</td>

                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Leaderboard Mode */}
          {viewMode === 'leaderboard' && (
            <div>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                🏆 Team Leaderboard - Top Performers
              </h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                Rankings based on profit, client count, and active clients
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'center', width: '60px' }}>Rank</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Team Member</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Total Clients</th>

                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map(member => {
                      const medal = member.rank === 1 ? '🥇' : member.rank === 2 ? '🥈' : member.rank === 3 ? '🥉' : '';
                      return (
                        <tr
                          key={member.userId}
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            backgroundColor: member.rank <= 3 ? 'rgba(74, 222, 128, 0.05)' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>
                            {medal} {member.rank}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <div style={{ fontWeight: '500' }}>{member.userName}</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                              {member.userEmail}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{member.totalClients}</td>

                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                            {member.score.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* User Activity Mode */}
          {viewMode === 'activity' && (
            <div>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                📈 User Activity & Engagement
              </h4>
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                {Object.values(userActivity)
                  .filter(act => act.clientsCreated > 0 || act.phaseChanges > 0)
                  .sort((a, b) => (b.clientsCreated + b.phaseChanges) - (a.clientsCreated + a.phaseChanges))
                  .map(activity => (
                    <div
                      key={activity.userId}
                      style={{
                        padding: '1.5rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                        <div>
                          <h5 style={{ margin: 0, marginBottom: '0.25rem' }}>{activity.userName}</h5>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {activity.userEmail}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {activity.lastActivity && (
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                              Last Active: {new Date(activity.lastActivity).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                            Clients Created
                          </div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {activity.clientsCreated}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                            Phase Changes
                          </div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {activity.phaseChanges}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                            Total Actions
                          </div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {activity.clientsCreated + activity.phaseChanges}
                          </div>
                        </div>
                      </div>
                      {activity.recentActions.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '500' }}>
                            Recent Activity:
                          </div>
                          <div style={{ fontSize: '0.875rem' }}>
                            {activity.recentActions.slice(0, 5).map((action, idx) => (
                              <div key={idx} style={{ marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                                • {action.action} - {new Date(action.timestamp).toLocaleString()}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
              {Object.values(userActivity).filter(act => act.clientsCreated > 0 || act.phaseChanges > 0).length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No user activity data available yet.
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamPerformanceModal;


