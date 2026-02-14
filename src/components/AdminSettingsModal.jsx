import React, { useState, useEffect } from 'react';
import TagManagementModal from './TagManagementModal';

import facebookService from '../services/facebookService';

const AdminSettingsModal = ({ onClose, getExpenses, saveExpenses, getAIPrompts, saveAIPrompts, getPackagePrices, savePackagePrices, getPackageDetails, savePackageDetails, onTeamPerformance }) => {
  const [showTagManagement, setShowTagManagement] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState('facebook'); // facebook, booking, aichatbot, stages, invitecodes

  // Invite Codes State
  const [inviteCodes, setInviteCodes] = useState([]);
  const [loadingInviteCodes, setLoadingInviteCodes] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState(null);
  const [activePageId, setActivePageId] = useState('default'); // Will be set from connected pages

  // Stages Management State
  const [customStages, setCustomStages] = useState([]);
  const [newStageName, setNewStageName] = useState('');
  const [newStageEmoji, setNewStageEmoji] = useState('📌');
  const [editingStage, setEditingStage] = useState(null);
  const [loadingStages, setLoadingStages] = useState(false);
  const [savingStages, setSavingStages] = useState(false);

  // Evaluation threshold settings
  const [evaluationThreshold, setEvaluationThreshold] = useState(() => {
    try {
      const saved = localStorage.getItem('evaluation_threshold');
      return saved ? parseInt(saved) : 70;
    } catch {
      return 70;
    }
  });

  // AI Chatbot stats
  const [aiStats, setAiStats] = useState({
    aiActive: 0,
    humanTakeover: 0,
    pendingFollowups: 0
  });

  const [connectedPages, setConnectedPages] = useState([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);

  // Sequences & A/B Testing State
  const [sequences, setSequences] = useState([]);
  const [messagePrompts, setMessagePrompts] = useState([]);
  const [sequencePerformance, setSequencePerformance] = useState([]);
  const [loadingSequences, setLoadingSequences] = useState(false);
  const [savingSequence, setSavingSequence] = useState(false);
  const [expandedSequenceId, setExpandedSequenceId] = useState(null);

  // Fetch connected pages on mount
  useEffect(() => {
    const fetchPages = async () => {
      setIsLoadingPages(true);
      try {
        const pages = await facebookService.getConnectedPages();
        setConnectedPages(pages);
        if (pages.length > 0) {
          setActivePageId(pages[0].page_id);
          // Also update local storage for other components
          localStorage.setItem('connected_facebook_pages', JSON.stringify(pages));
          localStorage.setItem('selectedPageId', pages[0].page_id);
        }
      } catch (err) {
        console.error('Error loading connected pages:', err);
      } finally {
        setIsLoadingPages(false);
      }
    };
    fetchPages();
  }, []);

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

  // ==========================================
  // MESSAGE PROMPTS & A/B TESTING FUNCTIONS
  // ==========================================
  const getDb = async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
    return createClient(supabaseUrl, supabaseKey);
  };

  const loadSequences = async () => {
    try {
      setLoadingSequences(true);
      const db = await getDb();
      // Load sequences
      const { data: seqs, error: seqErr } = await db
        .from('message_sequences')
        .select('*')
        .order('created_at', { ascending: true });
      if (seqErr) throw seqErr;
      setSequences(seqs || []);

      // Load all prompts (with sequence info)
      const { data: prompts, error: promptErr } = await db
        .from('message_prompts')
        .select('*')
        .order('sequence_position', { ascending: true });
      if (promptErr) throw promptErr;
      setMessagePrompts(prompts || []);
    } catch (err) {
      console.error('Error loading sequences:', err);
    } finally {
      setLoadingSequences(false);
    }
  };

  const loadSequencePerformance = async () => {
    try {
      const db = await getDb();
      const { data, error } = await db
        .from('sequence_performance')
        .select('*')
        .order('avg_conversion_score', { ascending: false });
      if (error) throw error;
      setSequencePerformance(data || []);
    } catch (err) {
      console.error('Error loading sequence performance:', err);
    }
  };

  const addSequence = async () => {
    try {
      setSavingSequence(true);
      const db = await getDb();
      const { data, error } = await db
        .from('message_sequences')
        .insert({ label: 'New Sequence', is_active: true })
        .select()
        .single();
      if (error) throw error;
      setSequences(prev => [...prev, data]);
      setExpandedSequenceId(data.id);
      // Add first empty step automatically
      const { data: step, error: stepErr } = await db
        .from('message_prompts')
        .insert({
          prompt_text: '',
          label: 'Step 1',
          sequence_id: data.id,
          sequence_position: 1,
          is_active: true
        })
        .select()
        .single();
      if (!stepErr && step) {
        setMessagePrompts(prev => [...prev, step]);
      }
    } catch (err) {
      console.error('Error adding sequence:', err);
      alert('Failed to add sequence: ' + err.message);
    } finally {
      setSavingSequence(false);
    }
  };

  const removeSequence = async (seqId) => {
    if (!confirm('Delete this sequence and all its steps?')) return;
    try {
      const db = await getDb();
      const { error } = await db
        .from('message_sequences')
        .delete()
        .eq('id', seqId);
      if (error) throw error;
      setSequences(prev => prev.filter(s => s.id !== seqId));
      setMessagePrompts(prev => prev.filter(p => p.sequence_id !== seqId));
    } catch (err) {
      console.error('Error deleting sequence:', err);
    }
  };

  const toggleSequenceActive = async (seqId, isActive) => {
    try {
      const db = await getDb();
      const { error } = await db
        .from('message_sequences')
        .update({ is_active: !isActive, updated_at: new Date().toISOString() })
        .eq('id', seqId);
      if (error) throw error;
      setSequences(prev =>
        prev.map(s => s.id === seqId ? { ...s, is_active: !isActive } : s)
      );
    } catch (err) {
      console.error('Error toggling sequence:', err);
    }
  };

  const updateSequenceLabel = async (seqId, newLabel) => {
    try {
      const db = await getDb();
      const { error } = await db
        .from('message_sequences')
        .update({ label: newLabel, updated_at: new Date().toISOString() })
        .eq('id', seqId);
      if (error) throw error;
      setSequences(prev =>
        prev.map(s => s.id === seqId ? { ...s, label: newLabel } : s)
      );
    } catch (err) {
      console.error('Error updating sequence label:', err);
    }
  };

  const addStepToSequence = async (seqId) => {
    try {
      const db = await getDb();
      const existingSteps = messagePrompts.filter(p => p.sequence_id === seqId);
      const nextPos = existingSteps.length + 1;
      const { data, error } = await db
        .from('message_prompts')
        .insert({
          prompt_text: '',
          label: `Step ${nextPos}`,
          sequence_id: seqId,
          sequence_position: nextPos,
          is_active: true
        })
        .select()
        .single();
      if (error) throw error;
      setMessagePrompts(prev => [...prev, data]);
    } catch (err) {
      console.error('Error adding step:', err);
    }
  };

  const removeStep = async (promptId, seqId) => {
    try {
      const db = await getDb();
      const { error } = await db
        .from('message_prompts')
        .delete()
        .eq('id', promptId);
      if (error) throw error;
      // Remove and re-number remaining steps
      const remaining = messagePrompts
        .filter(p => p.id !== promptId && p.sequence_id === seqId)
        .sort((a, b) => a.sequence_position - b.sequence_position);
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].sequence_position !== i + 1) {
          await db.from('message_prompts')
            .update({ sequence_position: i + 1, label: `Step ${i + 1}` })
            .eq('id', remaining[i].id);
          remaining[i].sequence_position = i + 1;
          remaining[i].label = `Step ${i + 1}`;
        }
      }
      setMessagePrompts(prev => {
        const withoutDeleted = prev.filter(p => p.id !== promptId);
        return withoutDeleted.map(p => {
          const updated = remaining.find(r => r.id === p.id);
          return updated ? { ...p, ...updated } : p;
        });
      });
    } catch (err) {
      console.error('Error removing step:', err);
    }
  };

  const updateStepPrompt = async (promptId, newText) => {
    try {
      const db = await getDb();
      const { error } = await db
        .from('message_prompts')
        .update({ prompt_text: newText, updated_at: new Date().toISOString() })
        .eq('id', promptId);
      if (error) throw error;
      setMessagePrompts(prev =>
        prev.map(p => p.id === promptId ? { ...p, prompt_text: newText } : p)
      );
    } catch (err) {
      console.error('Error updating step:', err);
    }
  };

  // Load sequences when AI chatbot tab is active
  useEffect(() => {
    if (activeMainTab === 'aichatbot') {
      loadSequences();
      loadSequencePerformance();
    }
  }, [activeMainTab]);

  // Stages Management Functions
  const loadCustomStages = async () => {
    try {
      setLoadingStages(true);
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const db = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await db
        .from('custom_stages')
        .select('*')
        .order('order_position', { ascending: true });

      if (error) throw error;

      // Ensure system default stages are always present
      const defaultSystemStages = [
        { id: '0', stage_key: 'evaluated', display_name: 'Evaluated', emoji: '✅', color: '#22c55e', order_position: 0, is_system_default: true },
        { id: '1', stage_key: 'booked', display_name: 'Booked', emoji: '📅', color: '#3b82f6', order_position: 1, is_system_default: true }
      ];

      const finalStages = data || [];
      const hasEvaluated = finalStages.some(s => s.stage_key === 'evaluated');
      const hasBooked = finalStages.some(s => s.stage_key === 'booked');

      let stagesToSave = finalStages;
      if (!hasEvaluated || !hasBooked) {
        // Add missing system default stages
        const existingSystem = finalStages.filter(s => s.is_system_default);
        const existingCustom = finalStages.filter(s => !s.is_system_default);
        stagesToSave = [...defaultSystemStages, ...existingCustom];

        // Save to localStorage
        localStorage.setItem('custom_stages', JSON.stringify(stagesToSave));
        console.log('Migrated: Ensured system default stages present in AdminSettings');
      }

      setCustomStages(stagesToSave);
      localStorage.setItem('custom_stages', JSON.stringify(stagesToSave));
    } catch (err) {
      console.error('Error loading custom stages:', err);
      // Fallback to localStorage or defaults
      const localStages = localStorage.getItem('custom_stages');
      if (localStages) {
        const parsed = JSON.parse(localStages);

        // Verify system defaults exist in localStorage too
        const hasEvaluated = parsed.some(s => s.stage_key === 'evaluated');
        const hasBooked = parsed.some(s => s.stage_key === 'booked');

        let stagesToUse = parsed;
        if (!hasEvaluated || !hasBooked) {
          const defaultSystemStages = [
            { id: '0', stage_key: 'evaluated', display_name: 'Evaluated', emoji: '✅', color: '#22c55e', order_position: 0, is_system_default: true },
            { id: '1', stage_key: 'booked', display_name: 'Booked', emoji: '📅', color: '#3b82f6', order_position: 1, is_system_default: true }
          ];
          const existingCustom = parsed.filter(s => !s.is_system_default);
          stagesToUse = [...defaultSystemStages, ...existingCustom];
          localStorage.setItem('custom_stages', JSON.stringify(stagesToUse));
        }

        setCustomStages(stagesToUse);
      } else {
        // Default stages
        setCustomStages([
          { id: '0', stage_key: 'evaluated', display_name: 'Evaluated', emoji: '✅', color: '#22c55e', order_position: 0, is_system_default: true },
          { id: '1', stage_key: 'booked', display_name: 'Booked', emoji: '📅', color: '#3b82f6', order_position: 1, is_system_default: true },
          { id: '2', stage_key: 'follow-up', display_name: 'Follow-up', emoji: '💬', color: '#f59e0b', order_position: 2, is_system_default: false },
          { id: '3', stage_key: 'preparing', display_name: 'Preparing', emoji: '⏳', color: '#8b5cf6', order_position: 3, is_system_default: false },
          { id: '4', stage_key: 'testing', display_name: 'Testing', emoji: '🧪', color: '#ec4899', order_position: 4, is_system_default: false },
          { id: '5', stage_key: 'running', display_name: 'Running', emoji: '🚀', color: '#10b981', order_position: 5, is_system_default: false }
        ]);
      }
    } finally {
      setLoadingStages(false);
    }
  };

  // Load custom stages when component mounts or on tab change
  useEffect(() => {
    loadCustomStages();
  }, []);

  const addCustomStage = async () => {
    if (!newStageName.trim()) return;

    try {
      setSavingStages(true);
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const db = createClient(supabaseUrl, supabaseKey);

      const stageKey = newStageName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const maxOrder = Math.max(...customStages.map(s => s.order_position || 0), 0);

      const { data, error } = await db
        .from('custom_stages')
        .insert({
          stage_key: stageKey,
          display_name: newStageName,
          emoji: newStageEmoji,
          color: '#3b82f6',
          order_position: maxOrder + 1,
          is_system_default: false
        })
        .select()
        .single();

      if (error) throw error;

      setCustomStages([...customStages, data]);
      setNewStageName('');
      localStorage.setItem('custom_stages', JSON.stringify([...customStages, data]));
    } catch (err) {
      console.error('Error adding custom stage:', err);
      alert('Failed to add stage: ' + err.message);
    } finally {
      setSavingStages(false);
    }
  };

  const deleteCustomStage = async (stageId) => {
    const stage = customStages.find(s => s.id === stageId);
    if (!stage) return;

    if (stage.is_system_default) {
      alert(`Cannot delete the default "${stage.display_name}" stage. You can rename it instead.`);
      return;
    }

    if (!confirm(`Are you sure you want to delete "${stage.display_name}"? Clients in this stage will need to be reassigned.`)) {
      return;
    }

    try {
      setSavingStages(true);
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const db = createClient(supabaseUrl, supabaseKey);

      const { error } = await db
        .from('custom_stages')
        .delete()
        .eq('id', stageId);

      if (error) throw error;

      setCustomStages(customStages.filter(s => s.id !== stageId));
      localStorage.setItem('custom_stages', JSON.stringify(customStages.filter(s => s.id !== stageId)));
    } catch (err) {
      console.error('Error deleting custom stage:', err);
      alert('Failed to delete stage: ' + err.message);
    } finally {
      setSavingStages(false);
    }
  };

  const updateCustomStage = async (stageId, updates) => {
    const stage = customStages.find(s => s.id === stageId);
    if (!stage) {
      alert('Stage not found');
      return;
    }

    // Validate that we have updates to apply
    if (!updates || !updates.display_name) {
      alert('Error: Stage name is required');
      return;
    }

    console.log('Updating stage:', { stageId, updates, originalStage: stage });

    // Create updated stage object
    const updatedStage = {
      ...stage,
      display_name: updates.display_name,
      emoji: updates.emoji !== undefined ? updates.emoji : stage.emoji,
      color: updates.color !== undefined ? updates.color : stage.color,
      updated_at: new Date().toISOString()
    };

    // Check if we're in offline mode (using String IDs like '1', '2', etc.)
    const isOfflineMode = typeof stageId === 'string' && !stageId.includes('-');

    // Update local state immediately
    const updatedStages = customStages.map(s => s.id === stageId ? updatedStage : s);
    setCustomStages(updatedStages);
    localStorage.setItem('custom_stages', JSON.stringify(updatedStages));
    setEditingStage(null);

    // Try to update database if not in offline mode
    if (!isOfflineMode) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
        const db = createClient(supabaseUrl, supabaseKey);

        // Check if custom_stages table exists
        const { error: tableCheckError } = await db
          .from('custom_stages')
          .select('id')
          .limit(1);

        if (tableCheckError) {
          console.log('Database table not available, saving locally only');
          alert('✅ Stage updated locally! Changes will sync to database when available.');
          return;
        }

        const updateData = {
          display_name: updatedStage.display_name,
          updated_at: updatedStage.updated_at
        };

        if (updatedStage.emoji !== stage.emoji) {
          updateData.emoji = updatedStage.emoji;
        }

        if (updatedStage.color !== stage.color) {
          updateData.color = updatedStage.color;
        }

        console.log('Sending update to database:', updateData);

        const { data, error } = await db
          .from('custom_stages')
          .update(updateData)
          .eq('id', stageId)
          .select()
          .single();

        if (error) {
          console.error('Supabase update error:', error);
          throw error;
        }

        console.log('Database update successful:', data);

        // Update again with the database response
        const finalStages = customStages.map(s => s.id === stageId ? data : s);
        setCustomStages(finalStages);
        localStorage.setItem('custom_stages', JSON.stringify(finalStages));
      } catch (err) {
        console.error('Error updating custom stage in database:', err);
        // Don't show error since we already saved locally
        localStorage.setItem('custom_stages', JSON.stringify(updatedStages));
      }
    } else {
      console.log('Offline mode: saved to localStorage only');
      alert('✅ Stage updated! (Saved locally)');
    }
  };

  const saveAllStages = async () => {
    try {
      setSavingStages(true);
      // Stages are saved individually via the add/update/delete functions
      // This triggeres a reload of the page to apply changes
      localStorage.setItem('custom_stages', JSON.stringify(customStages));
      setMessage({ type: 'success', text: 'Stages saved successfully!' });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error('Error saving stages:', err);
      setMessage({ type: 'error', text: 'Failed to save stages' });
    } finally {
      setSavingStages(false);
    }
  };

  // ==========================================
  // INVITE CODES FUNCTIONS
  // ==========================================
  const generateInviteCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const loadInviteCodes = async () => {
    try {
      setLoadingInviteCodes(true);
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const db = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await db
        .from('invite_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInviteCodes(data || []);
    } catch (err) {
      console.error('Error loading invite codes:', err);
    } finally {
      setLoadingInviteCodes(false);
    }
  };

  const handleGenerateInviteCode = async () => {
    try {
      setGeneratingCode(true);
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const db = createClient(supabaseUrl, supabaseKey);

      // Get current user's team_id
      const { data: { user } } = await db.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await db
        .from('users')
        .select('team_id')
        .eq('id', user.id)
        .single();

      if (!profile?.team_id) throw new Error('No team found. Please ensure you are assigned to a team.');

      const code = generateInviteCode();
      const { data, error } = await db
        .from('invite_codes')
        .insert({
          code,
          team_id: profile.team_id,
          created_by: user.id,
          max_uses: 10,
          uses: 0,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      setInviteCodes(prev => [data, ...prev]);

      // Auto-copy
      try {
        await navigator.clipboard.writeText(code);
        setCopiedCodeId(data.id);
        setTimeout(() => setCopiedCodeId(null), 2000);
      } catch { /* clipboard may not be available */ }
    } catch (err) {
      console.error('Error generating invite code:', err);
      alert('Failed to generate code: ' + err.message);
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleCopyCode = async (code, id) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(id);
      setTimeout(() => setCopiedCodeId(null), 2000);
    } catch {
      alert('Code: ' + code);
    }
  };

  const handleDeactivateCode = async (codeId) => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const db = createClient(supabaseUrl, supabaseKey);

      await db
        .from('invite_codes')
        .update({ is_active: false })
        .eq('id', codeId);

      setInviteCodes(prev => prev.map(c => c.id === codeId ? { ...c, is_active: false } : c));
    } catch (err) {
      console.error('Error deactivating code:', err);
    }
  };

  // Load invite codes when tab is opened
  useEffect(() => {
    if (activeMainTab === 'invitecodes') {
      loadInviteCodes();
    }
  }, [activeMainTab]);

  // Load custom stages on mount
  useEffect(() => {
    loadCustomStages();
  }, []);

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

            <button
              type="button"
              onClick={() => setActiveMainTab('stages')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: 'transparent',
                borderBottom: activeMainTab === 'stages' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeMainTab === 'stages' ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeMainTab === 'stages' ? '600' : '400'
              }}
            >
              📊 Stages Management
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('invitecodes')}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                background: 'transparent',
                borderBottom: activeMainTab === 'invitecodes' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeMainTab === 'invitecodes' ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeMainTab === 'invitecodes' ? '600' : '400'
              }}
            >
              🔑 Invite Codes
            </button>
          </div>








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
                  {isLoadingPages ? (
                    <div style={{ padding: '2rem' }}>Loading connection status...</div>
                  ) : connectedPages.length > 0 ? (
                    <div>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                      <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                        Connected to {connectedPages[0].page_name}
                      </h3>
                      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                        Page ID: {connectedPages[0].page_id}
                      </p>
                      <button
                        className="btn btn-danger"
                        onClick={async () => {
                          if (confirm('Are you sure you want to disconnect this page?')) {
                            try {
                              await facebookService.disconnectPage(connectedPages[0].page_id);
                              setConnectedPages([]);
                              localStorage.removeItem('connected_facebook_pages');
                              localStorage.removeItem('selectedPageId');
                              alert('Page disconnected successfully');
                            } catch (err) {
                              alert('Failed to disconnect page');
                              console.error(err);
                            }
                          }
                        }}
                      >
                        Disconnect Page
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📘</div>
                      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                        To connect your Facebook Page, you'll need to set up a Facebook App in the Meta Developer Console.
                      </p>
                      <button
                        className="btn btn-primary"
                        style={{ marginRight: '0.5rem' }}
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
                  )}
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

              {/* ============================================ */}
              {/* 🧪 SEQUENCE A/B TESTING                    */}
              {/* ============================================ */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🧪 Follow-up Sequences & A/B Testing</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Create multiple follow-up sequences. Each sequence is an ordered chain of prompts (Step 1 → Step 2 → Step 3...). The AI tests different sequences and automatically shifts traffic to the one that converts best.
                </p>

                <div style={{ padding: '0.75rem 1rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
                    🎰 <strong>Thompson Sampling:</strong> The system tests different sequences, learning which ordered combination of prompts gets the most replies. Higher-performing sequences get more traffic automatically.
                  </span>
                </div>

                {/* Sequences List */}
                {loadingSequences ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading sequences...</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                    {sequences.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                        No sequences yet. Click "Add Sequence" below to create your first follow-up chain!
                      </div>
                    )}
                    {sequences.map((seq, seqIdx) => {
                      const steps = messagePrompts
                        .filter(p => p.sequence_id === seq.id)
                        .sort((a, b) => a.sequence_position - b.sequence_position);
                      const perf = sequencePerformance.find(p => p.sequence_id === seq.id);
                      const isChampion = sequencePerformance.length > 0 && sequencePerformance[0]?.sequence_id === seq.id && (perf?.total_sent || 0) >= 5;
                      const isExpanded = expandedSequenceId === seq.id;

                      return (
                        <div
                          key={seq.id}
                          style={{
                            background: seq.is_active ? 'var(--bg-tertiary)' : 'rgba(100,100,100,0.1)',
                            borderRadius: 'var(--radius-lg)',
                            border: isChampion ? '2px solid #22c55e' : '1px solid var(--border-color)',
                            opacity: seq.is_active ? 1 : 0.6,
                            overflow: 'hidden',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {/* Sequence Header */}
                          <div
                            onClick={() => setExpandedSequenceId(isExpanded ? null : seq.id)}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '0.75rem 1rem', cursor: 'pointer',
                              borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                              <span style={{ fontSize: '1.1rem' }}>{isExpanded ? '▼' : '▶'}</span>
                              <input
                                type="text"
                                value={seq.label}
                                onChange={(e) => updateSequenceLabel(seq.id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  background: 'transparent', border: 'none', outline: 'none',
                                  fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)',
                                  width: '200px'
                                }}
                              />
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {steps.length} step{steps.length !== 1 ? 's' : ''}
                              </span>
                              {isChampion && (
                                <span style={{
                                  fontSize: '0.7rem', padding: '2px 8px',
                                  background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e',
                                  borderRadius: '12px', fontWeight: '600'
                                }}>🏆 Champion</span>
                              )}
                              {!seq.is_active && (
                                <span style={{
                                  fontSize: '0.7rem', padding: '2px 8px',
                                  background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444',
                                  borderRadius: '12px'
                                }}>Paused</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => toggleSequenceActive(seq.id, seq.is_active)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '2px' }}
                                title={seq.is_active ? 'Pause sequence' : 'Activate sequence'}
                              >
                                {seq.is_active ? '⏸️' : '▶️'}
                              </button>
                              <button
                                onClick={() => removeSequence(seq.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '2px', color: '#ef4444' }}
                                title="Delete sequence"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          {/* Expanded: Steps + Performance */}
                          {isExpanded && (
                            <div style={{ padding: '1rem' }}>
                              {/* Performance bar */}
                              {perf && (perf.total_sent || 0) > 0 && (
                                <div style={{
                                  display: 'flex', gap: '1rem', padding: '0.5rem 0.75rem',
                                  background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)',
                                  fontSize: '0.75rem', color: 'var(--text-secondary)', flexWrap: 'wrap',
                                  marginBottom: '1rem'
                                }}>
                                  <span>📤 <strong>{perf.total_sent}</strong> sent</span>
                                  <span>💬 <strong>{perf.total_replies}</strong> replies</span>
                                  <span>📊 <strong>{perf.reply_rate}%</strong> reply rate</span>
                                  <span>⚡ Avg: <strong>{Number(perf.avg_conversion_score).toFixed(1)}</strong></span>
                                  <span style={{
                                    color: perf.confidence === 'high' ? '#22c55e' :
                                      perf.confidence === 'medium' ? '#f59e0b' :
                                        perf.confidence === 'low' ? '#ef4444' : '#6b7280'
                                  }}>
                                    🎯 {perf.confidence}
                                  </span>
                                </div>
                              )}

                              {/* Steps list */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                {steps.map((step, stepIdx) => (
                                  <div key={step.id} style={{
                                    display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
                                    padding: '0.5rem', background: 'rgba(0,0,0,0.08)', borderRadius: 'var(--radius-md)'
                                  }}>
                                    <div style={{
                                      minWidth: '28px', height: '28px', borderRadius: '50%',
                                      background: 'var(--primary)', color: 'white',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: '0.75rem', fontWeight: '700', marginTop: '4px'
                                    }}>
                                      {step.sequence_position}
                                    </div>
                                    <textarea
                                      className="form-input"
                                      rows={2}
                                      placeholder={`e.g. ${stepIdx === 0 ? 'Check in warmly, reference the conversation' : stepIdx === 1 ? 'Offer specific value or answer questions' : 'Create gentle urgency or provide social proof'}`}
                                      defaultValue={step.prompt_text}
                                      onBlur={(e) => {
                                        if (e.target.value !== step.prompt_text) {
                                          updateStepPrompt(step.id, e.target.value);
                                        }
                                      }}
                                      style={{ flex: 1, resize: 'vertical', fontSize: '0.85rem' }}
                                    />
                                    {steps.length > 1 && (
                                      <button
                                        onClick={() => removeStep(step.id, seq.id)}
                                        style={{
                                          background: 'none', border: 'none', cursor: 'pointer',
                                          fontSize: '0.9rem', padding: '4px', color: '#ef4444', marginTop: '4px'
                                        }}
                                        title="Remove step"
                                      >✕</button>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {/* Add step button */}
                              <button
                                onClick={() => addStepToSequence(seq.id)}
                                style={{
                                  width: '100%', padding: '8px', background: 'transparent',
                                  border: '1px dashed rgba(99, 102, 241, 0.4)', borderRadius: 'var(--radius-md)',
                                  color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem',
                                  fontWeight: '500', transition: 'all 0.15s ease'
                                }}
                                onMouseOver={(e) => e.target.style.background = 'rgba(99, 102, 241, 0.1)'}
                                onMouseOut={(e) => e.target.style.background = 'transparent'}
                              >
                                + Add Step {steps.length + 1}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add New Sequence Button */}
                <button
                  onClick={addSequence}
                  disabled={savingSequence}
                  style={{
                    width: '100%', padding: '12px',
                    background: 'var(--bg-secondary)',
                    border: '2px dashed rgba(99, 102, 241, 0.3)', borderRadius: 'var(--radius-lg)',
                    color: 'var(--primary)', cursor: 'pointer', fontSize: '0.9rem',
                    fontWeight: '600', transition: 'all 0.2s ease',
                    opacity: savingSequence ? 0.6 : 1
                  }}
                  onMouseOver={(e) => e.target.style.borderColor = 'var(--primary)'}
                  onMouseOut={(e) => e.target.style.borderColor = 'rgba(99, 102, 241, 0.3)'}
                >
                  {savingSequence ? 'Creating...' : '➕ Add New Sequence'}
                </button>

                {/* How it works */}
                <div style={{
                  marginTop: '1rem', padding: '0.75rem 1rem',
                  background: 'rgba(34, 197, 94, 0.08)', borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(34, 197, 94, 0.2)'
                }}>
                  <div style={{ fontWeight: '600', fontSize: '0.8rem', color: '#22c55e', marginBottom: '0.25rem' }}>📊 How It Works</div>
                  <ul style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: '1.25rem' }}>
                    <li>Each contact is assigned to one sequence</li>
                    <li>Steps fire in order (Step 1 first, then Step 2, etc.) at the follow-up intervals you set</li>
                    <li>The system tests all active sequences and shifts traffic to the one with the highest reply rate</li>
                    <li>Scoring: +30 reply, +20 fast reply (&lt;1h), +10 medium (&lt;6h)</li>
                  </ul>
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

          {activeMainTab === 'invitecodes' && (
            <div>
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>🔑 Invite Codes</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Generate invite codes to share with team members. They'll use the code during signup to join your team.
                </p>

                <button
                  onClick={handleGenerateInviteCode}
                  disabled={generatingCode}
                  className="btn btn-primary"
                  style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {generatingCode ? '⏳ Generating...' : '➕ Generate New Code'}
                </button>

                {loadingInviteCodes ? (
                  <p style={{ color: 'var(--text-muted)' }}>Loading codes...</p>
                ) : inviteCodes.length === 0 ? (
                  <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)'
                  }}>
                    No invite codes yet. Generate one to invite team members.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {inviteCodes.map(ic => (
                      <div key={ic.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1rem 1.25rem',
                        background: ic.is_active ? 'var(--bg-tertiary)' : 'rgba(127,127,127,0.1)',
                        borderRadius: 'var(--radius-lg)',
                        border: `1px solid ${ic.is_active ? 'var(--border-color)' : 'rgba(127,127,127,0.2)'}`,
                        opacity: ic.is_active ? 1 : 0.6
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <span style={{
                            fontFamily: 'monospace',
                            fontSize: '1.1rem',
                            fontWeight: '700',
                            letterSpacing: '0.15em',
                            color: ic.is_active ? 'var(--primary)' : 'var(--text-muted)',
                            background: ic.is_active ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '6px'
                          }}>
                            {ic.code}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {ic.uses}/{ic.max_uses} uses
                          </span>
                          {!ic.is_active && (
                            <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: '600' }}>INACTIVE</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {ic.is_active && (
                            <>
                              <button
                                onClick={() => handleCopyCode(ic.code, ic.id)}
                                className="btn btn-secondary"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                              >
                                {copiedCodeId === ic.id ? '✅ Copied!' : '📋 Copy'}
                              </button>
                              <button
                                onClick={() => handleDeactivateCode(ic.id)}
                                className="btn btn-secondary"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', color: '#ef4444' }}
                              >
                                🚫 Deactivate
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeMainTab === 'stages' && (
            <div>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>📊 Stages Management</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Customize the stages in your sales pipeline. The first stage (default) cannot be deleted but can be renamed.
              </p>

              {/* Database Migration Notice */}
              {customStages.length > 0 && typeof customStages[0].id === 'string' && !customStages[0].id.includes('-') && (
                <div style={{
                  padding: '1rem',
                  marginBottom: '1.5rem',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid rgba(245, 158, 11, 0.3)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ fontSize: '1.25rem' }}>⚠️</div>
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: 'var(--warning)' }}>
                        Database Setup Recommended
                      </div>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
                        You can still add, edit, and rename stages, and changes are saved locally. For full database persistence, run the migration script in Supabase SQL Editor. See <code>database/stages_management.sql</code> or <code>STAGES_MANAGEMENT.md</code> for instructions.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Evaluated Stage Configuration */}
              <div style={{
                marginBottom: '1.5rem',
                padding: '1.5rem',
                background: 'rgba(34, 197, 94, 0.1)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(34, 197, 94, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>✅</span>
                    <div>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                        Evaluated Stage
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Configure evaluation questions and threshold for auto-stage transition
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('open-evaluation-questions'));
                    }}
                  >
                    📝 Manage Questions
                  </button>
                </div>

                {/* Auto-move Threshold Slider */}
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(34, 197, 94, 0.2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <label style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                      Minimum Score to Auto-Move to Evaluated Stage
                    </label>
                    <span style={{
                      fontWeight: '700',
                      fontSize: '1.25rem',
                      color: evaluationThreshold >= 70 ? '#22c55e' : evaluationThreshold >= 40 ? '#f59e0b' : '#ef4444'
                    }}>
                      {evaluationThreshold}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={evaluationThreshold}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      setEvaluationThreshold(value);
                      localStorage.setItem('evaluation_threshold', value);
                    }}
                    style={{
                      width: '100%',
                      height: '8px',
                      borderRadius: '4px',
                      background: `linear-gradient(to right, #ef4444 0%, #f59e0b 40%, #22c55e 70%, #22c55e 100%)`,
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    When a client's evaluation score meets or exceeds this threshold, they automatically move to the Evaluated stage.
                  </div>
                </div>
              </div>


              {/* Add New Stage */}
              <div style={{
                marginBottom: '1.5rem',
                padding: '1.5rem',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)'
              }}>
                <h5 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Add New Stage</h5>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Stage name (e.g., 'Negotiation')"
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    style={{
                      padding: '0.75rem',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      flex: 1,
                      minWidth: '200px'
                    }}
                  />
                  <select
                    value={newStageEmoji}
                    onChange={(e) => setNewStageEmoji(e.target.value)}
                    style={{
                      padding: '0.75rem',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <option value="📌">📌 Pin</option>
                    <option value="📋">📋 Clipboard</option>
                    <option value="📝">📝 Note</option>
                    <option value="✅">✅ Check</option>
                    <option value="⭐">⭐ Star</option>
                    <option value="🎯">🎯 Target</option>
                    <option value="💼">💼 Briefcase</option>
                    <option value="🤝">🤝 Handshake</option>
                    <option value="💰">💰 Money</option>
                    <option value="⚡">⚡ Lightning</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={addCustomStage}
                    disabled={savingStages || !newStageName.trim()}
                  >
                    {savingStages ? 'Adding...' : 'Add Stage'}
                  </button>
                </div>
              </div>

              {/* Stages List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {loadingStages ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading stages...
                  </div>
                ) : customStages.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No stages configured. Add your first stage above.
                  </div>
                ) : (
                  customStages.map((stage, index) => (
                    <div
                      key={stage.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1rem 1.25rem',
                        background: index === 0 ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid',
                        borderColor: index === 0 ? 'rgba(59, 130, 246, 0.5)' : 'var(--border-color)',
                        position: 'relative'
                      }}
                    >
                      {/* Drag handle visual */}
                      <div style={{
                        fontSize: '1.5rem',
                        width: '40px',
                        textAlign: 'center',
                        cursor: 'grab',
                        color: 'var(--text-muted)',
                        userSelect: 'none'
                      }}>
                        ☰
                      </div>

                      {/* Stage Order Badge */}
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        background: stage.color,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '600',
                        fontSize: '0.875rem',
                        flexShrink: 0
                      }}>
                        {stage.order_position}
                      </div>

                      {/* Stage Emoji */}
                      <div style={{
                        fontSize: '1.75rem',
                        width: '40px',
                        textAlign: 'center'
                      }}>
                        {editingStage?.id === stage.id ? (
                          <input
                            type="text"
                            value={editingStage.emoji || stage.emoji}
                            onChange={(e) => setEditingStage({ ...editingStage, emoji: e.target.value })}
                            style={{
                              width: '50px',
                              padding: '0.25rem',
                              fontSize: '1.25rem',
                              textAlign: 'center',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              background: 'var(--bg-primary)'
                            }}
                          />
                        ) : (
                          stage.emoji
                        )}
                      </div>

                      {/* Stage Name */}
                      {editingStage?.id === stage.id ? (
                        <input
                          type="text"
                          value={editingStage.display_name || stage.display_name}
                          onChange={(e) => setEditingStage({ ...editingStage, display_name: e.target.value })}
                          style={{
                            flex: 1,
                            padding: '0.5rem 0.75rem',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: '1rem',
                            fontWeight: '500'
                          }}
                        />
                      ) : (
                        <div style={{
                          flex: 1,
                          fontSize: '1rem',
                          fontWeight: '500',
                          color: 'var(--text-primary)'
                        }}>
                          {stage.display_name}
                          {index === 0 && (
                            <span style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              background: 'rgba(59, 130, 246, 0.2)',
                              color: 'var(--primary)',
                              borderRadius: '4px',
                              fontWeight: '600'
                            }}>
                              DEFAULT
                            </span>
                          )}
                        </div>
                      )}

                      {/* Stage Key Display */}
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        fontFamily: 'monospace',
                        padding: '0.25rem 0.5rem',
                        background: 'var(--bg-primary)',
                        borderRadius: '4px'
                      }}>
                        {stage.stage_key}
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {editingStage?.id === stage.id ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-success"
                              onClick={() => updateCustomStage(stage.id, editingStage)}
                              style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                            >
                              ✅
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setEditingStage(null)}
                              style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setEditingStage({ ...stage })}
                              title="Edit stage"
                              style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                            >
                              ✏️
                            </button>
                            {!stage.is_system_default && (
                              <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => deleteCustomStage(stage.id)}
                                title="Delete stage"
                                disabled={savingStages}
                                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                              >
                                🗑️
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Save and Reload Notice */}
              <div style={{
                marginTop: '2rem',
                padding: '1rem',
                background: 'rgba(245, 158, 11, 0.1)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(245, 158, 11, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ fontSize: '1.25rem' }}>💡</div>
                  <div>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: 'var(--warning)' }}>
                      Stage changes take effect after reload
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
                      After adding, editing, or deleting stages, click "Save Settings" below to apply changes.
                      The page will automatically reload to update all views.
                    </p>
                  </div>
                </div>
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

