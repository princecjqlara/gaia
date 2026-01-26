import React, { useState, useEffect } from 'react';
import TagManagementModal from './TagManagementModal';
import EmployeeSalaryManagement from './EmployeeSalaryManagement';
import facebookService from '../services/facebookService';

const AdminSettingsModal = ({ onClose, getExpenses, saveExpenses, getAIPrompts, saveAIPrompts, getPackagePrices, savePackagePrices, getPackageDetails, savePackageDetails, onTeamPerformance }) => {
  const [showTagManagement, setShowTagManagement] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState('employees'); // employees, facebook, booking
  const [activePageId, setActivePageId] = useState('default'); // Will be set from connected pages

  // AI Chatbot stats
  const [aiStats, setAiStats] = useState({
    aiActive: 0,
    humanTakeover: 0,
    pendingFollowups: 0
  });

  // Fetch AI stats on mount
  useEffect(() => {
    const fetchAiStats = async () => {
      try {
        const supabaseUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) return;

        const { createClient } = await import('@supabase/supabase-js');
        const db = createClient(supabaseUrl, supabaseKey);

        // Count AI Active (ai_enabled = true, human_takeover = false/null)
        const { count: aiActiveCount } = await db
          .from('facebook_conversations')
          .select('*', { count: 'exact', head: true })
          .or('ai_enabled.is.null,ai_enabled.eq.true')
          .or('human_takeover.is.null,human_takeover.eq.false');

        // Count Human Takeover
        const { count: humanTakeoverCount } = await db
          .from('facebook_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('human_takeover', true);

        // Count Pending Follow-ups
        const { count: pendingFollowupsCount } = await db
          .from('ai_followup_schedule')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        setAiStats({
          aiActive: aiActiveCount || 0,
          humanTakeover: humanTakeoverCount || 0,
          pendingFollowups: pendingFollowupsCount || 0
        });
      } catch (err) {
        console.log('Error fetching AI stats:', err);
      }
    };
    fetchAiStats();
  }, []);

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
                      const appId = import.meta.env.VITE_FACEBOOK_APP_ID || '2887110501632122';
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
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Configure automated messaging, follow-ups, and AI behavior for your chatbot
              </p>

              {/* IMPORTANT: Save to Database Button */}
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                background: 'rgba(99, 102, 241, 0.1)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(99, 102, 241, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: 'var(--primary)' }}>
                      ⚠️ Important: Save your settings for the bot to use them
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
                      Settings are saved locally. Click "Save to Database" to activate them for the AI bot.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ whiteSpace: 'nowrap', padding: '0.75rem 1.5rem' }}
                    onClick={async () => {
                      try {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        const { getSupabaseClient } = await import('../services/supabase');
                        const db = getSupabaseClient();

                        // Upsert settings to database
                        const { error } = await db
                          .from('settings')
                          .upsert({
                            key: 'ai_chatbot_config',
                            value: config,
                            updated_at: new Date().toISOString()
                          }, { onConflict: 'key' });

                        if (error) throw error;
                        alert('✅ Settings saved to database! The bot will now use these settings.');
                      } catch (err) {
                        console.error('Error saving to database:', err);
                        alert('❌ Failed to save: ' + err.message);
                      }
                    }}
                  >
                    💾 Save to Database
                  </button>
                </div>
              </div>

              {/* GLOBAL BOT KILL SWITCH */}
              <div style={{
                marginBottom: '1.5rem',
                padding: '1.25rem',
                background: (() => {
                  try {
                    const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                    return config.global_bot_enabled === false
                      ? 'rgba(239, 68, 68, 0.15)'
                      : 'rgba(34, 197, 94, 0.15)';
                  } catch { return 'rgba(34, 197, 94, 0.15)'; }
                })(),
                borderRadius: 'var(--radius-lg)',
                border: (() => {
                  try {
                    const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                    return config.global_bot_enabled === false
                      ? '2px solid rgba(239, 68, 68, 0.5)'
                      : '2px solid rgba(34, 197, 94, 0.5)';
                  } catch { return '2px solid rgba(34, 197, 94, 0.5)'; }
                })()
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{
                      fontWeight: '700',
                      fontSize: '1.1rem',
                      marginBottom: '0.25rem',
                      color: (() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.global_bot_enabled === false ? '#ef4444' : '#22c55e';
                        } catch { return '#22c55e'; }
                      })()
                    }}>
                      {(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.global_bot_enabled === false
                            ? '🔴 BOT IS STOPPED'
                            : '🟢 BOT IS RUNNING';
                        } catch { return '🟢 BOT IS RUNNING'; }
                      })()}
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
                      Global kill switch - stops ALL AI messages and follow-ups
                    </p>
                  </div>
                  <button
                    type="button"
                    style={{
                      padding: '0.75rem 1.5rem',
                      borderRadius: 'var(--radius-md)',
                      border: 'none',
                      fontWeight: '600',
                      fontSize: '1rem',
                      cursor: 'pointer',
                      background: (() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.global_bot_enabled === false ? '#22c55e' : '#ef4444';
                        } catch { return '#ef4444'; }
                      })(),
                      color: 'white',
                      minWidth: '140px'
                    }}
                    onClick={async () => {
                      try {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        const newState = config.global_bot_enabled === false ? true : false;
                        config.global_bot_enabled = newState;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));

                        // Also save to database immediately
                        const { getSupabaseClient } = await import('../services/supabase');
                        const db = getSupabaseClient();
                        await db
                          .from('settings')
                          .upsert({
                            key: 'ai_chatbot_config',
                            value: config,
                            updated_at: new Date().toISOString()
                          }, { onConflict: 'key' });

                        alert(newState ? '✅ Bot is now RUNNING!' : '⛔ Bot is now STOPPED!');
                        window.location.reload();
                      } catch (err) {
                        console.error('Error toggling bot:', err);
                        alert('❌ Failed to toggle: ' + err.message);
                      }
                    }}
                  >
                    {(() => {
                      try {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        return config.global_bot_enabled === false ? '▶️ START BOT' : '⏹️ STOP BOT';
                      } catch { return '⏹️ STOP BOT'; }
                    })()}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>{aiStats.aiActive}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI Active</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>{aiStats.humanTakeover}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Human Takeover</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--info)' }}>{aiStats.pendingFollowups}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pending Follow-ups</div>
                </div>
              </div>

              {/* Core Settings */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>⚙️ Core Settings</h5>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                    <span>Auto-respond to new messages</span>
                    <input
                      type="checkbox"
                      defaultChecked={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.auto_respond_to_new_messages !== false;
                        } catch { return true; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.auto_respond_to_new_messages = e.target.checked;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ width: '20px', height: '20px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                  </label>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                    <span>Enable silence follow-ups (24h inactivity)</span>
                    <input
                      type="checkbox"
                      defaultChecked={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.enable_silence_followups !== false;
                        } catch { return true; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.enable_silence_followups = e.target.checked;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ width: '20px', height: '20px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                  </label>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                    <span>Auto-takeover on low confidence</span>
                    <input
                      type="checkbox"
                      defaultChecked={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.auto_takeover_on_low_confidence !== false;
                        } catch { return true; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.auto_takeover_on_low_confidence = e.target.checked;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ width: '20px', height: '20px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                  </label>

                  {/* Default Goal Selector */}
                  <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span>🎯 Default Goal for New Contacts</span>
                    </div>
                    <select
                      defaultValue={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.default_goal || 'booking';
                        } catch { return 'booking'; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.default_goal = e.target.value;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        marginBottom: '0.5rem'
                      }}
                    >
                      <option value="booking">📅 Book a Call</option>
                      <option value="closing">💰 Close Sale</option>
                      <option value="follow_up">🔄 Re-engage Lead</option>
                      <option value="qualification">🎯 Qualify Lead</option>
                      <option value="information">ℹ️ Provide Information</option>
                    </select>
                    <button
                      onClick={async () => {
                        if (!confirm('Apply this goal to ALL existing contacts? This cannot be undone.')) return;
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          const goal = config.default_goal || 'booking';

                          const supabaseUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
                          const supabaseKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
                          if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');

                          const { createClient } = await import('@supabase/supabase-js');
                          const db = createClient(supabaseUrl, supabaseKey);

                          const { error } = await db
                            .from('facebook_conversations')
                            .update({ active_goal_id: goal, goal_completed: false })
                            .not('opt_out', 'eq', true);

                          if (error) throw error;
                          alert(`✅ Applied goal "${goal}" to all contacts!`);
                        } catch (err) {
                          alert('❌ Failed: ' + err.message);
                        }
                      }}
                      className="btn btn-sm btn-secondary"
                      style={{ width: '100%', fontSize: '0.75rem' }}
                    >
                      🔄 Apply Goal to All Existing Contacts
                    </button>
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
- We are Gaia, a digital marketing agency
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

              {/* FAQ for RAG Pipeline */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>❓ FAQ (Frequently Asked Questions)</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Add common questions and answers. The AI will use these to respond accurately.
                </p>
                <textarea
                  className="form-input"
                  rows={8}
                  placeholder={`Q: Magkano po ang basic package?
A: Ang Basic package natin ay ₱1,799 per month, kasama na ang 2 videos, 2 photos, at ad management.

Q: Pwede po ba sa installment?
A: Yes po! May 2x payment option tayo - 50% upfront, 50% after 2 weeks.

Q: Gaano katagal bago mag-start?
A: Usually 3-5 business days after payment confirmation po.

Q: What if hindi effective ang ads?
A: We offer optimization and A/B testing. If after 14 days walang improvement, free consultation natin.`}
                  defaultValue={(() => {
                    try {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      return config.faq || '';
                    } catch { return ''; }
                  })()}
                  onChange={(e) => {
                    const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                    config.faq = e.target.value;
                    localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                  }}
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.875rem' }}
                />
              </div>

              {/* Language Selector */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🌐 Response Language</h5>
                <select
                  className="form-input"
                  defaultValue={(() => {
                    try {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      return config.language || 'Taglish';
                    } catch { return 'Taglish'; }
                  })()}
                  onChange={(e) => {
                    const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                    config.language = e.target.value;
                    localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                  }}
                  style={{ maxWidth: '300px' }}
                >
                  <option value="Taglish">Taglish (Tagalog + English mix) - Default</option>
                  <option value="English">English only</option>
                  <option value="Tagalog">Tagalog only</option>
                  <option value="Filipino">Filipino (formal)</option>
                </select>
              </div>

              {/* Bot Rules - Do's and Don'ts */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>📋 Bot Rules (Do's & Don'ts)</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Set clear boundaries for what the AI should and shouldn't do
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Do's */}
                  <div>
                    <label className="form-label" style={{ color: '#34d399' }}>✅ DO's (Things the bot SHOULD do)</label>
                    <textarea
                      className="form-input"
                      rows={8}
                      placeholder={`- Always greet customers warmly
- Ask for their name early
- Explain services clearly
- Provide pricing when asked
- Suggest booking a call
- Use emojis sparingly
- Be patient with questions
- Offer alternatives if unsure
- Confirm understanding
- Thank them for inquiring`}
                      defaultValue={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.bot_rules_dos || '';
                        } catch { return ''; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.bot_rules_dos = e.target.value;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ resize: 'vertical', fontSize: '0.875rem', borderColor: 'rgba(52, 211, 153, 0.3)' }}
                    />
                  </div>

                  {/* Don'ts */}
                  <div>
                    <label className="form-label" style={{ color: '#f87171' }}>❌ DON'Ts (Things the bot should NEVER do)</label>
                    <textarea
                      className="form-input"
                      rows={8}
                      placeholder={`- Never make up information
- Don't promise discounts
- Never share competitor info
- Don't be pushy or aggressive
- Never give legal/medical advice
- Don't use inappropriate language
- Never share other client data
- Don't guarantee results
- Never ask for passwords
- Don't discuss politics/religion`}
                      defaultValue={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.bot_rules_donts || '';
                        } catch { return ''; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.bot_rules_donts = e.target.value;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ resize: 'vertical', fontSize: '0.875rem', borderColor: 'rgba(248, 113, 113, 0.3)' }}
                    />
                  </div>
                </div>

                {/* Escalation Rules */}
                <div style={{ marginTop: '1rem' }}>
                  <label className="form-label" style={{ color: '#fbbf24' }}>⚠️ Escalation Triggers (When to hand off to human)</label>
                  <textarea
                    className="form-input"
                    rows={4}
                    placeholder={`- Customer explicitly asks for a human
- Complaints or angry customers
- Complex technical questions
- Refund/cancellation requests
- Questions about contracts
- Pricing negotiations beyond 10%
- Any legal or liability concerns`}
                    defaultValue={(() => {
                      try {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        return config.escalation_triggers || '';
                      } catch { return ''; }
                    })()}
                    onChange={(e) => {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      config.escalation_triggers = e.target.value;
                      localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                    }}
                    style={{ resize: 'vertical', fontSize: '0.875rem', borderColor: 'rgba(251, 191, 36, 0.3)' }}
                  />
                </div>
              </div>

              {/* AI Auto-Labeling Rules */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🏷️ AI Auto-Labeling Rules</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Define rules for how the AI should automatically label/tag contacts based on their conversations.
                  Format: LABEL_NAME: condition/criteria
                </p>

                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', cursor: 'pointer', marginBottom: '1rem' }}>
                  <span>Enable AI Auto-Labeling</span>
                  <input
                    type="checkbox"
                    defaultChecked={(() => {
                      try {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        return config.auto_labeling_enabled !== false;
                      } catch { return true; }
                    })()}
                    onChange={(e) => {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      config.auto_labeling_enabled = e.target.checked;
                      localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                    }}
                    style={{ width: '20px', height: '20px', accentColor: '#6366f1', cursor: 'pointer' }}
                  />
                </label>

                <textarea
                  className="form-input"
                  rows={10}
                  placeholder={`QUALIFIED: Customer mentions budget, asks about pricing, shows buying intent
UNQUALIFIED: Customer says not interested, wrong fit, or no budget
HOT_LEAD: Customer wants to book immediately or mentions urgency
FOLLOW_UP_NEEDED: Customer requested callback or said "later"
INTERESTED: Customer is asking questions about the service
NEEDS_INFO: Customer wants more details before deciding
PRICE_SENSITIVE: Customer is hesitant due to pricing
DECISION_MAKER: Customer can make purchase decisions
REFERRAL: Customer was referred by someone`}
                  defaultValue={(() => {
                    try {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      return config.labeling_rules || '';
                    } catch { return ''; }
                  })()}
                  onChange={(e) => {
                    const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                    config.labeling_rules = e.target.value;
                    localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                  }}
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.875rem' }}
                />

                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: 'rgba(99, 102, 241, 0.1)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid rgba(99, 102, 241, 0.3)'
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--primary)' }}>
                    💡 How it works
                  </div>
                  <ul style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: '1.25rem' }}>
                    <li>AI analyzes each conversation after a customer message</li>
                    <li>Labels are automatically applied/removed based on your rules</li>
                    <li>Labels appear as tags on contacts in the Messenger tab</li>
                    <li>Tags are created automatically if they don't exist</li>
                    <li>Remember to click "Save to Database" after changing rules!</li>
                  </ul>
                </div>
              </div>

              {/* Comment Auto-Reply Settings */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>💬 Comment Auto-Reply</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Automatically reply to comments on your Facebook posts and DM interested commenters.
                </p>

                <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                    <span>Enable Comment Auto-Reply</span>
                    <input
                      type="checkbox"
                      defaultChecked={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.comment_auto_reply_enabled !== false;
                        } catch { return true; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.comment_auto_reply_enabled = e.target.checked;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ width: '20px', height: '20px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                  </label>

                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                    <span>Auto-DM Interested Commenters</span>
                    <input
                      type="checkbox"
                      defaultChecked={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.comment_dm_interested !== false;
                        } catch { return true; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.comment_dm_interested = e.target.checked;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ width: '20px', height: '20px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                  </label>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Interest Keywords (comma-separated)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="interested,how much,price,magkano,pls,please,dm,pm,info,avail"
                    defaultValue={(() => {
                      try {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        return config.comment_interest_keywords || '';
                      } catch { return ''; }
                    })()}
                    onChange={(e) => {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      config.comment_interest_keywords = e.target.value;
                      localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                    }}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    Comments containing these keywords will trigger a DM
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label">Comment Reply Prompt</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="Thank the user briefly and invite them to check their DM for more info."
                    defaultValue={(() => {
                      try {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        return config.comment_reply_prompt || '';
                      } catch { return ''; }
                    })()}
                    onChange={(e) => {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      config.comment_reply_prompt = e.target.value;
                      localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                    }}
                    style={{ resize: 'vertical', fontSize: '0.875rem' }}
                  />
                </div>

                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: 'rgba(251, 191, 36, 0.1)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid rgba(251, 191, 36, 0.3)'
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#fbbf24' }}>
                    ⚠️ Facebook Setup Required
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Your Facebook App must be subscribed to the <strong>feed</strong> webhook field.
                    Go to Facebook Developer Console → Webhooks → Subscribe to "feed" in addition to "messaging".
                  </p>
                </div>
              </div>

              {/* Follow-up Prompts - AI Generates Messages */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🤖 Follow-up Prompts (AI-Generated)</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Give the AI instructions for what to achieve in follow-ups. The AI will generate contextual messages based on the conversation history.
                </p>

                <div style={{ padding: '0.75rem 1rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>💡 The AI will read the conversation and generate a personalized follow-up based on your prompt</span>
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Initial Follow-up Prompt (after 24h silence)</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Check in with the contact, remind them of what was discussed, and ask if they have any questions."
                      defaultValue={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.followup_prompt_initial || '';
                        } catch { return ''; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.followup_prompt_initial = e.target.value;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ resize: 'vertical', fontSize: '0.875rem' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Second Follow-up Prompt (after 48h)</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Gently follow up, offer to schedule a call, and provide value by sharing relevant info about our services."
                      defaultValue={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.followup_prompt_second || '';
                        } catch { return ''; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.followup_prompt_second = e.target.value;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ resize: 'vertical', fontSize: '0.875rem' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Re-engagement Prompt (after 7+ days)</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Re-engage the contact with something new (promo, new service, case study). Make them feel valued and not forgotten."
                      defaultValue={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.followup_prompt_reengagement || '';
                        } catch { return ''; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.followup_prompt_reengagement = e.target.value;
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

                {/* Custom Goals */}
                <div style={{ marginTop: '1rem' }}>
                  <label className="form-label">➕ Custom Goals (one per line)</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder={`Add your own goals, e.g.:
- Get customer's Facebook page URL
- Ask about their monthly ad budget
- Collect their preferred contact time`}
                    defaultValue={(() => {
                      try {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        return config.custom_goals || '';
                      } catch { return ''; }
                    })()}
                    onChange={(e) => {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      config.custom_goals = e.target.value;
                      localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                    }}
                    style={{ resize: 'vertical', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              {/* AI Behavior Controls */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🔄 AI Behavior Controls</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Control how the AI re-engages and when it should stop
                </p>

                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {/* Stop on Goal Reached */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <span>🛑 Stop AI when goal is reached</span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI stops messaging after achieving the conversation goal</div>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.stop_on_goal_reached !== false;
                        } catch { return true; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.stop_on_goal_reached = e.target.checked;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </div>

                  {/* AI Re-entry */}
                  <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span>🔄 AI Re-entry Mode</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      When should AI resume after human takeover or pause?
                    </div>
                    <select
                      className="form-input"
                      defaultValue={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.ai_reentry_mode || 'manual';
                        } catch { return 'manual'; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.ai_reentry_mode = e.target.value;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ fontSize: '0.875rem' }}
                    >
                      <option value="manual">Manual only - User must re-enable AI</option>
                      <option value="after_24h">Auto after 24h silence</option>
                      <option value="after_48h">Auto after 48h silence</option>
                      <option value="after_7d">Auto after 7 days silence</option>
                      <option value="never">Never - AI stays off once paused</option>
                    </select>
                  </div>

                  {/* AI-Generated Follow-ups */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <span>✨ AI-Generated Follow-ups</span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Let AI create contextual follow-ups based on conversation</div>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked={(() => {
                        try {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          return config.ai_generated_followups === true;
                        } catch { return false; }
                      })()}
                      onChange={(e) => {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        config.ai_generated_followups = e.target.checked;
                        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                      }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              </div>

              {/* Booking & Calendar */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>📅 Booking & Calendar</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Configure how AI handles appointment booking
                </p>

                {/* Booking Mode */}
                <div style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Booking Mode</label>
                  <select
                    className="form-input"
                    defaultValue={(() => {
                      try {
                        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                        return config.booking_mode || 'link';
                      } catch { return 'link'; }
                    })()}
                    onChange={(e) => {
                      const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                      config.booking_mode = e.target.value;
                      localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                    }}
                    style={{ fontSize: '0.875rem' }}
                  >
                    <option value="link">📎 Share booking link only</option>
                    <option value="auto_book">📅 Auto-book to team calendar</option>
                    <option value="suggest_times">⏰ AI suggests available times, user confirms</option>
                  </select>
                </div>

                {/* Booking URL */}
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Booking Link URL</label>
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
                </div>

                {/* Auto-book Settings */}
                <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <div style={{ fontWeight: 500, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>📅 Auto-Book Settings</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Default Meeting Duration</label>
                      <select
                        className="form-input"
                        defaultValue={(() => {
                          try {
                            const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                            return config.default_meeting_duration || '30';
                          } catch { return '30'; }
                        })()}
                        onChange={(e) => {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          config.default_meeting_duration = e.target.value;
                          localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                        }}
                        style={{ fontSize: '0.875rem' }}
                      >
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="45">45 minutes</option>
                        <option value="60">1 hour</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Assign Booking To</label>
                      <select
                        className="form-input"
                        defaultValue={(() => {
                          try {
                            const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                            return config.assign_booking_to || 'assigned_user';
                          } catch { return 'assigned_user'; }
                        })()}
                        onChange={(e) => {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          config.assign_booking_to = e.target.value;
                          localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                        }}
                        style={{ fontSize: '0.875rem' }}
                      >
                        <option value="assigned_user">Contact's assigned user</option>
                        <option value="round_robin">Round robin (team)</option>
                        <option value="least_busy">Least busy team member</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        defaultChecked={(() => {
                          try {
                            const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                            return config.send_calendar_invite !== false;
                          } catch { return true; }
                        })()}
                        onChange={(e) => {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          config.send_calendar_invite = e.target.checked;
                          localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                        }}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '0.875rem' }}>Send calendar invite to customer</span>
                    </label>
                  </div>

                  <div style={{ marginTop: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        defaultChecked={(() => {
                          try {
                            const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                            return config.confirm_before_booking === true;
                          } catch { return false; }
                        })()}
                        onChange={(e) => {
                          const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
                          config.confirm_before_booking = e.target.checked;
                          localStorage.setItem('ai_chatbot_config', JSON.stringify(config));
                        }}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '0.875rem' }}>Ask for confirmation before finalizing booking</span>
                    </label>
                  </div>
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

