import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';
import SalaryTrackingModal from './SalaryTrackingModal';

const EmployeeSalaryManagement = () => {
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [userSalaries, setUserSalaries] = useState({}); // { userId: { clientId: salary } }
  const [userSettings, setUserSettings] = useState({}); // { userId: { payment_frequency } }
  const [teamLeaders, setTeamLeaders] = useState({}); // { userId: teamLeaderId }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showSalaryTracking, setShowSalaryTracking] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setLoading(true);
    try {
      // Load users
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, email, team_leader_id, role')
        .order('name');
      setUsers(usersData || []);

      // Load clients
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id, client_name, assigned_to, payment_status')
        .order('client_name');
      setClients(clientsData || []);

      // Load user salary settings
      const { data: settingsData } = await supabase
        .from('user_salary_settings')
        .select('*');
      
      const settingsMap = {};
      (settingsData || []).forEach(setting => {
        settingsMap[setting.user_id] = setting;
      });
      setUserSettings(settingsMap);

      // Load user-client salaries
      const { data: salariesData } = await supabase
        .from('user_client_salary')
        .select('*');
      
      const salariesMap = {};
      (salariesData || []).forEach(salary => {
        if (!salariesMap[salary.user_id]) {
          salariesMap[salary.user_id] = {};
        }
        salariesMap[salary.user_id][salary.client_id] = salary.salary_amount;
      });
      setUserSalaries(salariesMap);

      // Load team leaders
      const leadersMap = {};
      (usersData || []).forEach(user => {
        if (user.team_leader_id) {
          leadersMap[user.id] = user.team_leader_id;
        }
      });
      setTeamLeaders(leadersMap);
    } catch (error) {
      console.error('Error loading data:', error);
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const handleTeamLeaderChange = async (userId, teamLeaderId) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({ team_leader_id: teamLeaderId || null })
        .eq('id', userId);

      if (error) throw error;
      
      setTeamLeaders(prev => ({
        ...prev,
        [userId]: teamLeaderId || null
      }));
    } catch (error) {
      console.error('Error updating team leader:', error);
      alert('Failed to update team leader');
    }
  };

  const handlePaymentFrequencyChange = async (userId, frequency) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('user_salary_settings')
        .upsert({
          user_id: userId,
          payment_frequency: frequency
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
      
      setUserSettings(prev => ({
        ...prev,
        [userId]: { ...prev[userId], payment_frequency: frequency }
      }));
    } catch (error) {
      console.error('Error updating payment frequency:', error);
      alert('Failed to update payment frequency');
    }
  };

  const handleSalaryChange = async (userId, clientId, salary) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const salaryAmount = parseFloat(salary) || 0;
      
      if (salaryAmount === 0) {
        // Remove salary if set to 0
        const { error } = await supabase
          .from('user_client_salary')
          .delete()
          .eq('user_id', userId)
          .eq('client_id', clientId);
        
        if (error) throw error;
      } else {
        // Upsert salary
        const { error } = await supabase
          .from('user_client_salary')
          .upsert({
            user_id: userId,
            client_id: clientId,
            salary_amount: salaryAmount
          }, {
            onConflict: 'user_id,client_id'
          });

        if (error) throw error;
      }
      
      setUserSalaries(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          [clientId]: salaryAmount
        }
      }));
    } catch (error) {
      console.error('Error updating salary:', error);
      alert('Failed to update salary');
    }
  };

  const getClientSalaries = (userId) => {
    const userClients = clients.filter(c => c.assigned_to === userId);
    return userClients.map(client => ({
      ...client,
      salary: userSalaries[userId]?.[client.id] || 0
    }));
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  const regularUsers = users.filter(u => u.role === 'user');
  const adminUsers = users.filter(u => u.role === 'admin');

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>👥 Employee & Salary Management</h4>
        <button
          className="btn btn-primary"
          onClick={() => setShowSalaryTracking(true)}
        >
          💰 View Salary Tracking
        </button>
      </div>

      {/* Team Leader Assignment */}
      <div style={{ marginBottom: '2rem' }}>
        <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Team Leader Assignment</h5>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Assign team leaders to manage employees
        </p>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {regularUsers.map(user => (
            <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
              <div style={{ flex: 1 }}>
                <strong>{user.name}</strong>
                {user.email && <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{user.email}</div>}
              </div>
              <div style={{ flex: 1 }}>
                <select
                  className="form-select"
                  value={teamLeaders[user.id] || ''}
                  onChange={(e) => handleTeamLeaderChange(user.id, e.target.value)}
                >
                  <option value="">No Team Leader</option>
                  {adminUsers.map(admin => (
                    <option key={admin.id} value={admin.id}>{admin.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Frequency Settings */}
      <div style={{ marginBottom: '2rem' }}>
        <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Payment Frequency Settings</h5>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Set how often each employee gets paid
        </p>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {regularUsers.map(user => (
            <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
              <div style={{ flex: 1 }}>
                <strong>{user.name}</strong>
              </div>
              <div style={{ flex: 1 }}>
                <select
                  className="form-select"
                  value={userSettings[user.id]?.payment_frequency || 'monthly'}
                  onChange={(e) => handlePaymentFrequencyChange(user.id, e.target.value)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="instant">Instant</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Salary Per Client */}
      <div style={{ marginBottom: '2rem' }}>
        <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Salary Per Client</h5>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Set salary amount per client for each employee. Only paid clients will generate salary payments. Salary is only paid when the client's payment status is "paid".
        </p>
        {regularUsers.filter(user => getClientSalaries(user.id).length > 0).length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
            No clients assigned to employees yet. Assign clients to employees in the client edit modal.
          </div>
        ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {regularUsers.map(user => {
            const clientSalaries = getClientSalaries(user.id);
            if (clientSalaries.length === 0) return null;
            
            return (
              <div key={user.id} style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <div style={{ marginBottom: '1rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {user.name}
                </div>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {clientSalaries.map(client => (
                    <div key={client.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem', background: 'var(--bg-primary)', borderRadius: '4px' }}>
                      <div style={{ flex: 1 }}>
                        <strong>{client.client_name}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Status: {client.payment_status}
                        </div>
                      </div>
                      <div style={{ width: '150px' }}>
                        <input
                          type="number"
                          className="form-input"
                          value={client.salary || ''}
                          onChange={(e) => handleSalaryChange(user.id, client.id, e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          style={{ textAlign: 'right' }}
                        />
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', width: '80px' }}>
                        ₱ per {userSettings[user.id]?.payment_frequency || 'month'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {message.text && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          borderRadius: '4px',
          backgroundColor: message.type === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: message.type === 'success' ? 'var(--success)' : 'var(--error)'
        }}>
          {message.text}
        </div>
      )}

      {showSalaryTracking && (
        <SalaryTrackingModal
          isOpen={showSalaryTracking}
          onClose={() => setShowSalaryTracking(false)}
        />
      )}
    </div>
  );
};

export default EmployeeSalaryManagement;

