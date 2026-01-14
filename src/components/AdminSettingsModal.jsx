import React, { useState, useEffect } from 'react';
import TagManagementModal from './TagManagementModal';
import EmployeeSalaryManagement from './EmployeeSalaryManagement';
import facebookService from '../services/facebookService';

const AdminSettingsModal = ({ onClose, getExpenses, saveExpenses, getAIPrompts, saveAIPrompts, getPackagePrices, savePackagePrices, getPackageDetails, savePackageDetails, onTeamPerformance }) => {
  const [showTagManagement, setShowTagManagement] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState('packages'); // packages, employees, facebook, booking
  const [activePageId, setActivePageId] = useState('default'); // Will be set from connected pages

  // Get the active Facebook page ID - use state if available, otherwise fallback to localStorage/default
  const getActivePageId = () => {
    if (activePageId && activePageId !== 'default') {
      return activePageId;
    }
    try {
      const pages = localStorage.getItem('connected_facebook_pages');
      if (pages) {
        const parsed = JSON.parse(pages);
        if (parsed && parsed.length > 0) {
          return parsed[0].id || parsed[0].page_id || 'default';
        }
      }
      const selectedPage = localStorage.getItem('selectedPageId');
      if (selectedPage) return selectedPage;
    } catch (e) {
      console.log('Could not get active page ID:', e);
    }
    return 'default';
  };

  // Booking settings state
  const [bookingSettings, setBookingSettings] = useState({
    confirmation_message: 'Your booking has been confirmed! We look forward to meeting with you.',
    messenger_prefill_message: 'Hi! I just booked an appointment for {date} at {time}. Please confirm my booking. Thank you!',
    auto_redirect_enabled: true,
    auto_redirect_delay: 5,
    // Availability settings
    available_days: [1, 2, 3, 4, 5], // 0=Sun, 1=Mon, ..., 6=Sat (default: Mon-Fri)
    start_time: '09:00',
    end_time: '17:00',
    slot_duration: 30, // minutes
    // Booking mode settings
    booking_mode: 'slots', // 'slots' = fixed time slots, 'flexible' = any time
    allow_next_hour: false, // Show "Book Next Hour" quick option
    // Custom form fields
    custom_fields: [
      { id: 'name', label: 'Your Name', type: 'text', required: true },
      { id: 'phone', label: 'Phone Number', type: 'tel', required: true },
      { id: 'email', label: 'Email Address', type: 'email', required: false },
      { id: 'notes', label: 'Additional Notes', type: 'textarea', required: false }
    ]
  });

  // Contact warning settings state
  const [warningSettings, setWarningSettings] = useState({
    warning_hours: 24,
    danger_hours: 48,
    response_deadline_hours: 24, // Response deadline for unassigned contacts table
    warning_color: '#f59e0b', // amber
    danger_color: '#ef4444',  // red
    enable_no_activity_warning: true,
    enable_no_tag_warning: true,
    enable_proposal_stuck_warning: true,
    // Per-stage warning thresholds (days in stage before warning)
    stage_warning_days: {
      'booked': 3,      // Warn if in Booked for more than 3 days
      'follow-up': 2,   // Warn if in Follow Up for more than 2 days
      'preparing': 7,   // Warn if in Preparing for more than 7 days
      'testing': 30,    // Warn if in Testing for more than 30 days
      'running': 0      // No warning for Running (0 = disabled)
    }
  });
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

        // First, get connected Facebook pages to get the actual page ID
        // Store in local variable since state won't update until next render
        let currentPageId = 'default';
        try {
          const connectedPages = await facebookService.getConnectedPages();
          if (connectedPages && connectedPages.length > 0) {
            currentPageId = connectedPages[0].page_id || connectedPages[0].id;
            console.log('Found connected Facebook page:', currentPageId);
            setActivePageId(currentPageId);
            // Store in localStorage for backup
            localStorage.setItem('selectedPageId', currentPageId);
          }
        } catch (pageErr) {
          console.log('Could not fetch connected pages:', pageErr);
          // Try to get from localStorage as fallback
          const savedPageId = localStorage.getItem('selectedPageId');
          if (savedPageId) currentPageId = savedPageId;
        }

        const loadedPrices = await getPackagePrices();
        const loadedExpenses = await getExpenses();
        const loadedPrompts = await getAIPrompts();
        const loadedDetails = await getPackageDetails();
        setPrices(loadedPrices);
        setExpenses(loadedExpenses);
        setPrompts(loadedPrompts);
        setPackageDetails(loadedDetails);

        // Load booking settings - try localStorage first, then API
        try {
          // Check localStorage first (this is the source of truth after save)
          const localSettings = localStorage.getItem('booking_settings');
          if (localSettings) {
            const parsed = JSON.parse(localSettings);
            setBookingSettings(prev => ({ ...prev, ...parsed }));
            console.log('Loaded booking settings from localStorage:', parsed);
          }

          // Also try API using the currentPageId variable (not state!)
          try {
            console.log('Loading booking settings for page:', currentPageId);
            const response = await fetch(`/api/booking/settings?pageId=${currentPageId}`);
            if (response.ok) {
              const data = await response.json();
              console.log('API booking settings response:', data);
              // Only use API data if it has real settings (not empty/error)
              if (!data.message?.includes('pending migration') && !data.error && data.available_days) {
                setBookingSettings(prev => ({
                  ...prev,
                  ...data,
                  available_days: data.available_days || prev.available_days,
                  start_time: data.start_time || prev.start_time,
                  end_time: data.end_time || prev.end_time,
                  slot_duration: data.slot_duration || prev.slot_duration,
                  booking_mode: data.booking_mode || prev.booking_mode,
                  custom_fields: data.custom_fields || prev.custom_fields
                }));
                console.log('Applied API settings over localStorage');
              } else {
                console.log('API returned incomplete data, keeping localStorage settings');
              }
            }
          } catch (apiErr) {
            console.log('API error, using localStorage settings');
          }
        } catch (e) {
          console.log('Could not load booking settings:', e);
        }

        // Load warning settings from localStorage
        try {
          const savedWarningSettings = localStorage.getItem('warning_settings');
          if (savedWarningSettings) {
            const parsed = JSON.parse(savedWarningSettings);
            setWarningSettings(prev => ({ ...prev, ...parsed }));
            console.log('Loaded warning settings from localStorage:', parsed);
          }
        } catch (e) {
          console.log('Could not load warning settings:', e);
        }
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

      // Save booking settings
      try {
        console.log('Saving booking settings:', bookingSettings);

        // Always save to localStorage as backup
        localStorage.setItem('booking_settings', JSON.stringify(bookingSettings));
        console.log('Saved to localStorage');

        // Also try API
        const bookingResponse = await fetch(`/api/booking/settings?pageId=${getActivePageId()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bookingSettings)
        });
        const bookingResult = await bookingResponse.json();
        console.log('Booking settings save result:', bookingResult);
        if (!bookingResponse.ok) {
          console.error('Failed to save booking settings:', bookingResult);
        }
      } catch (e) {
        console.error('Could not save booking settings:', e);
        // localStorage already saved above as backup
      }

      // Save warning settings to localStorage
      try {
        localStorage.setItem('warning_settings', JSON.stringify(warningSettings));
        console.log('Warning settings saved to localStorage:', warningSettings);
      } catch (e) {
        console.error('Could not save warning settings:', e);
      }

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
            <button
              type="button"
              onClick={() => setActiveMainTab('facebook')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: 'transparent',
                borderBottom: activeMainTab === 'facebook' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeMainTab === 'facebook' ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeMainTab === 'facebook' ? '600' : '400'
              }}
            >
              📘 Facebook Integration
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('booking')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: 'transparent',
                borderBottom: activeMainTab === 'booking' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeMainTab === 'booking' ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeMainTab === 'booking' ? '600' : '400'
              }}
            >
              📅 Booking Settings
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('warnings')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: 'transparent',
                borderBottom: activeMainTab === 'warnings' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeMainTab === 'warnings' ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeMainTab === 'warnings' ? '600' : '400'
              }}
            >
              ⚠️ Warning Rules
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('aichatbot')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: 'transparent',
                borderBottom: activeMainTab === 'aichatbot' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeMainTab === 'aichatbot' ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeMainTab === 'aichatbot' ? '600' : '400'
              }}
            >
              🤖 AI Chatbot
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

              {/* Contact Warning Settings */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>⚠️ Contact Warning Settings</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Configure when contacts should show warning indicators in Messenger Inbox
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="form-group">
                    <label className="form-label">⏰ Warning Threshold (hours)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={warningSettings.warning_hours}
                      onChange={(e) => setWarningSettings(prev => ({ ...prev, warning_hours: parseInt(e.target.value) || 24 }))}
                      min="1"
                      max="168"
                      placeholder="24"
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Show warning after this many hours of no activity
                    </small>
                  </div>

                  <div className="form-group">
                    <label className="form-label">🚨 Danger Threshold (hours)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={warningSettings.danger_hours}
                      onChange={(e) => setWarningSettings(prev => ({ ...prev, danger_hours: parseInt(e.target.value) || 48 }))}
                      min="1"
                      max="336"
                      placeholder="48"
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Show critical warning after this many hours
                    </small>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="form-group">
                    <label className="form-label">🟠 Warning Color</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={warningSettings.warning_color}
                        onChange={(e) => setWarningSettings(prev => ({ ...prev, warning_color: e.target.value }))}
                        style={{ width: '50px', height: '40px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={warningSettings.warning_color}
                        onChange={(e) => setWarningSettings(prev => ({ ...prev, warning_color: e.target.value }))}
                        style={{ flex: 1 }}
                        placeholder="#f59e0b"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">🔴 Danger Color</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={warningSettings.danger_color}
                        onChange={(e) => setWarningSettings(prev => ({ ...prev, danger_color: e.target.value }))}
                        style={{ width: '50px', height: '40px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={warningSettings.danger_color}
                        onChange={(e) => setWarningSettings(prev => ({ ...prev, danger_color: e.target.value }))}
                        style={{ flex: 1 }}
                        placeholder="#ef4444"
                      />
                    </div>
                  </div>
                </div>

                {/* Response Deadline Setting */}
                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                  <h5 style={{ marginBottom: '0.75rem', color: 'var(--text-primary)' }}>⏰ Response Deadline</h5>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Set the deadline for responding to unassigned contacts. This is shown in the Unassigned Contacts Table view.
                  </p>
                  <div className="form-group" style={{ maxWidth: '300px' }}>
                    <label className="form-label">Response Deadline (hours)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={warningSettings.response_deadline_hours || 24}
                      onChange={(e) => setWarningSettings(prev => ({ ...prev, response_deadline_hours: parseInt(e.target.value) || 24 }))}
                      min="1"
                      max="168"
                      placeholder="24"
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Contacts will show overdue status after this many hours without response
                    </small>
                  </div>
                </div>

                {/* Per-Stage Warning Settings */}
                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                  <h5 style={{ marginBottom: '0.75rem', color: 'var(--text-primary)' }}>📊 Stage Duration Warnings</h5>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Highlight clients who have been in a stage too long. Set to 0 to disable warning for that stage.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                    {[
                      { key: 'booked', label: '📅 Booked' },
                      { key: 'follow-up', label: '📞 Follow Up' },
                      { key: 'preparing', label: '⏳ Preparing' },
                      { key: 'testing', label: '🧪 Testing' },
                      { key: 'running', label: '🚀 Running' }
                    ].map(stage => (
                      <div key={stage.key} className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>{stage.label}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="number"
                            className="form-input"
                            value={warningSettings.stage_warning_days?.[stage.key] ?? 0}
                            onChange={(e) => setWarningSettings(prev => ({
                              ...prev,
                              stage_warning_days: {
                                ...prev.stage_warning_days,
                                [stage.key]: parseInt(e.target.value) || 0
                              }
                            }))}
                            min="0"
                            max="365"
                            style={{ width: '70px' }}
                          />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>days</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{
                  padding: '1rem',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-color)'
                }}>
                  <h5 style={{ marginBottom: '0.75rem', color: 'var(--text-primary)' }}>🎯 Warning Conditions</h5>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    cursor: 'pointer',
                    marginBottom: '0.75rem'
                  }}>
                    <input
                      type="checkbox"
                      checked={warningSettings.enable_no_activity_warning}
                      onChange={(e) => setWarningSettings(prev => ({ ...prev, enable_no_activity_warning: e.target.checked }))}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <div>
                      <span style={{ fontWeight: '500' }}>No Activity Warning</span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Warn when no messages for the configured hours
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    cursor: 'pointer',
                    marginBottom: '0.75rem'
                  }}>
                    <input
                      type="checkbox"
                      checked={warningSettings.enable_no_tag_warning}
                      onChange={(e) => setWarningSettings(prev => ({ ...prev, enable_no_tag_warning: e.target.checked }))}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <div>
                      <span style={{ fontWeight: '500' }}>No Tag Warning</span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Warn when contact has no tags assigned
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={warningSettings.enable_proposal_stuck_warning}
                      onChange={(e) => setWarningSettings(prev => ({ ...prev, enable_proposal_stuck_warning: e.target.checked }))}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <div>
                      <span style={{ fontWeight: '500' }}>Proposal Stuck Warning</span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Warn when proposal is sent but inactive for too long
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </>
          )}

          {activeMainTab === 'employees' && (
            <EmployeeSalaryManagement />
          )}

          {activeMainTab === 'facebook' && (
            <div>
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>📘 Facebook Page Connection</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Connect your Facebook Page to sync messages and conversations.
                </p>

                <div style={{
                  padding: '1.5rem',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-color)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📘</div>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    To connect your Facebook Page, you'll need to set up a Facebook App in the Meta Developer Console.
                  </p>
                  <a
                    href="https://developers.facebook.com/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ marginRight: '0.5rem' }}
                  >
                    Open Meta Developer Console
                  </a>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      // Facebook OAuth flow - open in popup window
                      const appId = import.meta.env.VITE_FACEBOOK_APP_ID || '1822108718500869';
                      const redirectUri = encodeURIComponent(window.location.origin + '/api/facebook/callback');
                      const scope = 'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata';
                      const oauthUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;

                      // Open popup window
                      const width = 600;
                      const height = 700;
                      const left = (window.screen.width - width) / 2;
                      const top = (window.screen.height - height) / 2;

                      const popup = window.open(
                        oauthUrl,
                        'facebook_oauth',
                        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
                      );

                      // Poll for popup close and URL changes
                      const pollTimer = setInterval(() => {
                        try {
                          if (!popup || popup.closed) {
                            clearInterval(pollTimer);
                            // Check if URL has changed (OAuth callback was processed)
                            const urlParams = new URLSearchParams(window.location.search);
                            if (urlParams.get('fb_pages') || urlParams.get('fb_error')) {
                              window.location.reload(); // Reload to trigger URL param handler
                            }
                            return;
                          }

                          // Try to read popup URL to detect callback
                          if (popup.location.href.includes(window.location.origin)) {
                            const popupUrl = new URL(popup.location.href);
                            const fbPages = popupUrl.searchParams.get('fb_pages');
                            const fbError = popupUrl.searchParams.get('fb_error');

                            if (fbPages || fbError) {
                              clearInterval(pollTimer);
                              popup.close();
                              // Navigate main window to get the params
                              window.location.href = popup.location.href;
                            }
                          }
                        } catch (e) {
                          // Cross-origin error - popup is still on Facebook domain
                        }
                      }, 500);
                    }}
                  >
                    Connect Facebook Page
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>📊 Ad Spend Sync</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Automatically sync ad spend from Meta Ads Manager and deduct from profit calculations.
                </p>

                <div style={{
                  padding: '1rem',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-color)'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      style={{ width: '20px', height: '20px' }}
                      onChange={(e) => {
                        // This would save to facebook_settings table
                        console.log('Auto ad spend sync:', e.target.checked);
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: '500' }}>Enable Auto Ad Spend Sync</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Automatically fetch daily ad spend from connected ad accounts and update client expenses
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🔔 Webhook Configuration</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Configure webhooks to receive real-time message updates from Facebook.
                </p>

                <div className="form-group">
                  <label className="form-label">Webhook URL</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="https://your-domain.com/api/facebook/webhook"
                    readOnly
                    value={window.location.origin + '/api/facebook/webhook'}
                    style={{ background: 'var(--bg-tertiary)' }}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    Use this URL when setting up webhooks in the Facebook App settings
                  </small>
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label className="form-label">Verify Token</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter a custom verify token"
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    This token is used to verify webhook requests from Facebook
                  </small>
                </div>
              </div>
            </div>
          )}

          {activeMainTab === 'booking' && (
            <div>
              {/* Preview Button */}
              <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => window.open(`/booking?pageId=${getActivePageId()}`, '_blank')}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  👁️ Preview Booking Page
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/booking?pageId=${getActivePageId()}`;
                    navigator.clipboard.writeText(url);
                    alert('Booking page URL copied to clipboard!');
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  📋 Copy Booking Link
                </button>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>📅 Booking Confirmation Settings</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Customize the messages shown to contacts after they book an appointment.
                </p>

                <div className="form-group">
                  <label className="form-label">Confirmation Message</label>
                  <textarea
                    className="form-input"
                    rows="3"
                    value={bookingSettings.confirmation_message}
                    onChange={(e) => setBookingSettings(prev => ({ ...prev, confirmation_message: e.target.value }))}
                    placeholder="Your booking has been confirmed! We look forward to meeting with you."
                    style={{ resize: 'vertical' }}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    This message is displayed on the confirmation screen after a successful booking.
                  </small>
                </div>

                <div className="form-group" style={{ marginTop: '1.5rem' }}>
                  <label className="form-label">Messenger Pre-fill Message</label>
                  <textarea
                    className="form-input"
                    rows="3"
                    value={bookingSettings.messenger_prefill_message}
                    onChange={(e) => setBookingSettings(prev => ({ ...prev, messenger_prefill_message: e.target.value }))}
                    placeholder="Hi! I just booked an appointment for {date} at {time}. Please confirm my booking."
                    style={{ resize: 'vertical' }}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    This message is pre-filled when the contact is redirected to Messenger. Use {'{date}'}, {'{time}'}, and {'{name}'} as placeholders.
                  </small>
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>↩️ Auto-Redirect Settings</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Configure automatic redirect to Messenger after booking.
                </p>

                <div style={{
                  padding: '1rem',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-color)',
                  marginBottom: '1rem'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={bookingSettings.auto_redirect_enabled}
                      onChange={(e) => setBookingSettings(prev => ({ ...prev, auto_redirect_enabled: e.target.checked }))}
                      style={{ width: '20px', height: '20px' }}
                    />
                    <div>
                      <div style={{ fontWeight: '500' }}>Enable Auto-Redirect to Messenger</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Automatically redirect contacts to Messenger after booking confirmation
                      </div>
                    </div>
                  </label>
                </div>

                {bookingSettings.auto_redirect_enabled && (
                  <div className="form-group">
                    <label className="form-label">Redirect Delay (seconds)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={bookingSettings.auto_redirect_delay}
                      onChange={(e) => setBookingSettings(prev => ({ ...prev, auto_redirect_delay: parseInt(e.target.value) || 5 }))}
                      min="1"
                      max="30"
                      style={{ maxWidth: '150px' }}
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Number of seconds to wait before redirecting to Messenger (1-30)
                    </small>
                  </div>
                )}
              </div>

              {/* Availability Settings */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🗓️ Availability Settings</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Set which days and times are available for booking.
                </p>

                <div className="form-group">
                  <label className="form-label">Available Days</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                      <label key={day} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.5rem 0.75rem',
                        background: bookingSettings.available_days?.includes(index) ? 'var(--primary)' : 'var(--bg-tertiary)',
                        color: bookingSettings.available_days?.includes(index) ? 'white' : 'var(--text-primary)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        border: '1px solid var(--border-color)'
                      }}>
                        <input
                          type="checkbox"
                          checked={bookingSettings.available_days?.includes(index) || false}
                          onChange={(e) => {
                            const days = bookingSettings.available_days || [];
                            if (e.target.checked) {
                              setBookingSettings(prev => ({ ...prev, available_days: [...days, index].sort() }));
                            } else {
                              setBookingSettings(prev => ({ ...prev, available_days: days.filter(d => d !== index) }));
                            }
                          }}
                          style={{ display: 'none' }}
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Start Time</label>
                    <input
                      type="time"
                      className="form-input"
                      value={bookingSettings.start_time || '09:00'}
                      onChange={(e) => setBookingSettings(prev => ({ ...prev, start_time: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time</label>
                    <input
                      type="time"
                      className="form-input"
                      value={bookingSettings.end_time || '17:00'}
                      onChange={(e) => setBookingSettings(prev => ({ ...prev, end_time: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Slot Duration</label>
                    <select
                      className="form-select"
                      value={bookingSettings.slot_duration || 30}
                      onChange={(e) => setBookingSettings(prev => ({ ...prev, slot_duration: parseInt(e.target.value) }))}
                    >
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="45">45 minutes</option>
                      <option value="60">60 minutes</option>
                    </select>
                  </div>
                </div>

                {/* Booking Mode Options */}
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label">Booking Mode</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1rem',
                        background: bookingSettings.booking_mode === 'slots' ? 'var(--primary)' : 'var(--bg-secondary)',
                        color: bookingSettings.booking_mode === 'slots' ? 'white' : 'var(--text-primary)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        border: '1px solid var(--border-color)'
                      }}>
                        <input
                          type="radio"
                          name="booking_mode"
                          checked={bookingSettings.booking_mode === 'slots'}
                          onChange={() => setBookingSettings(prev => ({ ...prev, booking_mode: 'slots' }))}
                          style={{ display: 'none' }}
                        />
                        🕐 Fixed Time Slots
                      </label>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1rem',
                        background: bookingSettings.booking_mode === 'flexible' ? 'var(--primary)' : 'var(--bg-secondary)',
                        color: bookingSettings.booking_mode === 'flexible' ? 'white' : 'var(--text-primary)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        border: '1px solid var(--border-color)'
                      }}>
                        <input
                          type="radio"
                          name="booking_mode"
                          checked={bookingSettings.booking_mode === 'flexible'}
                          onChange={() => setBookingSettings(prev => ({ ...prev, booking_mode: 'flexible' }))}
                          style={{ display: 'none' }}
                        />
                        ⏰ Flexible Time
                      </label>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1rem',
                        background: bookingSettings.booking_mode === 'both' ? 'var(--primary)' : 'var(--bg-secondary)',
                        color: bookingSettings.booking_mode === 'both' ? 'white' : 'var(--text-primary)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        border: '1px solid var(--border-color)'
                      }}>
                        <input
                          type="radio"
                          name="booking_mode"
                          checked={bookingSettings.booking_mode === 'both'}
                          onChange={() => setBookingSettings(prev => ({ ...prev, booking_mode: 'both' }))}
                          style={{ display: 'none' }}
                        />
                        📅 Both Options
                      </label>
                    </div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {bookingSettings.booking_mode === 'slots' && 'Contacts pick from preset time slots (9:00, 9:30, 10:00...)'}
                      {bookingSettings.booking_mode === 'flexible' && 'Contacts can pick any time (11:32, 2:15...)'}
                      {bookingSettings.booking_mode === 'both' && 'Show both slots AND time picker - contacts choose their preference'}
                    </small>
                  </div>

                  {/* Same-Day Booking Buffer */}
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label">⏰ Same-Day Booking Buffer</label>
                    <select
                      className="form-select"
                      value={bookingSettings.same_day_buffer || 0}
                      onChange={(e) => setBookingSettings(prev => ({ ...prev, same_day_buffer: parseInt(e.target.value) }))}
                    >
                      <option value="0">No buffer (show all future slots)</option>
                      <option value="1">1 hour ahead</option>
                      <option value="2">2 hours ahead</option>
                      <option value="3">3 hours ahead</option>
                      <option value="4">4 hours ahead</option>
                      <option value="5">5 hours ahead</option>
                      <option value="6">6 hours ahead</option>
                      <option value="8">8 hours ahead</option>
                      <option value="12">12 hours ahead</option>
                    </select>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      For <strong>today only</strong>: How many hours ahead must the available slots be?<br />
                      Example: If set to 5 hours and it's 8 AM, contacts can book from 1 PM onwards today.
                    </small>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="checkbox"
                        checked={bookingSettings.allow_next_hour || false}
                        onChange={(e) => setBookingSettings(prev => ({ ...prev, allow_next_hour: e.target.checked }))}
                        style={{ width: '20px', height: '20px' }}
                      />
                      <div>
                        <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>⚡ Show "Book Next Hour" Option</span>
                        <br />
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Quick booking button for contacts to book the next available hour</small>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Custom Form Fields */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>📝 Booking Form Fields</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Configure which fields contacts must fill out when booking. Toggle required/optional for each field.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(bookingSettings.custom_fields || []).map((field, index) => (
                    <div key={field.id} style={{
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'center',
                      padding: '0.75rem',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)'
                    }}>
                      <input
                        type="text"
                        className="form-input"
                        value={field.label}
                        onChange={(e) => {
                          const fields = [...(bookingSettings.custom_fields || [])];
                          fields[index].label = e.target.value;
                          setBookingSettings(prev => ({ ...prev, custom_fields: fields }));
                        }}
                        placeholder="Field Label"
                        style={{ flex: 1, marginBottom: 0 }}
                      />
                      <select
                        className="form-select"
                        value={field.type}
                        onChange={(e) => {
                          const fields = [...(bookingSettings.custom_fields || [])];
                          fields[index].type = e.target.value;
                          setBookingSettings(prev => ({ ...prev, custom_fields: fields }));
                        }}
                        style={{ width: '120px', marginBottom: 0 }}
                      >
                        <option value="text">Text</option>
                        <option value="email">Email</option>
                        <option value="tel">Phone</option>
                        <option value="textarea">Long Text</option>
                      </select>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        whiteSpace: 'nowrap'
                      }}>
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => {
                            const fields = [...(bookingSettings.custom_fields || [])];
                            fields[index].required = e.target.checked;
                            setBookingSettings(prev => ({ ...prev, custom_fields: fields }));
                          }}
                          style={{ width: '18px', height: '18px' }}
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const fields = (bookingSettings.custom_fields || []).filter((_, i) => i !== index);
                          setBookingSettings(prev => ({ ...prev, custom_fields: fields }));
                        }}
                        style={{
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const fields = bookingSettings.custom_fields || [];
                    const newId = `field_${Date.now()}`;
                    setBookingSettings(prev => ({
                      ...prev,
                      custom_fields: [...fields, { id: newId, label: 'New Field', type: 'text', required: false }]
                    }));
                  }}
                  style={{
                    marginTop: '1rem',
                    padding: '0.75rem 1.5rem',
                    background: 'var(--bg-secondary)',
                    border: '2px dashed var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    width: '100%'
                  }}
                >
                  + Add Field
                </button>
              </div>

              <div style={{
                padding: '1rem',
                background: 'rgba(50, 150, 250, 0.1)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(50, 150, 250, 0.3)'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--info)' }}>
                  💡 How it works
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
                  When a contact books an appointment, it is <strong>automatically confirmed</strong>. They will see a success message with a "Chat with Us" button that opens Messenger with a pre-filled message - this is for optional follow-up contact only, not required for confirmation.
                </p>
              </div>
            </div>
          )}

          {activeMainTab === 'warnings' && (
            <div>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>⚠️ Warning Rules Configuration</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Configure when contacts appear in the Warning Dashboard. These warnings help you identify contacts that need attention.
              </p>

              {/* Time Thresholds */}
              <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                <h5 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>⏰ Time Thresholds</h5>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b' }}></span>
                      Warning After (hours)
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      value={(() => {
                        try {
                          const saved = localStorage.getItem('warning_settings');
                          return saved ? JSON.parse(saved).warning_hours : 24;
                        } catch { return 24; }
                      })()}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 24;
                        try {
                          const saved = localStorage.getItem('warning_settings');
                          const settings = saved ? JSON.parse(saved) : {};
                          settings.warning_hours = val;
                          localStorage.setItem('warning_settings', JSON.stringify(settings));
                        } catch { }
                      }}
                      min="1"
                      max="168"
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Contacts with no activity for this many hours show as "Warning"
                    </small>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }}></span>
                      Critical After (hours)
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      value={(() => {
                        try {
                          const saved = localStorage.getItem('warning_settings');
                          return saved ? JSON.parse(saved).danger_hours : 48;
                        } catch { return 48; }
                      })()}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 48;
                        try {
                          const saved = localStorage.getItem('warning_settings');
                          const settings = saved ? JSON.parse(saved) : {};
                          settings.danger_hours = val;
                          localStorage.setItem('warning_settings', JSON.stringify(settings));
                        } catch { }
                      }}
                      min="1"
                      max="336"
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Contacts with no activity for this many hours show as "Critical"
                    </small>
                  </div>
                </div>
              </div>

              {/* Warning Types */}
              <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                <h5 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>📋 Warning Types</h5>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Enable or disable specific warning categories
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[
                    { key: 'enable_no_activity_warning', label: '⏳ No Activity Warning', desc: 'Alert when contact has no messages for defined hours' },
                    { key: 'enable_awaiting_reply_warning', label: '💬 Awaiting Reply', desc: 'Alert when customer sent last message and is waiting for response' },
                    { key: 'enable_unassigned_warning', label: '👤 Unassigned Contact', desc: 'Alert when contact is not assigned to any team member' },
                    { key: 'enable_no_tag_warning', label: '🏷️ No Tags', desc: 'Alert when contact has no tags assigned' },
                    { key: 'enable_proposal_stuck_warning', label: '📨 Stuck Proposal', desc: 'Alert when proposal was sent but no response received' },
                  ].map(item => (
                    <label
                      key={item.key}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      <input
                        type="checkbox"
                        defaultChecked={(() => {
                          try {
                            const saved = localStorage.getItem('warning_settings');
                            return saved ? JSON.parse(saved)[item.key] !== false : true;
                          } catch { return true; }
                        })()}
                        onChange={(e) => {
                          try {
                            const saved = localStorage.getItem('warning_settings');
                            const settings = saved ? JSON.parse(saved) : {};
                            settings[item.key] = e.target.checked;
                            localStorage.setItem('warning_settings', JSON.stringify(settings));
                          } catch { }
                        }}
                        style={{ width: '18px', height: '18px', marginTop: '2px', flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>{item.label}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Colors */}
              <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                <h5 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>🎨 Warning Colors</h5>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="form-group">
                    <label className="form-label">Warning Color</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="color"
                        defaultValue={(() => {
                          try {
                            const saved = localStorage.getItem('warning_settings');
                            return saved ? JSON.parse(saved).warning_color : '#f59e0b';
                          } catch { return '#f59e0b'; }
                        })()}
                        onChange={(e) => {
                          try {
                            const saved = localStorage.getItem('warning_settings');
                            const settings = saved ? JSON.parse(saved) : {};
                            settings.warning_color = e.target.value;
                            localStorage.setItem('warning_settings', JSON.stringify(settings));
                          } catch { }
                        }}
                        style={{ width: '40px', height: '40px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Amber (default)</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Critical Color</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="color"
                        defaultValue={(() => {
                          try {
                            const saved = localStorage.getItem('warning_settings');
                            return saved ? JSON.parse(saved).danger_color : '#ef4444';
                          } catch { return '#ef4444'; }
                        })()}
                        onChange={(e) => {
                          try {
                            const saved = localStorage.getItem('warning_settings');
                            const settings = saved ? JSON.parse(saved) : {};
                            settings.danger_color = e.target.value;
                            localStorage.setItem('warning_settings', JSON.stringify(settings));
                          } catch { }
                        }}
                        style={{ width: '40px', height: '40px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Red (default)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                padding: '1rem',
                background: 'rgba(50, 150, 250, 0.1)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(50, 150, 250, 0.3)'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--info)' }}>
                  💡 How it works
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Click the <strong>⚠️ warning badge</strong> in the Messenger tab to open the Warning Dashboard.
                  It shows all contacts organized by category (Critical, Warning, Awaiting Reply, Unassigned, No Tags).
                  Changes are saved automatically.
                </p>
              </div>
            </div>
          )}

          {/* AI Chatbot Tab */}
          {activeMainTab === 'aichatbot' && (
            <div>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🤖 AI Chatbot Configuration</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                Configure automated messaging, follow-ups, and AI behavior for your chatbot
              </p>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>-</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI Active</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>-</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Human Takeover</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--info)' }}>-</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pending Follow-ups</div>
                </div>
              </div>

              {/* Core Settings */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>⚙️ Core Settings</h5>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <span>Auto-respond to new messages</span>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
                      <input type="checkbox" defaultChecked={true} onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.auto_respond_to_new_messages = e.target.checked;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }} style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#6366f1', borderRadius: '24px' }}></span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <span>Enable silence follow-ups (24h inactivity)</span>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
                      <input type="checkbox" defaultChecked={true} style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#6366f1', borderRadius: '24px' }}></span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <span>Auto-takeover on low confidence</span>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
                      <input type="checkbox" defaultChecked={true} style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#6366f1', borderRadius: '24px' }}></span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Timing Settings */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>⏱️ Timing Settings</h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Cooldown between messages (hours)</label>
                    <input
                      type="number"
                      className="form-input"
                      defaultValue={4}
                      min="1"
                      max="72"
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.default_cooldown_hours = parseInt(e.target.value) || 4;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Silence threshold (hours)</label>
                    <input
                      type="number"
                      className="form-input"
                      defaultValue={24}
                      min="12"
                      max="168"
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.intuition_silence_hours = parseInt(e.target.value) || 24;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Max messages per day per contact</label>
                    <input
                      type="number"
                      className="form-input"
                      defaultValue={5}
                      min="1"
                      max="10"
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.max_messages_per_day = parseInt(e.target.value) || 5;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min confidence threshold (0-1)</label>
                    <input
                      type="number"
                      className="form-input"
                      defaultValue={0.6}
                      min="0.1"
                      max="1"
                      step="0.1"
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.min_confidence_threshold = parseFloat(e.target.value) || 0.6;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>⚡ Quick Actions</h5>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      if (confirm('Enable AI for all conversations?')) {
                        alert('This will be available when connected to database');
                      }
                    }}
                  >
                    ✅ Enable AI for All
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}
                    onClick={() => {
                      if (confirm('Disable AI for all conversations?')) {
                        alert('This will be available when connected to database');
                      }
                    }}
                  >
                    ⏸️ Disable AI for All
                  </button>
                </div>
              </div>

              {/* Knowledge Base */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>📚 Knowledge Base</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Add information about your business that the AI should know (services, pricing, FAQs, policies)
                </p>
                <textarea
                  className="form-input"
                  rows={6}
                  placeholder={`Example:
- We are Ares Campy, a digital marketing agency
- Services: Facebook Ads Management, Content Creation, Funnel Building
- Pricing: Basic ₱1,799/mo, Star ₱2,999/mo, Fire ₱3,499/mo, Crown ₱5,799/mo
- Office hours: Mon-Fri 9AM-6PM
- Payment: GCash, Bank Transfer, PayMaya`}
                  defaultValue={(() => {
                    try {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      return config.knowledge_base || '';
                    } catch { return ''; }
                  })()}
                  onChange={(e) => {
                    const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                    config.knowledge_base = e.target.value;
                    localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                  }}
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.875rem' }}
                />
              </div>

              {/* System Prompt */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🎯 System Prompt (Bot Personality)</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Define how the AI should behave and respond to customers
                </p>
                <textarea
                  className="form-input"
                  rows={5}
                  placeholder={`Example:
You are a friendly and professional sales assistant for a digital marketing agency. 
Be helpful, concise, and guide customers toward booking a consultation.
Use Tagalog/English mix when appropriate. Be enthusiastic but not pushy.
Always ask for the customer's name and business type early in the conversation.`}
                  defaultValue={(() => {
                    try {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      return config.system_prompt || '';
                    } catch { return ''; }
                  })()}
                  onChange={(e) => {
                    const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                    config.system_prompt = e.target.value;
                    localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                  }}
                  style={{ resize: 'vertical', fontSize: '0.875rem' }}
                />
              </div>

              {/* Follow-up Prompts */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>💬 Follow-up Message Templates</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Templates for automated follow-up messages. Use {'{name}'} for contact's first name.
                </p>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Initial Follow-up (after 24h silence)</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Hi {name}! 👋 Just checking in - did you have any questions about our services?"
                      defaultValue={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.followup_initial || '';
                        } catch { return ''; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.followup_initial = e.target.value;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ resize: 'vertical', fontSize: '0.875rem' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Second Follow-up (after 48h)</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Hey {name}! 😊 I noticed you might still be thinking about it. Would a quick call help answer your questions?"
                      defaultValue={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.followup_second || '';
                        } catch { return ''; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.followup_second = e.target.value;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ resize: 'vertical', fontSize: '0.875rem' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Re-engagement (after 7+ days)</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Hi {name}! We have some new packages that might interest you. Want to hear about them? 🚀"
                      defaultValue={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.followup_reengagement || '';
                        } catch { return ''; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.followup_reengagement = e.target.value;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ resize: 'vertical', fontSize: '0.875rem' }}
                    />
                  </div>
                </div>
              </div>

              {/* Conversation Goals/Flow */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🎯 Conversation Goals</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Define what the AI should try to achieve in conversations
                </p>

                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {[
                    { key: 'goal_collect_info', label: 'Collect customer info (name, business, contact)', icon: '📝' },
                    { key: 'goal_qualify_lead', label: 'Qualify leads (budget, timeline, needs)', icon: '🎯' },
                    { key: 'goal_book_meeting', label: 'Book consultation/meeting', icon: '📅' },
                    { key: 'goal_send_pricing', label: 'Send pricing information', icon: '💰' },
                    { key: 'goal_answer_faq', label: 'Answer common questions', icon: '❓' }
                  ].map(goal => (
                    <div
                      key={goal.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)'
                      }}
                    >
                      <span>{goal.icon} {goal.label}</span>
                      <input
                        type="checkbox"
                        defaultChecked={(() => {
                          try {
                            const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                            return config[goal.key] !== false;
                          } catch { return true; }
                        })()}
                        onChange={(e) => {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          config[goal.key] = e.target.checked;
                          localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                        }}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Booking Link */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🔗 Booking Link</h5>
                <div className="form-group">
                  <label className="form-label">URL for booking appointments</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://yoursite.com/book or Calendly link"
                    defaultValue={(() => {
                      try {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        return config.booking_url || '';
                      } catch { return ''; }
                    })()}
                    onChange={(e) => {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      config.booking_url = e.target.value;
                      localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                    }}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    The AI will share this link when trying to book meetings
                  </small>
                </div>
              </div>

              {/* Info Box */}
              <div style={{
                padding: '1rem',
                background: 'rgba(99, 102, 241, 0.1)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(99, 102, 241, 0.3)'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--primary)' }}>
                  💡 User Controls
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Regular users can <strong>pause/resume AI</strong> for individual contacts and <strong>view scheduled follow-ups</strong>
                  using the 🤖 button in each conversation. Only admins can modify these global settings.
                </p>
              </div>
            </div>
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
