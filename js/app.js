/* ============================================
   App Module - Main Application Controller
   ============================================ */

const App = {
    currentClientId: null,
    isOnlineMode: false,

    // Initialize the application
    async init() {
        this.initTheme();
        this.bindEvents();

        // Try to initialize Supabase
        const supabaseAvailable = Supabase.init();

        if (supabaseAvailable) {
            // Check for existing session
            const session = await Supabase.getSession();
            if (session) {
                this.isOnlineMode = true;
                await Supabase.syncAllData(); // Sync on init if logged in
                this.initRole();
                this.refreshUI();
                Phases.processAutoSwitches();

                // Subscribe to Realtime Notifications
                this.subscribeToNotifications();

                console.log('Campy initialized (online mode)');
            } else {
                // Show login modal
                this.showLoginModal();
            }
        } else {
            // Fallback to localStorage mode
            this.isOnlineMode = false;
            this.initRole();
            this.refreshUI();
            Phases.processAutoSwitches();
            console.log('Campy initialized (offline mode)');
        }
    },

    // Show login modal
    showLoginModal() {
        document.getElementById('loginModal')?.classList.add('active');
    },

    // Hide login modal
    hideLoginModal() {
        document.getElementById('loginModal')?.classList.remove('active');
    },

    // Handle login
    async handleLogin(email, password) {
        const errorEl = document.getElementById('loginError');
        const btnEl = document.getElementById('loginBtn');

        try {
            errorEl.style.display = 'none';
            btnEl.textContent = 'Signing in...';
            btnEl.disabled = true;

            await Supabase.signIn(email, password);
            this.isOnlineMode = true;
            this.hideLoginModal();

            // Sync data from cloud
            await Supabase.syncAllData();

            this.initRole();
            this.refreshUI();
            Phases.processAutoSwitches();
            this.showToast('Signed in successfully!', 'success');
        } catch (error) {
            errorEl.textContent = error.message || 'Invalid email or password';
            errorEl.style.display = 'block';
        } finally {
            btnEl.textContent = 'Sign In';
            btnEl.disabled = false;
        }
    },

    // Handle logout
    async handleLogout() {
        await Supabase.signOut();
        this.isOnlineMode = false;
        location.reload();
    },

    // Enter offline mode (localStorage only)
    enterOfflineMode() {
        this.isOnlineMode = false;
        this.hideLoginModal();
        this.initRole();
        this.refreshUI();
        Phases.processAutoSwitches();
        this.showToast('Using offline mode (data stored locally)', 'info');
        console.log('Campy initialized (offline mode)');
    },

    // Initialize theme
    initTheme() {
        const settings = Storage.getSettings();
        document.documentElement.dataset.theme = settings.theme || 'dark';
        this.updateThemeIcon();
    },

    // Initialize role
    // Initialize role
    initRole() {
        if (this.isOnlineMode) {
            const isAdmin = Supabase.isAdmin();
            const role = isAdmin ? 'admin' : 'user';

            document.documentElement.dataset.role = role;

            const selector = document.getElementById('roleSelector');
            if (selector) {
                // Hide selector in online mode as role is determined by auth
                selector.style.display = 'none';
                // Or disable it: selector.disabled = true; selector.value = role;
            }

            const userName = document.getElementById('currentUserName');
            if (userName) {
                userName.value = Supabase.getUserName();
                userName.disabled = true; // Can't edit name freely in online mode
            }
        } else {
            // Offline mode (original behavior)
            const role = Storage.getRole();
            document.documentElement.dataset.role = role;
            const selector = document.getElementById('roleSelector');
            if (selector) {
                selector.style.display = 'block';
                selector.disabled = false;
                selector.value = role;
            }

            const userName = document.getElementById('currentUserName');
            if (userName) {
                userName.value = Storage.getCurrentUser();
                userName.disabled = false;
            }
        }
    },

    // Update theme toggle icon
    updateThemeIcon() {
        const btn = document.getElementById('themeToggle');
        const isDark = document.documentElement.dataset.theme === 'dark';
        if (btn) btn.textContent = isDark ? '🌙' : '☀️';
    },

    // Subscribe to Realtime Notifications
    subscribeToNotifications() {
        if (!Supabase.client) return;

        // Listen for INSERT on clients table
        Supabase.client
            .channel('public:clients')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clients' }, payload => {
                const newClient = payload.new;
                if (newClient.phase === 'booked') {
                    // Start sound
                    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                    audio.play().catch(e => console.log('Audio play failed', e));

                    // Show notification
                    this.showToast(`📅 New Meeting Booked: ${newClient.client_name}!`, 'success');

                    // Refresh data if we are online and sync
                    if (this.isOnlineMode) {
                        Supabase.syncAllData().then(() => this.refreshUI());
                    }
                }
            })
            .subscribe();

        console.log('Listening for new bookings...');
    },

    // Bind all event listeners
    bindEvents() {
        // Login form
        document.getElementById('loginForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            this.handleLogin(email, password);
        });

        // Offline mode button
        document.getElementById('offlineModeBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.enterOfflineMode();
        });

        // Theme toggle
        document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());

        // Role selector
        document.getElementById('roleSelector')?.addEventListener('change', (e) => this.switchRole(e.target.value));

        // User name
        document.getElementById('currentUserName')?.addEventListener('change', (e) => {
            Storage.setCurrentUser(e.target.value);
        });

        // Admin settings
        document.getElementById('adminSettingsBtn')?.addEventListener('click', () => this.openAdminSettings());
        document.getElementById('closeAdminSettings')?.addEventListener('click', () => this.closeAdminSettings());
        document.getElementById('cancelAdminSettings')?.addEventListener('click', () => this.closeAdminSettings());
        document.getElementById('saveAdminSettings')?.addEventListener('click', () => this.saveAdminSettings());
        document.getElementById('adminSettingsModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'adminSettingsModal') this.closeAdminSettings();
        });

        // History modal
        document.getElementById('closeHistoryModal')?.addEventListener('click', () => this.closeHistoryModal());
        document.getElementById('closeHistoryBtn')?.addEventListener('click', () => this.closeHistoryModal());
        document.getElementById('historyModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'historyModal') this.closeHistoryModal();
        });

        // Add client button
        document.getElementById('addClientBtn')?.addEventListener('click', () => this.openAddModal());

        // Modal controls
        document.getElementById('closeModal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('cancelBtn')?.addEventListener('click', () => this.closeModal());
        document.getElementById('saveBtn')?.addEventListener('click', () => this.saveClient());
        document.getElementById('deleteBtn')?.addEventListener('click', () => this.deleteClient());

        // View modal controls
        document.getElementById('closeViewModal')?.addEventListener('click', () => this.closeViewModal());
        document.getElementById('closeViewBtn')?.addEventListener('click', () => this.closeViewModal());
        document.getElementById('editFromViewBtn')?.addEventListener('click', () => {
            this.closeViewModal();
            if (this.currentClientId) this.openEditModal(this.currentClientId);
        });

        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(tab.dataset.tab);
            });
        });

        // Package selector
        document.querySelectorAll('.package-option').forEach(opt => {
            opt.addEventListener('click', () => this.selectPackage(opt.dataset.package));
        });

        // Phase change - show/hide testing options
        document.getElementById('currentPhase')?.addEventListener('change', (e) => {
            this.toggleTestingOptions(e.target.value === 'testing');
        });

        // Re-test button
        document.getElementById('reTestBtn')?.addEventListener('click', () => {
            const usage = document.getElementById('subscriptionUsage');
            const round = document.getElementById('testingRound');
            if (usage) usage.value = 0;
            if (round) round.value = parseInt(round.value || 1) + 1;
            this.showToast('New testing round started', 'info');
        });

        // Filters
        ['searchInput', 'filterPhase', 'filterPackage', 'filterPayment'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => this.refreshUI());
            document.getElementById(id)?.addEventListener('change', () => this.refreshUI());
        });

        // Close modals on overlay click
        document.getElementById('clientModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'clientModal') this.closeModal();
        });
        document.getElementById('viewClientModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'viewClientModal') this.closeViewModal();
        });

        // AI Strategy generation
        document.getElementById('generateStrategyBtn')?.addEventListener('click', () => this.generateStrategy());
    },

    // Switch role
    switchRole(role) {
        Storage.setRole(role);
        document.documentElement.dataset.role = role;
        this.refreshUI();
        this.showToast(`Switched to ${role === 'admin' ? 'Admin' : 'User'} mode`, 'info');
    },

    // Open admin settings
    openAdminSettings() {
        const expenses = Storage.getExpenses();
        document.getElementById('expenseBasic').value = expenses.basic || 0;
        document.getElementById('expenseStar').value = expenses.star || 0;
        document.getElementById('expenseFire').value = expenses.fire || 0;
        document.getElementById('expenseCrown').value = expenses.crown || 0;
        document.getElementById('expenseCustom').value = expenses.custom || 0;

        // Load AI prompts
        const prompts = Storage.getAIPrompts();
        document.getElementById('promptAdType').value = prompts.adType || '';
        document.getElementById('promptStructure').value = prompts.campaignStructure || '';

        document.getElementById('adminSettingsModal').classList.add('active');
    },

    // Close admin settings
    closeAdminSettings() {
        document.getElementById('adminSettingsModal').classList.remove('active');
    },

    // Save admin settings
    saveAdminSettings() {
        const expenses = {
            basic: parseInt(document.getElementById('expenseBasic').value) || 0,
            star: parseInt(document.getElementById('expenseStar').value) || 0,
            fire: parseInt(document.getElementById('expenseFire').value) || 0,
            crown: parseInt(document.getElementById('expenseCrown').value) || 0,
            custom: parseInt(document.getElementById('expenseCustom').value) || 0
        };
        Storage.saveExpenses(expenses);

        // Save AI prompts
        const aiPrompts = {
            adType: document.getElementById('promptAdType').value,
            campaignStructure: document.getElementById('promptStructure').value
        };
        Storage.saveAIPrompts(aiPrompts);

        this.closeAdminSettings();
        this.refreshUI();
        this.showToast('Settings saved', 'success');
    },

    // Generate AI Strategy
    async generateStrategy() {
        const niche = document.getElementById('aiNiche')?.value || '';
        const audience = document.getElementById('aiAudience')?.value || '';

        if (!niche || !audience) {
            this.showToast('Please enter business niche and target audience', 'warning');
            return;
        }

        const prompts = Storage.getAIPrompts();
        const adTypePrompt = prompts.adType.replace('{niche}', niche).replace('{audience}', audience);
        const structurePrompt = prompts.campaignStructure.replace('{niche}', niche).replace('{audience}', audience);

        const btn = document.getElementById('generateStrategyBtn');
        btn.disabled = true;
        btn.textContent = '⏳ Generating...';

        try {
            // Simulated AI response (NVIDIA API would require CORS proxy)
            const adTypesResult = await this.simulateAI(adTypePrompt, niche);
            const structureResult = await this.simulateAI(structurePrompt, niche, true);

            document.getElementById('aiAdTypes').value = adTypesResult;
            document.getElementById('aiStructure').value = structureResult;
            this.showToast('Strategy generated!', 'success');
        } catch (err) {
            this.showToast('Generation failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '✨ Generate Strategy';
        }
    },

    // Simulate AI response (fallback when API not available)
    async simulateAI(prompt, niche, isStructure = false) {
        await new Promise(r => setTimeout(r, 800)); // Simulate delay

        if (isStructure) {
            return `📊 Recommended Campaign Structure for ${niche}:\n\n1. CAMPAIGN OBJECTIVE: Lead Generation (if service) or Messages (if retail)\n\n2. AD SETS:\n   • Broad Interest (Ages 25-55, ${niche} related interests)\n   • Lookalike 1% (from existing customers/leads)\n   • Retargeting (website visitors, engagement)\n\n3. BUDGET: ₱200-300/day\n   • 60% to best performer\n   • 40% split testing\n\n4. ADS PER SET: 2-3 variations\n   • Test different hooks\n   • A/B test images vs video`;
        } else {
            return `🎯 Recommended Ad Types for ${niche}:\n\n1. **Video Ads (Reels Format)**\n   Best for: Building trust, showing expertise\n   Why: Local service businesses benefit from face-to-camera content\n\n2. **Carousel Ads**\n   Best for: Showcasing multiple services/products\n   Why: Lets prospects browse options without leaving Facebook\n\n3. **Lead Form Ads**\n   Best for: Direct lead capture\n   Why: Reduces friction - no landing page needed`;
        }
    },

    // Open history modal
    openHistoryModal(clientId) {
        const client = Storage.getClient(clientId);
        const history = Storage.getClientHistory(clientId);

        document.getElementById('historyModalTitle').textContent = `📜 ${client?.clientName || 'Client'} - Stage History`;

        if (history.length === 0) {
            document.getElementById('historyModalBody').innerHTML = '<p style="color: var(--text-muted);">No stage history recorded yet.</p>';
        } else {
            const html = `<div class="timeline">${history.map(h => `
                <div class="timeline-item">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content">
                        <strong>${h.fromPhase || 'Created'}</strong> → <strong>${h.toPhase}</strong>
                        <div class="timeline-time">${new Date(h.timestamp).toLocaleString()} by ${h.changedBy || 'System'}</div>
                    </div>
                </div>
            `).join('')}</div>`;
            document.getElementById('historyModalBody').innerHTML = html;
        }

        document.getElementById('historyModal').classList.add('active');
    },

    // Close history modal
    closeHistoryModal() {
        document.getElementById('historyModal').classList.remove('active');
    },

    // Toggle theme
    toggleTheme() {
        const current = document.documentElement.dataset.theme;
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        Storage.saveSettings({ ...Storage.getSettings(), theme: next });
        this.updateThemeIcon();
    },

    // Switch tab in modal
    // Switch tab in modal
    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        // Activate tab button
        document.querySelector(`.tab[data-tab="${tabName}"]`)?.classList.add('active');

        // Activate content (try both ID and data-attribute)
        const contentById = document.getElementById(`tab-${tabName}`);
        const contentByData = document.querySelector(`.tab-content[data-tab="${tabName}"]`);

        if (contentById) contentById.classList.add('active');
        else if (contentByData) contentByData.classList.add('active');
    },

    // Select package
    selectPackage(pkg) {
        document.querySelectorAll('.package-option').forEach(o => o.classList.remove('selected'));
        document.querySelector(`.package-option[data-package="${pkg}"]`)?.classList.add('selected');
        document.querySelector(`.package-option[data-package="${pkg}"] input`).checked = true;

        const customFields = document.getElementById('customPackageFields');
        if (customFields) {
            customFields.classList.toggle('hidden', pkg !== 'custom');
        }
    },

    // Toggle testing options visibility
    toggleTestingOptions(show) {
        const opts = document.getElementById('testingOptions');
        if (opts) opts.classList.toggle('hidden', !show);
    },

    // Open add client modal
    openAddModal() {
        this.currentClientId = null;
        document.getElementById('modalTitle').textContent = 'Add New Client';
        document.getElementById('deleteBtn')?.classList.add('hidden');
        document.getElementById('clientForm').reset();
        this.selectPackage('basic');
        this.switchTab('basic');
        this.toggleTestingOptions(false);
        document.getElementById('clientModal').classList.add('active');
    },

    // Open edit client modal
    openEditModal(id) {
        const client = Storage.getClient(id);
        if (!client) return;

        this.currentClientId = id;
        document.getElementById('modalTitle').textContent = 'Edit Client';
        document.getElementById('deleteBtn')?.classList.remove('hidden');

        // Populate form
        document.getElementById('clientId').value = id;
        document.getElementById('projectName').value = client.projectName || '';
        document.getElementById('clientName').value = client.clientName || '';
        document.getElementById('businessName').value = client.businessName || '';
        document.getElementById('contactDetails').value = client.contactDetails || '';
        document.getElementById('pageLink').value = client.pageLink || '';
        document.getElementById('clientNotes').value = client.notes || '';
        document.getElementById('clientTags').value = (client.tags || []).join(', ');

        // Package
        this.selectPackage(client.package || 'basic');
        if (client.package === 'custom' && client.customPackage) {
            const cp = client.customPackage;
            document.getElementById('customPrice').value = cp.price || '';
            document.getElementById('customVideos').value = cp.videos || '';
            document.getElementById('customMainVideos').value = cp.mainVideos || '';
            document.getElementById('customPhotos').value = cp.photos || '';
            document.getElementById('customMeetingMins').value = cp.weeklyMeeting || '';
            document.getElementById('customCAPI').checked = cp.capi || false;
            document.getElementById('customAdvancedCAPI').checked = cp.advancedCapi || false;
            document.getElementById('customDailyAds').checked = cp.dailyAds || false;
            document.getElementById('customUnlimitedSetup').checked = cp.unlimitedSetup || false;
            document.getElementById('customLookalike').checked = cp.lookalike || false;
            document.getElementById('customPriority').checked = cp.priority || false;
            document.getElementById('customFeatures').value = cp.customFeatures || '';
        }

        // Payment
        document.getElementById('paymentStatus').value = client.paymentStatus || 'unpaid';
        document.getElementById('paymentSchedule').value = client.paymentSchedule || 'monthly';
        document.getElementById('monthsWithClient').value = client.monthsWithClient || 0;
        document.getElementById('startDate').value = client.startDate || '';

        // Schedule
        document.getElementById('currentPhase').value = client.phase || 'preparing';
        document.getElementById('autoSwitch').checked = client.autoSwitch || false;
        document.getElementById('autoSwitchDays').value = client.autoSwitchDays || 7;
        document.getElementById('nextPhaseDate').value = client.nextPhaseDate || '';
        document.getElementById('subscriptionUsage').value = client.subscriptionUsage || 0;
        document.getElementById('testingRound').value = client.testingRound || 1;

        this.toggleTestingOptions(client.phase === 'testing');
        this.switchTab('basic');
        document.getElementById('clientModal').classList.add('active');
    },

    // Close modal
    closeModal() {
        document.getElementById('clientModal').classList.remove('active');
        this.currentClientId = null;
    },

    // Open view modal
    openViewModal(id) {
        const client = Storage.getClient(id);
        if (!client) return;

        this.currentClientId = id;
        document.getElementById('viewClientTitle').textContent = client.clientName;
        document.getElementById('viewClientBody').innerHTML = Clients.renderClientDetails(client);
        document.getElementById('viewClientModal').classList.add('active');
    },

    // Close view modal
    closeViewModal() {
        document.getElementById('viewClientModal').classList.remove('active');
    },

    // Save client
    async saveClient() {
        const form = document.getElementById('clientForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const btn = document.getElementById('saveBtn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            const selectedPkg = document.querySelector('input[name="package"]:checked')?.value || 'basic';

            // Build custom package if selected
            let customPackage = null;
            if (selectedPkg === 'custom') {
                customPackage = {
                    price: parseInt(document.getElementById('customPrice').value) || 0,
                    videos: parseInt(document.getElementById('customVideos').value) || 0,
                    mainVideos: parseInt(document.getElementById('customMainVideos').value) || 0,
                    photos: parseInt(document.getElementById('customPhotos').value) || 0,
                    weeklyMeeting: parseInt(document.getElementById('customMeetingMins').value) || 0,
                    capi: document.getElementById('customCAPI').checked,
                    advancedCapi: document.getElementById('customAdvancedCAPI').checked,
                    dailyAds: document.getElementById('customDailyAds').checked,
                    unlimitedSetup: document.getElementById('customUnlimitedSetup').checked,
                    lookalike: document.getElementById('customLookalike').checked,
                    priority: document.getElementById('customPriority').checked,
                    customFeatures: document.getElementById('customFeatures').value
                };
            }

            // Parse tags
            const tagsInput = document.getElementById('clientTags').value;
            const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

            const phase = document.getElementById('currentPhase').value;

            // Prepare Data Object
            const data = {
                projectName: document.getElementById('projectName').value,
                clientName: document.getElementById('clientName').value,
                businessName: document.getElementById('businessName').value,
                contactDetails: document.getElementById('contactDetails').value,
                pageLink: document.getElementById('pageLink').value,
                assignedTo: document.getElementById('assignedTo')?.value || Storage.getCurrentUser(),
                // Only read Ads Expense if visible (admin), otherwise keep existing or 0
                adsExpense: parseInt(document.getElementById('adsExpense')?.value) || 0,
                notes: document.getElementById('clientNotes').value,
                tags,
                package: selectedPkg,
                customPackage,
                paymentStatus: document.getElementById('paymentStatus').value,
                paymentSchedule: document.getElementById('paymentSchedule').value,
                monthsWithClient: parseInt(document.getElementById('monthsWithClient').value) || 0,
                startDate: document.getElementById('startDate').value,
                phase,
                autoSwitch: document.getElementById('autoSwitch').checked,
                autoSwitchDays: parseInt(document.getElementById('autoSwitchDays').value) || 7,
                nextPhaseDate: document.getElementById('nextPhaseDate').value,
                subscriptionUsage: parseInt(document.getElementById('subscriptionUsage').value) || 0,
                testingRound: parseInt(document.getElementById('testingRound').value) || 1,
                subscriptionStarted: phase === 'testing' || phase === 'running'
            };

            if (this.currentClientId) {
                // UPDATE EXISTING
                if (this.isOnlineMode) {
                    const updated = await Supabase.updateClient(this.currentClientId, data);
                    // Update local cache
                    const localClient = Supabase.mapClientFromDb(updated);
                    Storage.updateClient(this.currentClientId, localClient);
                } else {
                    Storage.updateClient(this.currentClientId, data);
                }
                this.showToast('Client updated successfully', 'success');
            } else {
                // CREATE NEW
                // First create local object to get logic (like priority)
                data.priority = Priority.getNewClientPriority(phase);
                let newClient = Clients.createClient(data); // generates temp ID

                if (this.isOnlineMode) {
                    const created = await Supabase.addClient(newClient); // Supabase will ignore temp ID and generate UUID
                    newClient = Supabase.mapClientFromDb(created); // Get back real UUID
                }

                Storage.addClient(newClient);
                this.showToast('Client added successfully', 'success');
            }

            Priority.recalculateAll();
            this.closeModal();
            this.refreshUI();

        } catch (error) {
            console.error(error);
            this.showToast('Error saving client: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    },

    // Delete client
    async deleteClient() {
        if (!this.currentClientId) return;
        if (!confirm('Are you sure you want to delete this client?')) return;

        const btn = document.getElementById('deleteBtn');
        btn.textContent = 'Deleting...';
        btn.disabled = true;

        try {
            if (this.isOnlineMode) {
                await Supabase.deleteClient(this.currentClientId);
            }
            // Always delete locally as well
            Storage.deleteClient(this.currentClientId);

            Priority.recalculateAll();
            this.closeModal();
            this.refreshUI();
            this.showToast('Client deleted', 'info');
        } catch (error) {
            this.showToast('Error deleting client: ' + error.message, 'error');
            btn.textContent = 'Delete Client';
            btn.disabled = false;
        }
    },

    // Refresh UI
    refreshUI() {
        Phases.renderAllPhases();
        Metrics.updateDashboard();
    },

    // Show toast notification
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
