import React, { useState, useEffect } from 'react';
import TagManagementModal from './TagManagementModal';
import EmployeeSalaryManagement from './EmployeeSalaryManagement';

const AdminSettingsModal = ({ onClose, getExpenses, saveExpenses, getAIPrompts, saveAIPrompts, getPackagePrices, savePackagePrices, getPackageDetails, savePackageDetails, onTeamPerformance }) => {
  const [showTagManagement, setShowTagManagement] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState('packages'); // packages, employees
  const [prices, setPrices] = useState({
    basic: 1799,
    star: 2999,
    fire: 3499,
    crown: 5799,
    custom: 0
  });
  const [expenses, setExpenses] = useState({
    basic: 500,
    star: 800,
    fire: 1000,
    crown: 1500,
    custom: 0,
    dailyAdsExpense: 0 // Global daily ads expense
  });
  const [prompts, setPrompts] = useState({
    adType: '',
    campaignStructure: ''
  });
  const [packageDetails, setPackageDetails] = useState({
    basic: {
      name: 'Basic',
      emoji: '🟢',
      videos: 2,
      mainVideos: 1,
      photos: 2,
      capi: true,
      advancedCapi: false,
      dailyAds: true,
      customAudience: true,
      unlimitedSetup: false,
      weeklyMeeting: 0,
      lookalike: false,
      priority: false
    },
    star: {
      name: 'Star',
      emoji: '⭐',
      videos: 5,
      mainVideos: 1,
      photos: 5,
      capi: true,
      advancedCapi: false,
      dailyAds: true,
      customAudience: true,
      unlimitedSetup: true,
      weeklyMeeting: 30,
      lookalike: false,
      priority: false
    },
    fire: {
      name: 'Fire',
      emoji: '🔥',
      videos: 5,
      mainVideos: 2,
      photos: 10,
      capi: true,
      advancedCapi: false,
      dailyAds: true,
      customAudience: true,
      unlimitedSetup: true,
      weeklyMeeting: 45,
      lookalike: false,
      priority: false
    },
    crown: {
      name: 'Crown',
      emoji: '👑',
      videos: 10,
      mainVideos: 3,
      photos: 17,
      capi: true,
      advancedCapi: true,
      dailyAds: true,
      customAudience: true,
      unlimitedSetup: true,
      weeklyMeeting: 60,
      lookalike: true,
      priority: true
    },
    custom: {
      name: 'Custom',
      emoji: '🎨'
    }
  });
  const [activePackageTab, setActivePackageTab] = useState('basic');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const loadedPrices = await getPackagePrices();
        const loadedExpenses = await getExpenses();
        const loadedPrompts = await getAIPrompts();
        const loadedDetails = await getPackageDetails();
        setPrices(loadedPrices);
        setExpenses(loadedExpenses);
        setPrompts(loadedPrompts);
        setPackageDetails(loadedDetails);
      } catch (error) {
        console.error('Error loading settings:', error);
        setMessage({ type: 'error', text: 'Failed to load settings' });
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePriceChange = (packageType, value) => {
    setPrices(prev => ({
      ...prev,
      [packageType]: parseInt(value) || 0
    }));
  };

  const handleExpenseChange = (packageType, value) => {
    setExpenses(prev => ({
      ...prev,
      [packageType]: parseInt(value) || 0
    }));
  };

  const handlePromptChange = (promptType, value) => {
    setPrompts(prev => ({
      ...prev,
      [promptType]: value
    }));
  };

  const handlePackageDetailChange = (packageType, field, value) => {
    setPackageDetails(prev => ({
      ...prev,
      [packageType]: {
        ...prev[packageType],
        [field]: typeof value === 'boolean' ? value : (field === 'name' || field === 'emoji' ? value : parseInt(value) || 0)
      }
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      await savePackagePrices(prices);
      await saveExpenses(expenses);
      await saveAIPrompts(prompts);
      await savePackageDetails(packageDetails);
      setMessage({ type: 'success', text: 'Settings saved successfully! Page will reload in 1 second...' });
      // Reload the page to update package prices throughout the app
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay active" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">⚙️ Admin Settings</h3>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            <p>Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">⚙️ Admin Settings</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Main Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '2px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setActiveMainTab('packages')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: 'transparent',
                borderBottom: activeMainTab === 'packages' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeMainTab === 'packages' ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeMainTab === 'packages' ? '600' : '400'
              }}
            >
              📦 Packages & Settings
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('employees')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: 'transparent',
                borderBottom: activeMainTab === 'employees' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeMainTab === 'employees' ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeMainTab === 'employees' ? '600' : '400'
              }}
            >
              👥 Employees & Salary
            </button>
          </div>

          {activeMainTab === 'packages' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>💵 Package Prices (Revenue)</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Set how much you earn per package per month
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Basic Package (₱)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={prices.basic}
                      onChange={(e) => handlePriceChange('basic', e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Star Package (₱)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={prices.star}
                      onChange={(e) => handlePriceChange('star', e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fire Package (₱)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={prices.fire}
                      onChange={(e) => handlePriceChange('fire', e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Crown Package (₱)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={prices.crown}
                      onChange={(e) => handlePriceChange('crown', e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Custom Package (₱)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={prices.custom}
                      onChange={(e) => handlePriceChange('custom', e.target.value)}
                      min="0"
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>💰 Package Expenses</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Set your costs per package per month
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Basic Package</label>
                    <input
                      type="number"
                      className="form-input"
                      value={expenses.basic}
                      onChange={(e) => handleExpenseChange('basic', e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Star Package</label>
                    <input
                      type="number"
                      className="form-input"
                      value={expenses.star}
                      onChange={(e) => handleExpenseChange('star', e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fire Package</label>
                    <input
                      type="number"
                      className="form-input"
                      value={expenses.fire}
                      onChange={(e) => handleExpenseChange('fire', e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Crown Package</label>
                    <input
                      type="number"
                      className="form-input"
                      value={expenses.crown}
                      onChange={(e) => handleExpenseChange('crown', e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Custom Package</label>
                    <input
                      type="number"
                      className="form-input"
                      value={expenses.custom}
                      onChange={(e) => handleExpenseChange('custom', e.target.value)}
                      min="0"
                    />
                  </div>

                  {/* Daily Ads Expense */}
                  <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: '1rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                    <label className="form-label" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                      📊 Daily Ads Expense (₱)
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      value={expenses.dailyAdsExpense || 0}
                      onChange={(e) => handleExpenseChange('dailyAdsExpense', e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="Enter daily ads spending..."
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginTop: '0.5rem' }}>
                      This is the global daily advertising expense applied across all clients. Enter your daily ad spend budget here instead of per-client.
                    </small>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>📦 Package Details</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Configure quantities and features for each package
                </p>

                <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {['basic', 'star', 'fire', 'crown'].map(pkg => (
                    <button
                      key={pkg}
                      type="button"
                      onClick={() => setActivePackageTab(pkg)}
                      style={{
                        padding: '0.5rem 1rem',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        background: activePackageTab === pkg ? 'var(--primary)' : 'transparent',
                        color: activePackageTab === pkg ? 'white' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      {packageDetails[pkg]?.emoji} {packageDetails[pkg]?.name || pkg}
                    </button>
                  ))}
                </div>

                {['basic', 'star', 'fire', 'crown'].map(pkg => {
                  if (activePackageTab !== pkg) return null;
                  const pkgData = packageDetails[pkg] || {};
                  return (
                    <div key={pkg} style={{
                      padding: '1rem',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      backgroundColor: 'var(--bg-secondary)'
                    }}>
                      <div style={{ marginBottom: '1rem' }}>
                        <label className="form-label">Package Name</label>
                        <input
                          type="text"
                          className="form-input"
                          value={pkgData.name || ''}
                          onChange={(e) => handlePackageDetailChange(pkg, 'name', e.target.value)}
                          style={{ marginBottom: '0.5rem' }}
                        />
                        <label className="form-label">Emoji</label>
                        <input
                          type="text"
                          className="form-input"
                          value={pkgData.emoji || ''}
                          onChange={(e) => handlePackageDetailChange(pkg, 'emoji', e.target.value)}
                          placeholder="🟢"
                          maxLength="2"
                        />
                      </div>

                      <h5 style={{ marginTop: '1rem', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Quantities</h5>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div className="form-group">
                          <label className="form-label">15-sec Videos</label>
                          <input
                            type="number"
                            className="form-input"
                            value={pkgData.videos || 0}
                            onChange={(e) => handlePackageDetailChange(pkg, 'videos', e.target.value)}
                            min="0"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Main Videos</label>
                          <input
                            type="number"
                            className="form-input"
                            value={pkgData.mainVideos || 0}
                            onChange={(e) => handlePackageDetailChange(pkg, 'mainVideos', e.target.value)}
                            min="0"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Photos</label>
                          <input
                            type="number"
                            className="form-input"
                            value={pkgData.photos || 0}
                            onChange={(e) => handlePackageDetailChange(pkg, 'photos', e.target.value)}
                            min="0"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Weekly Meeting (minutes)</label>
                          <input
                            type="number"
                            className="form-input"
                            value={pkgData.weeklyMeeting || 0}
                            onChange={(e) => handlePackageDetailChange(pkg, 'weeklyMeeting', e.target.value)}
                            min="0"
                          />
                        </div>
                      </div>

                      <h5 style={{ marginTop: '1rem', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Features</h5>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <label className="form-checkbox">
                          <input
                            type="checkbox"
                            checked={pkgData.capi || false}
                            onChange={(e) => handlePackageDetailChange(pkg, 'capi', e.target.checked)}
                          /> CAPI
                        </label>
                        <label className="form-checkbox">
                          <input
                            type="checkbox"
                            checked={pkgData.advancedCapi || false}
                            onChange={(e) => handlePackageDetailChange(pkg, 'advancedCapi', e.target.checked)}
                          /> Advanced CAPI
                        </label>
                        <label className="form-checkbox">
                          <input
                            type="checkbox"
                            checked={pkgData.dailyAds || false}
                            onChange={(e) => handlePackageDetailChange(pkg, 'dailyAds', e.target.checked)}
                          /> Daily Ads Monitoring
                        </label>
                        <label className="form-checkbox">
                          <input
                            type="checkbox"
                            checked={pkgData.customAudience || false}
                            onChange={(e) => handlePackageDetailChange(pkg, 'customAudience', e.target.checked)}
                          /> Custom Audience
                        </label>
                        <label className="form-checkbox">
                          <input
                            type="checkbox"
                            checked={pkgData.unlimitedSetup || false}
                            onChange={(e) => handlePackageDetailChange(pkg, 'unlimitedSetup', e.target.checked)}
                          /> Unlimited Ad Setup
                        </label>
                        <label className="form-checkbox">
                          <input
                            type="checkbox"
                            checked={pkgData.lookalike || false}
                            onChange={(e) => handlePackageDetailChange(pkg, 'lookalike', e.target.checked)}
                          /> Lookalike Audiences
                        </label>
                        <label className="form-checkbox">
                          <input
                            type="checkbox"
                            checked={pkgData.priority || false}
                            onChange={(e) => handlePackageDetailChange(pkg, 'priority', e.target.checked)}
                          /> Priority Handling
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🤖 AI Prompts</h4>
                <div className="form-group">
                  <label className="form-label">Ad Type Prompt</label>
                  <textarea
                    className="form-input"
                    rows="3"
                    value={prompts.adType}
                    onChange={(e) => handlePromptChange('adType', e.target.value)}
                    placeholder="Analyze the business niche '{niche}' and target audience '{audience}'. Suggest the top 3 most effective Facebook ad formats."
                    style={{ resize: 'vertical' }}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    Use {'{niche}'} and {'{audience}'} as placeholders
                  </small>
                </div>
                <div className="form-group">
                  <label className="form-label">Campaign Structure Prompt</label>
                  <textarea
                    className="form-input"
                    rows="3"
                    value={prompts.campaignStructure}
                    onChange={(e) => handlePromptChange('campaignStructure', e.target.value)}
                    placeholder="For a local service business in niche '{niche}' with a budget of ₱150-300/day, outline a recommended campaign structure."
                    style={{ resize: 'vertical' }}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    Use {'{niche}'} and {'{audience}'} as placeholders
                  </small>
                </div>
              </div>
            </>
          )}

          {activeMainTab === 'employees' && (
            <EmployeeSalaryManagement />
          )}

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
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowTagManagement(true)}
              disabled={saving}
            >
              🏷️ Manage Tags
            </button>
            {onTeamPerformance && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  onClose();
                  onTeamPerformance();
                }}
                disabled={saving}
              >
                👥 View Team Performance
              </button>
            )}
          </div>
          <div>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving} style={{ marginRight: '0.5rem' }}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {showTagManagement && (
        <TagManagementModal
          isOpen={showTagManagement}
          onClose={() => setShowTagManagement(false)}
          onTagsUpdated={() => {
            // Tags updated, could trigger a refresh if needed
          }}
        />
      )}
    </div>
  );
};

export default AdminSettingsModal;
