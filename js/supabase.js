/* ============================================
   Supabase Module - Database & Auth Client
   ============================================ */

const Supabase = {
    client: null,
    currentUser: null,
    currentUserProfile: null,

    // Initialize Supabase client
    init() {
        // Get credentials from config or use defaults for local dev
        const url = window.SUPABASE_URL || 'https://bbthbdnfskatvvwxprze.supabase.co';
        const key = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJidGhiZG5mc2thdHZ2d3hwcnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MTkzNjksImV4cCI6MjA4Mjk5NTM2OX0.NXU7NV9qwzGTL_7g9WE3oeaJZ1ooPM9nTXoKfhiqfFM';

        if (typeof supabase !== 'undefined') {
            this.client = supabase.createClient(url, key);
            console.log('Supabase initialized');
            return true;
        } else {
            console.warn('Supabase library not loaded, using localStorage fallback');
            return false;
        }
    },

    // Check if Supabase is available
    isAvailable() {
        return this.client !== null;
    },

    // ============================================
    // SYNC - Load Remote Data to LocalStorage
    // ============================================

    async syncAllData() {
        if (!this.client) return;

        try {
            console.log('Syncing data from Supabase...');
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/ba30085e-3ebc-4936-81b7-428dd068dfa1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabase.js:35',message:'syncAllData entry',data:{hasClient:!!this.client},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion

            // 1. Sync Clients
            const clients = await this.getClients();
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/ba30085e-3ebc-4936-81b7-428dd068dfa1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabase.js:42',message:'after getClients',data:{clientCount:clients.length,firstClientId:clients[0]?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            // Convert to local format
            const localClients = clients.map(c => this.mapClientFromDb(c));
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/ba30085e-3ebc-4936-81b7-428dd068dfa1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabase.js:45',message:'after mapClientFromDb',data:{mappedCount:localClients.length,firstMappedId:localClients[0]?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            localStorage.setItem(Storage.KEYS.CLIENTS, JSON.stringify(localClients));

            // 2. Sync Settings (Expenses & Prompts)
            const expenses = await this.getExpenses();
            localStorage.setItem(Storage.KEYS.EXPENSES, JSON.stringify(expenses));

            const prompts = await this.getAIPrompts();
            localStorage.setItem(Storage.KEYS.AI_PROMPTS, JSON.stringify(prompts));

            // 3. Sync History (Optimization: Might be heavy later, but okay for now)
            // Ideally we only sync history for open clients, but our LocalStorage model puts it all in one key?
            // Checking storage.js... yes, KEYS.HISTORY.
            // Let's fetch all history.
            const { data: history } = await this.client.from('stage_history').select('*');
            if (history) {
                // Map snake_case to JS if needed? storage.js uses raw objects?
                // storage.js saveHistory uses: { clientId, fromPhase, toPhase, changedBy, timestamp }
                // DB has: client_id, from_phase, ...
                const localHistory = history.map(h => ({
                    clientId: h.client_id,
                    fromPhase: h.from_phase,
                    toPhase: h.to_phase,
                    changedBy: h.changed_by_name || 'System', // use name instead of ID for local display
                    timestamp: h.timestamp
                }));
                localStorage.setItem(Storage.KEYS.HISTORY, JSON.stringify(localHistory));
            }

            console.log('Sync complete');
        } catch (err) {
            console.error('Sync failed:', err);
        }
    },

    // ============================================
    // AUTHENTICATION
    // ============================================

    // Sign in with email and password
    async signIn(email, password) {
        if (!this.client) throw new Error('Supabase not initialized');

        const { data, error } = await this.client.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        this.currentUser = data.user;
        await this.loadUserProfile();
        return data;
    },

    // Sign up new user (admin only feature)
    async signUp(email, password, name, role = 'user') {
        if (!this.client) throw new Error('Supabase not initialized');

        // First create auth user
        const { data: authData, error: authError } = await this.client.auth.signUp({
            email,
            password
        });

        if (authError) throw authError;

        // Then create user profile
        const { data: profileData, error: profileError } = await this.client
            .from('users')
            .insert({
                id: authData.user.id,
                email,
                name,
                role
            })
            .select()
            .single();

        if (profileError) throw profileError;

        return { auth: authData, profile: profileData };
    },

    // Sign out
    async signOut() {
        if (!this.client) return;

        await this.client.auth.signOut();
        this.currentUser = null;
        this.currentUserProfile = null;
    },

    // Get current session
    async getSession() {
        if (!this.client) return null;

        const { data: { session } } = await this.client.auth.getSession();
        if (session) {
            this.currentUser = session.user;
            await this.loadUserProfile();
        }
        return session;
    },

    // Load user profile from users table
    async loadUserProfile() {
        if (!this.client || !this.currentUser) return null;

        const { data, error } = await this.client
            .from('users')
            .select('*')
            .eq('id', this.currentUser.id)
            .single();

        if (!error && data) {
            this.currentUserProfile = data;
        }
        return this.currentUserProfile;
    },

    // Check if current user is admin
    isAdmin() {
        return this.currentUserProfile?.role === 'admin';
    },

    // Get current user's name
    getUserName() {
        return this.currentUserProfile?.name || this.currentUser?.email || 'User';
    },

    // ============================================
    // CLIENTS CRUD
    // ============================================

    async getClients() {
        if (!this.client) return [];

        const { data, error } = await this.client
            .from('clients')
            .select(`
        *,
        assigned_user:assigned_to(id, name, email),
        created_user:created_by(id, name, email)
      `)
            .order('priority', { ascending: true });

        if (error) {
            console.error('Error fetching clients:', error);
            return [];
        }
        return data || [];
    },

    async getClient(id) {
        if (!this.client) return null;

        const { data, error } = await this.client
            .from('clients')
            .select(`
        *,
        assigned_user:assigned_to(id, name, email),
        created_user:created_by(id, name, email)
      `)
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching client:', error);
            return null;
        }
        return data;
    },

    async addClient(clientData) {
        if (!this.client) return null;

        const { data, error } = await this.client
            .from('clients')
            .insert({
                ...this.mapClientToDb(clientData),
                created_by: this.currentUser?.id
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding client:', error);
            throw error;
        }

        // Log initial phase
        await this.addStageHistory(data.id, null, data.phase);

        return data;
    },

    async updateClient(id, updates) {
        if (!this.client) return null;

        const { data, error } = await this.client
            .from('clients')
            .update(this.mapClientToDb(updates))
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating client:', error);
            throw error;
        }
        return data;
    },

    async deleteClient(id) {
        if (!this.client) return false;

        const { error } = await this.client
            .from('clients')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting client:', error);
            return false;
        }
        return true;
    },

    // Map JS camelCase to DB snake_case
    mapClientToDb(client) {
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
    },

    // Map DB snake_case to JS camelCase
    mapClientFromDb(row) {
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
    },

    // ============================================
    // STAGE HISTORY
    // ============================================

    async addStageHistory(clientId, fromPhase, toPhase) {
        if (!this.client) return;

        await this.client
            .from('stage_history')
            .insert({
                client_id: clientId,
                from_phase: fromPhase,
                to_phase: toPhase,
                changed_by: this.currentUser?.id,
                changed_by_name: this.getUserName()
            });
    },

    async getClientHistory(clientId) {
        if (!this.client) return [];

        const { data, error } = await this.client
            .from('stage_history')
            .select('*')
            .eq('client_id', clientId)
            .order('timestamp', { ascending: false });

        if (error) return [];
        return data || [];
    },

    // ============================================
    // SETTINGS
    // ============================================

    async getSetting(key) {
        if (!this.client) return null;

        const { data, error } = await this.client
            .from('settings')
            .select('value')
            .eq('key', key)
            .single();

        if (error) return null;
        return data?.value;
    },

    async saveSetting(key, value) {
        if (!this.client) return false;

        const { error } = await this.client
            .from('settings')
            .upsert({
                key,
                value,
                updated_by: this.currentUser?.id
            });

        return !error;
    },

    async getExpenses() {
        return await this.getSetting('package_expenses') || {
            basic: 500, star: 800, fire: 1000, crown: 1500, custom: 0
        };
    },

    async saveExpenses(expenses) {
        return await this.saveSetting('package_expenses', expenses);
    },

    async getAIPrompts() {
        return await this.getSetting('ai_prompts') || {
            adType: '',
            campaignStructure: ''
        };
    },

    async saveAIPrompts(prompts) {
        return await this.saveSetting('ai_prompts', prompts);
    },

    // ============================================
    // USERS (Admin only)
    // ============================================

    async getUsers() {
        if (!this.client) return [];

        const { data, error } = await this.client
            .from('users')
            .select('*')
            .order('name');

        if (error) return [];
        return data || [];
    },

    async updateUserRole(userId, role) {
        if (!this.client || !this.isAdmin()) return false;

        const { error } = await this.client
            .from('users')
            .update({ role })
            .eq('id', userId);

        return !error;
    }
};
