import React, { useState, useMemo } from 'react';
import { formatPrice, getPackagePrice } from '../utils/clients';

const ReportsDashboard = ({ clients = [], users = [], isOpen, onClose }) => {
  const [reportType, setReportType] = useState('revenue');
  const [dateRange, setDateRange] = useState('month'); // day, week, month, year, custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Calculate date range
  const getDateRange = () => {
    const now = new Date();
    let start, end = now;

    switch (dateRange) {
      case 'day':
        start = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        start = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        start = customStartDate ? new Date(customStartDate) : new Date(now.getFullYear(), 0, 1);
        end = customEndDate ? new Date(customEndDate) : now;
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return { start, end };
  };

  // Revenue Report
  const revenueReport = useMemo(() => {
    const { start, end } = getDateRange();
    const runningPaidClients = clients.filter(c => 
      c.phase === 'running' && 
      c.paymentStatus === 'paid' &&
      (!c.startDate || (new Date(c.startDate) >= start && new Date(c.startDate) <= end))
    );

    const expenses = JSON.parse(localStorage.getItem('gaia_expenses') || '{}');
    
    const revenue = runningPaidClients.reduce((total, client) => {
      return total + getPackagePrice(client);
    }, 0);

    const totalExpenses = runningPaidClients.reduce((total, client) => {
      const pkgExpense = expenses[client.package] || 0;
      const adsExpense = client.adsExpense || 0;
      return total + pkgExpense + adsExpense;
    }, 0);

    return {
      revenue,
      expenses: totalExpenses,
      profit: revenue - totalExpenses,
      clientCount: runningPaidClients.length,
      averageRevenuePerClient: runningPaidClients.length > 0 ? revenue / runningPaidClients.length : 0
    };
  }, [clients, dateRange, customStartDate, customEndDate]);

  // Client Acquisition Report
  const acquisitionReport = useMemo(() => {
    const { start, end } = getDateRange();
    const newClients = (clients || []).filter(c => {
      if (!c) return false;
      if (!c.createdAt) return false;
      try {
        const createdDate = new Date(c.createdAt);
        return !isNaN(createdDate.getTime()) && createdDate >= start && createdDate <= end;
      } catch {
        return false;
      }
    });

    const byPhase = {
      booked: newClients.filter(c => c.phase === 'booked').length,
      preparing: newClients.filter(c => c.phase === 'preparing').length,
      testing: newClients.filter(c => c.phase === 'testing').length,
      running: newClients.filter(c => c.phase === 'running').length
    };

    return {
      total: newClients.length,
      byPhase,
      byPackage: newClients.reduce((acc, c) => {
        acc[c.package] = (acc[c.package] || 0) + 1;
        return acc;
      }, {})
    };
  }, [clients, dateRange, customStartDate, customEndDate]);

  // Conversion Rate Report
  const conversionReport = useMemo(() => {
    const booked = (clients || []).filter(c => c && c.phase === 'booked').length;
    const preparing = (clients || []).filter(c => c && c.phase === 'preparing').length;
    const testing = (clients || []).filter(c => c && c.phase === 'testing').length;
    const running = (clients || []).filter(c => c && c.phase === 'running').length;

    return {
      booked,
      preparing,
      testing,
      running,
      bookedToRunning: booked > 0 ? ((running / booked) * 100).toFixed(1) : 0,
      preparingToTesting: preparing > 0 ? ((testing / preparing) * 100).toFixed(1) : 0,
      testingToRunning: testing > 0 ? ((running / testing) * 100).toFixed(1) : 0
    };
  }, [clients]);

  // Package Performance Report
  const packageReport = useMemo(() => {
    const runningPaidClients = (clients || []).filter(c => c && c.phase === 'running' && c.paymentStatus === 'paid');
    
    return ['basic', 'star', 'fire', 'crown', 'custom'].map(pkg => {
      const pkgClients = runningPaidClients.filter(c => c.package === pkg);
      const revenue = pkgClients.reduce((total, client) => total + getPackagePrice(client), 0);
      
      return {
        package: pkg,
        count: pkgClients.length,
        revenue,
        averageRevenue: pkgClients.length > 0 ? revenue / pkgClients.length : 0
      };
    }).filter(p => p.count > 0);
  }, [clients]);

  const exportToCSV = () => {
    let csv = '';
    let data = [];

    switch (reportType) {
      case 'revenue':
        csv = 'Report Type,Revenue,Expenses,Profit,Client Count,Avg Revenue/Client\n';
        csv += `Revenue Report,${revenueReport.revenue},${revenueReport.expenses},${revenueReport.profit},${revenueReport.clientCount},${revenueReport.averageRevenuePerClient.toFixed(2)}\n`;
        break;
      case 'acquisition':
        csv = 'Date Range,Total New Clients,Booked,Preparing,Testing,Running\n';
        csv += `${dateRange},${acquisitionReport.total},${acquisitionReport.byPhase.booked},${acquisitionReport.byPhase.preparing},${acquisitionReport.byPhase.testing},${acquisitionReport.byPhase.running}\n`;
        break;
      case 'conversion':
        csv = 'Phase,Count,Conversion Rate\n';
        csv += `Booked,${conversionReport.booked},\n`;
        csv += `Preparing,${conversionReport.preparing},${conversionReport.preparingToTesting}%\n`;
        csv += `Testing,${conversionReport.testing},${conversionReport.testingToRunning}%\n`;
        csv += `Running,${conversionReport.running},${conversionReport.bookedToRunning}%\n`;
        break;
      case 'package':
        csv = 'Package,Client Count,Total Revenue,Average Revenue\n';
        packageReport.forEach(p => {
          csv += `${p.package},${p.count},${p.revenue},${p.averageRevenue.toFixed(2)}\n`;
        });
        break;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gaia-report-${reportType}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">📊 Reports & Analytics</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Report Type Selector */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
              Report Type
            </label>
            <select
              className="form-select"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              style={{ width: '100%', maxWidth: '300px' }}
            >
              <option value="revenue">💰 Revenue Report</option>
              <option value="acquisition">📈 Client Acquisition</option>
              <option value="conversion">🔄 Conversion Rates</option>
              <option value="package">📦 Package Performance</option>
            </select>
          </div>

          {/* Date Range Selector */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
              Date Range
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="form-select"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                style={{ width: 'auto', minWidth: '150px' }}
              >
                <option value="day">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
              {dateRange === 'custom' && (
                <>
                  <input
                    type="date"
                    className="form-input"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    placeholder="Start Date"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    className="form-input"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    placeholder="End Date"
                  />
                </>
              )}
            </div>
          </div>

          {/* Revenue Report */}
          {reportType === 'revenue' && (
            <div>
              <h4 style={{ marginBottom: '1rem' }}>💰 Revenue Report</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Total Revenue</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {formatPrice(revenueReport.revenue)}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Total Expenses</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {formatPrice(revenueReport.expenses)}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '1rem', border: '2px solid var(--success)' }}>
                  <div className="stat-label">Net Profit</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--success)' }}>
                    {formatPrice(revenueReport.profit)}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Active Clients</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {revenueReport.clientCount}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Avg Revenue/Client</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {formatPrice(revenueReport.averageRevenuePerClient)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Acquisition Report */}
          {reportType === 'acquisition' && (
            <div>
              <h4 style={{ marginBottom: '1rem' }}>📈 Client Acquisition</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Total New Clients</div>
                  <div className="stat-value">{acquisitionReport.total}</div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Booked</div>
                  <div className="stat-value">{acquisitionReport.byPhase.booked}</div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Preparing</div>
                  <div className="stat-value">{acquisitionReport.byPhase.preparing}</div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Testing</div>
                  <div className="stat-value">{acquisitionReport.byPhase.testing}</div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Running</div>
                  <div className="stat-value">{acquisitionReport.byPhase.running}</div>
                </div>
              </div>
              {Object.keys(acquisitionReport.byPackage).length > 0 && (
                <div>
                  <h5 style={{ marginBottom: '0.5rem' }}>By Package</h5>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {Object.entries(acquisitionReport.byPackage).map(([pkg, count]) => (
                      <div key={pkg} style={{ padding: '0.5rem 1rem', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
                        {pkg}: {count}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conversion Report */}
          {reportType === 'conversion' && (
            <div>
              <h4 style={{ marginBottom: '1rem' }}>🔄 Conversion Rates</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Booked</div>
                  <div className="stat-value">{conversionReport.booked}</div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Preparing</div>
                  <div className="stat-value">{conversionReport.preparing}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {conversionReport.preparingToTesting}% to Testing
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Testing</div>
                  <div className="stat-value">{conversionReport.testing}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {conversionReport.testingToRunning}% to Running
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '1rem' }}>
                  <div className="stat-label">Running</div>
                  <div className="stat-value">{conversionReport.running}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {conversionReport.bookedToRunning}% from Booked
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Package Performance Report */}
          {reportType === 'package' && (
            <div>
              <h4 style={{ marginBottom: '1rem' }}>📦 Package Performance</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Package</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Client Count</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Revenue</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Avg Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packageReport.map(p => (
                      <tr key={p.package} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem', textTransform: 'capitalize', fontWeight: '500' }}>
                          {p.package}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>{p.count}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>
                          {formatPrice(p.revenue)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          {formatPrice(p.averageRevenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={exportToCSV}>
            📥 Export to CSV
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportsDashboard;


