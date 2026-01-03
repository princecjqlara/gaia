import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

const SalaryTrackingModal = ({ isOpen, onClose }) => {
  const [salaryPayments, setSalaryPayments] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // all, pending, paid
  const [filterUser, setFilterUser] = useState('all');
  const [filterDate, setFilterDate] = useState('upcoming'); // upcoming, past, all

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, filterStatus, filterUser, filterDate]);

  const loadData = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setLoading(true);
    try {
      // Load users
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, email')
        .order('name');
      setUsers(usersData || []);

      // Load clients
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id, client_name')
        .order('client_name');
      setClients(clientsData || []);

      // Load salary payments
      let query = supabase
        .from('salary_payments')
        .select('*')
        .order('scheduled_date', { ascending: true });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      if (filterUser !== 'all') {
        query = query.eq('user_id', filterUser);
      }

      const { data: paymentsData } = await query;

      // Filter by date
      const now = new Date();
      let filteredPayments = paymentsData || [];
      
      if (filterDate === 'upcoming') {
        filteredPayments = filteredPayments.filter(p => new Date(p.scheduled_date) >= now);
      } else if (filterDate === 'past') {
        filteredPayments = filteredPayments.filter(p => new Date(p.scheduled_date) < now);
      }

      setSalaryPayments(filteredPayments);
    } catch (error) {
      console.error('Error loading salary data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user ? user.name : 'Unknown User';
  };

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client ? client.client_name : 'Unknown Client';
  };

  const formatCurrency = (amount) => {
    return `₱${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const markAsPaid = async (paymentId) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('salary_payments')
        .update({ 
          status: 'paid',
          payment_date: new Date().toISOString().split('T')[0]
        })
        .eq('id', paymentId);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error marking payment as paid:', error);
      alert('Failed to update payment status');
    }
  };

  const calculateTotals = () => {
    const pending = salaryPayments
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    
    const paid = salaryPayments
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    return { pending, paid, total: pending + paid };
  };

  const totals = calculateTotals();

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1200px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">💰 Salary Tracking Dashboard</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Pending Payments</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>
                {formatCurrency(totals.pending)}
              </div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Paid This Period</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>
                {formatCurrency(totals.paid)}
              </div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Total</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {formatCurrency(totals.total)}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">User</label>
              <select
                className="form-select"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
              >
                <option value="all">All Users</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date Range</label>
              <select
                className="form-select"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              >
                <option value="all">All Dates</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </div>
          </div>

          {/* Salary Payments Table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
          ) : salaryPayments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              No salary payments found
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>User</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Client</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Frequency</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Scheduled Date</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Payment Date</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryPayments.map((payment) => (
                    <tr key={payment.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem' }}>{getUserName(payment.user_id)}</td>
                      <td style={{ padding: '0.75rem' }}>{getClientName(payment.client_id)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                        {formatCurrency(payment.amount)}
                      </td>
                      <td style={{ padding: '0.75rem', textTransform: 'capitalize' }}>
                        {payment.payment_frequency}
                      </td>
                      <td style={{ padding: '0.75rem' }}>{formatDate(payment.scheduled_date)}</td>
                      <td style={{ padding: '0.75rem' }}>
                        {payment.payment_date ? formatDate(payment.payment_date) : '—'}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                          background: payment.status === 'paid' 
                            ? 'rgba(74, 222, 128, 0.1)' 
                            : payment.status === 'pending'
                            ? 'rgba(251, 191, 36, 0.1)'
                            : 'rgba(239, 68, 68, 0.1)',
                          color: payment.status === 'paid'
                            ? 'var(--success)'
                            : payment.status === 'pending'
                            ? 'var(--warning)'
                            : 'var(--error)'
                        }}>
                          {payment.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        {payment.status === 'pending' && (
                          <button
                            className="btn btn-primary"
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                            onClick={() => markAsPaid(payment.id)}
                          >
                            Mark Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default SalaryTrackingModal;

