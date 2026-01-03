import { useState, useEffect } from 'react';
import { initSupabase, getSupabaseClient } from '../services/supabase';

export const useSupabase = () => {
  const [isOnlineMode, setIsOnlineMode] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);

  const init = () => {
    return initSupabase();
  };

  const getSession = async () => {
    const client = getSupabaseClient();
    if (!client) return null;

    const { data: { session } } = await client.auth.getSession();
    if (session) {
      setCurrentUser(session.user);
      await loadUserProfile(session.user.id);
      setIsOnlineMode(true);
    }
    return session;
  };

  const refreshUserProfile = async () => {
    if (currentUser) {
      await loadUserProfile(currentUser.id);
    }
  };

  const loadUserProfile = async (userId) => {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      // First try to load existing profile
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle(); // Use maybeSingle instead of single to handle 0 rows gracefully

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "0 rows" which we'll handle by creating the profile
        console.error('Error loading user profile:', error);
      }

      // If profile doesn't exist, create it
      if (!data || error?.code === 'PGRST116') {
        console.log('User profile not found, attempting to create new profile...');
        const { data: { user: authUser } } = await client.auth.getUser();

        if (authUser) {
          // Try to create the profile
          const { data: newProfile, error: createError } = await client
            .from('users')
            .insert({
              id: userId,
              email: authUser.email || '',
              name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
              role: 'user' // Default role, can be updated to admin later
            })
            .select()
            .single();

          if (createError) {
            console.error('Error creating user profile:', createError);
            // If insert fails due to RLS, the profile might be created by trigger
            // Wait a bit and try loading again
            await new Promise(resolve => setTimeout(resolve, 1000));
            const { data: retryData } = await client
              .from('users')
              .select('*')
              .eq('id', userId)
              .maybeSingle();

            if (retryData) {
              setCurrentUserProfile(retryData);
              return retryData;
            }
            console.warn('Could not create user profile automatically. Please run the SQL script to create it manually.');
            return null;
          }

          if (newProfile) {
            setCurrentUserProfile(newProfile);
            return newProfile;
          }
        }
        return null;
      }

      // Profile exists, use it
      if (data) {
        setCurrentUserProfile(data);
      }
      return data;
    } catch (err) {
      console.error('Exception loading user profile:', err);
      return null;
    }
  };

  const signIn = async (email, password) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase not initialized');

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    setCurrentUser(data.user);
    await loadUserProfile(data.user.id);
    setIsOnlineMode(true);
    return data;
  };

  const signUp = async (email, password, name) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase not initialized');

    // Create auth user
    const { data: authData, error: authError } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0] // Use name from form or email prefix
        }
      }
    });

    if (authError) throw authError;

    // The trigger should automatically create the user profile
    // But we'll wait a moment and then try to load it
    if (authData.user) {
      setCurrentUser(authData.user);
      // Wait a bit for the trigger to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadUserProfile(authData.user.id);
      setIsOnlineMode(true);
    }

    return authData;
  };

  const signOut = async () => {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut();
      setCurrentUser(null);
      setCurrentUserProfile(null);
      setIsOnlineMode(false);
    }
  };

  const isAdmin = () => {
    return currentUserProfile?.role === 'admin';
  };

  const getUserName = () => {
    return currentUserProfile?.name || currentUser?.email || 'User';
  };

  const getSetting = async (key) => {
    const client = getSupabaseClient();
    if (!client) return null;

    const { data, error } = await client
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error) return null;
    return data?.value;
  };

  const saveSetting = async (key, value) => {
    const client = getSupabaseClient();
    if (!client) return false;

    const { error } = await client
      .from('settings')
      .upsert({
        key,
        value,
        updated_by: currentUser?.id
      });

    return !error;
  };

  const getExpenses = async () => {
    const expenses = await getSetting('package_expenses');
    if (expenses) {
      // Also save to localStorage for offline access
      localStorage.setItem('campy_expenses', JSON.stringify(expenses));
      return expenses;
    }
    // Fallback to localStorage
    return JSON.parse(localStorage.getItem('campy_expenses') || '{"basic": 500, "star": 800, "fire": 1000, "crown": 1500, "custom": 0}');
  };

  const saveExpenses = async (expenses) => {
    // Save to localStorage immediately
    localStorage.setItem('campy_expenses', JSON.stringify(expenses));
    // Save to Supabase if online
    if (isOnlineMode) {
      await saveSetting('package_expenses', expenses);
    }
  };

  const getAIPrompts = async () => {
    const prompts = await getSetting('ai_prompts');
    if (prompts) {
      // Also save to localStorage for offline access
      localStorage.setItem('campy_ai_prompts', JSON.stringify(prompts));
      return prompts;
    }
    // Fallback to localStorage
    return JSON.parse(localStorage.getItem('campy_ai_prompts') || '{"adType": "Analyze the business niche \'{niche}\' and target audience \'{audience}\'. Suggest the top 3 most effective Facebook ad formats.", "campaignStructure": "For a local service business in niche \'{niche}\' with a budget of ₱150-300/day, outline a recommended campaign structure."}');
  };

  const saveAIPrompts = async (prompts) => {
    // Save to localStorage immediately
    localStorage.setItem('campy_ai_prompts', JSON.stringify(prompts));
    // Save to Supabase if online
    if (isOnlineMode) {
      await saveSetting('ai_prompts', prompts);
    }
  };

  const getPackagePrices = async () => {
    const prices = await getSetting('package_prices');
    if (prices) {
      // Also save to localStorage for offline access
      localStorage.setItem('campy_package_prices', JSON.stringify(prices));
      return prices;
    }
    // Fallback to localStorage or default values
    const stored = localStorage.getItem('campy_package_prices');
    if (stored) {
      return JSON.parse(stored);
    }
    // Default package prices
    return { basic: 1799, star: 2999, fire: 3499, crown: 5799, custom: 0 };
  };

  const savePackagePrices = async (prices) => {
    // Save to localStorage immediately
    localStorage.setItem('campy_package_prices', JSON.stringify(prices));
    // Save to Supabase if online
    if (isOnlineMode) {
      await saveSetting('package_prices', prices);
    }
  };

  const getPackageDetails = async () => {
    const details = await getSetting('package_details');
    if (details) {
      // Also save to localStorage for offline access
      localStorage.setItem('campy_package_details', JSON.stringify(details));
      return details;
    }
    // Fallback to localStorage or default values
    const stored = localStorage.getItem('campy_package_details');
    if (stored) {
      return JSON.parse(stored);
    }
    // Default package details
    return {
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
    };
  };

  const savePackageDetails = async (details) => {
    // Save to localStorage immediately
    localStorage.setItem('campy_package_details', JSON.stringify(details));
    // Save to Supabase if online
    if (isOnlineMode) {
      await saveSetting('package_details', details);
    }
  };

  const getAllUsers = async () => {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from('users')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error loading users:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception loading users:', err);
      return [];
    }
  };

  // Map DB snake_case to JS camelCase (same as vanilla JS version)
  const mapClientFromDb = (row) => {
    return {
      id: row.id,
      clientName: row.client_name,
      businessName: row.business_name,
      contactDetails: row.contact_details,
      pageLink: row.page_link,
      notes: row.notes,
      notesMedia: row.notes_media || [],
      tags: row.tags || [],
      package: row.package,
      customPackage: row.custom_package,
      paymentStatus: row.payment_status,
      paymentSchedule: row.payment_schedule,
      monthsWithClient: row.months_with_client,
      startDate: row.start_date,
      phase: row.phase,
      priority: row.priority,
      autoSwitch: row.auto_switch,
      autoSwitchDays: row.auto_switch_days,
      nextPhaseDate: row.next_phase_date,
      subscriptionUsage: row.subscription_usage,
      testingRound: row.testing_round,
      subscriptionStarted: row.subscription_started,
      subscriptionUsageDetail: row.subscription_usage_detail || {
        videosUsed: 0,
        mainVideosUsed: 0,
        photosUsed: 0,
        meetingMinutesUsed: 0
      },
      resubscriptionCount: row.resubscription_count,
      adsExpense: row.ads_expense,
      assignedTo: row.assigned_to,
      assignedUser: row.assigned_user,
      createdBy: row.created_by,
      createdUser: row.created_user,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  };

  // Map JS camelCase to DB snake_case
  const mapClientToDb = (client) => {
    return {
      client_name: client.clientName,
      business_name: client.businessName,
      contact_details: client.contactDetails,
      page_link: client.pageLink,
      notes: client.notes,
      notes_media: client.notesMedia || [],
      tags: client.tags,
      package: client.package,
      custom_package: client.customPackage,
      payment_status: client.paymentStatus,
      payment_schedule: client.paymentSchedule,
      months_with_client: client.monthsWithClient,
      start_date: client.startDate || null,
      phase: client.phase,
      priority: client.priority,
      auto_switch: client.autoSwitch,
      auto_switch_days: client.autoSwitchDays,
      next_phase_date: client.nextPhaseDate || null,
      subscription_usage: client.subscriptionUsage,
      testing_round: client.testingRound,
      subscription_started: client.subscriptionStarted,
      subscription_usage_detail: client.subscriptionUsageDetail || {
        videosUsed: 0,
        mainVideosUsed: 0,
        photosUsed: 0,
        meetingMinutesUsed: 0
      },
      resubscription_count: client.resubscriptionCount,
      ads_expense: client.adsExpense,
      assigned_to: client.assignedTo || null
    };
  };

  // Add client to Supabase
  const addClientToSupabase = async (clientData) => {
    const client = getSupabaseClient();
    if (!client || !currentUser) return null;

    try {
      const { data, error } = await client
        .from('clients')
        .insert({
          ...mapClientToDb(clientData),
          created_by: currentUser.id
        })
        .select(`
          *,
          assigned_user:assigned_to(id, name, email),
          created_user:created_by(id, name, email)
        `)
        .single();

      if (error) {
        console.error('Error adding client to Supabase:', error);
        throw error;
      }

      // Create stage history
      if (data) {
        await client
          .from('stage_history')
          .insert({
            client_id: data.id,
            from_phase: null,
            to_phase: data.phase,
            changed_by: currentUser.id,
            changed_by_name: getUserName()
          });
      }

      return mapClientFromDb(data);
    } catch (err) {
      console.error('Exception adding client to Supabase:', err);
      throw err;
    }
  };

  // Update client in Supabase
  const updateClientInSupabase = async (id, updates) => {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('clients')
        .update(mapClientToDb(updates))
        .eq('id', id)
        .select(`
          *,
          assigned_user:assigned_to(id, name, email),
          created_user:created_by(id, name, email)
        `)
        .single();

      if (error) {
        console.error('Error updating client in Supabase:', error);
        throw error;
      }

      return data ? mapClientFromDb(data) : null;
    } catch (err) {
      console.error('Exception updating client in Supabase:', err);
      throw err;
    }
  };

  // Delete client from Supabase
  const deleteClientFromSupabase = async (id) => {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const { error } = await client
        .from('clients')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting client from Supabase:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Exception deleting client from Supabase:', err);
      return false;
    }
  };

  // Sync all data from Supabase to localStorage
  const syncAllData = async () => {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      console.log('Syncing data from Supabase...');

      // 1. Sync Clients
      const { data: clients, error: clientsError } = await client
        .from('clients')
        .select(`
          *,
          assigned_user:assigned_to(id, name, email),
          created_user:created_by(id, name, email)
        `)
        .order('priority', { ascending: true });

      if (clientsError) {
        console.error('Error fetching clients:', clientsError);
      } else if (clients) {
        // Convert to local format
        const localClients = clients.map(c => mapClientFromDb(c));
        // Save to localStorage
        localStorage.setItem('campy_clients', JSON.stringify(localClients));
        console.log(`Synced ${localClients.length} clients from Supabase`);
      }

      // 2. Sync Settings (Expenses & Prompts)
      const expenses = await getExpenses();
      const prompts = await getAIPrompts();

      // 3. Sync History
      const { data: history, error: historyError } = await client
        .from('stage_history')
        .select('*')
        .order('timestamp', { ascending: false });

      if (!historyError && history) {
        const localHistory = history.map(h => ({
          id: h.id,
          clientId: h.client_id,
          fromPhase: h.from_phase,
          toPhase: h.to_phase,
          changedBy: h.changed_by_name || 'System',
          timestamp: h.timestamp
        }));
        localStorage.setItem('campy_history', JSON.stringify(localHistory));
      }

      console.log('Sync complete');

      // Trigger a custom event so useStorage can reload (storage event only fires for other tabs)
      window.dispatchEvent(new Event('syncComplete'));
    } catch (err) {
      console.error('Sync failed:', err);
    }
  };

  return {
    isOnlineMode,
    currentUser,
    currentUserProfile,
    initSupabase: init,
    getSession,
    signIn,
    signUp,
    signOut,
    isAdmin,
    getUserName,
    getExpenses,
    saveExpenses,
    getAIPrompts,
    saveAIPrompts,
    getPackagePrices,
    savePackagePrices,
    getPackageDetails,
    savePackageDetails,
    refreshUserProfile,
    getAllUsers,
    syncAllData,
    addClientToSupabase,
    updateClientInSupabase,
    deleteClientFromSupabase
  };
};

