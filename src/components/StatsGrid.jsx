import React from 'react';
import { formatPrice } from '../utils/clients';

const StatsGrid = ({ metrics, role }) => {
  return (
    <section className="stats-grid" id="statsGrid">
      <div className="stat-card">
        <div className="stat-icon">👥</div>
        <div className="stat-value">{metrics.totalClients}</div>
        <div className="stat-label">Total Clients</div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">📅</div>
        <div className="stat-value">{metrics.booked}</div>
        <div className="stat-label">Booked</div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">📞</div>
        <div className="stat-value">{metrics.followUp}</div>
        <div className="stat-label">Follow Up</div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">⏳</div>
        <div className="stat-value">{metrics.preparing}</div>
        <div className="stat-label">Preparing</div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">🧪</div>
        <div className="stat-value">{metrics.testing}</div>
        <div className="stat-label">Testing</div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">🚀</div>
        <div className="stat-value">{metrics.running}</div>
        <div className="stat-label">Running</div>
      </div>
      {role === 'admin' && (
        <>
          <div className="stat-card admin-only">
            <div className="stat-icon">💰</div>
            <div className="stat-value">{formatPrice(metrics.monthlyRevenue)}</div>
            <div className="stat-label">Monthly Revenue</div>
          </div>
          <div className="stat-card admin-only">
            <div className="stat-icon">📉</div>
            <div className="stat-value">{formatPrice(metrics.totalExpenses)}</div>
            <div className="stat-label">Total Expenses</div>
          </div>
          <div className="stat-card admin-only" style={{ border: '2px solid var(--success)' }}>
            <div className="stat-icon">📈</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              {formatPrice(metrics.netProfit)}
            </div>
            <div className="stat-label">Net Profit</div>
          </div>
          <div className="stat-card admin-only" style={{ border: '2px solid var(--primary)' }}>
            <div className="stat-icon">🎯</div>
            <div className="stat-value" style={{ color: 'var(--primary)' }}>
              {formatPrice(metrics.potentialProfit || 0)}
            </div>
            <div className="stat-label">Potential Profit</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Pipeline: {formatPrice(metrics.pipelineValue || 0)}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default StatsGrid;

