/* ============================================
   Storage Module - LocalStorage Persistence
   ============================================ */

const Storage = {
  KEYS: {
    CLIENTS: 'campy_clients',
    SETTINGS: 'campy_settings',
    ACTIVITY: 'campy_activity',
    EXPENSES: 'campy_expenses',
    HISTORY: 'campy_history',
    AI_PROMPTS: 'campy_ai_prompts'
  },

  // Initialize storage with default data if empty
  init() {
    if (!localStorage.getItem(this.KEYS.CLIENTS)) {
      localStorage.setItem(this.KEYS.CLIENTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.KEYS.SETTINGS)) {
      localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify({
        theme: 'dark',
        role: 'user', // 'admin' or 'user'
        currentUser: 'User 1'
      }));
    }
    if (!localStorage.getItem(this.KEYS.ACTIVITY)) {
      localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.KEYS.EXPENSES)) {
      localStorage.setItem(this.KEYS.EXPENSES, JSON.stringify({
        basic: 500,
        star: 800,
        fire: 1000,
        crown: 1500,
        custom: 0
      }));
    }
    if (!localStorage.getItem(this.KEYS.HISTORY)) {
      localStorage.setItem(this.KEYS.HISTORY, JSON.stringify([]));
    }
  },

  // Get all clients
  getClients() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.CLIENTS)) || [];
    } catch (e) {
      console.error('Error parsing clients:', e);
      return [];
    }
  },

  // Save all clients
  saveClients(clients) {
    localStorage.setItem(this.KEYS.CLIENTS, JSON.stringify(clients));
  },

  // Get a single client by ID
  getClient(id) {
    const clients = this.getClients();
    return clients.find(c => c.id === id);
  },

  // Add a new client
  addClient(client) {
    const clients = this.getClients();
    client.id = this.generateId();
    client.createdAt = new Date().toISOString();
    client.updatedAt = new Date().toISOString();
    clients.push(client);
    this.saveClients(clients);
    this.logActivity('create', client);
    return client;
  },

  // Update a client
  updateClient(id, updates) {
    const clients = this.getClients();
    const index = clients.findIndex(c => c.id === id);
    if (index !== -1) {
      const oldClient = { ...clients[index] };
      clients[index] = { ...clients[index], ...updates, updatedAt: new Date().toISOString() };
      this.saveClients(clients);
      this.logActivity('update', clients[index], oldClient);
      return clients[index];
    }
    return null;
  },

  // Delete a client
  deleteClient(id) {
    const clients = this.getClients();
    const client = clients.find(c => c.id === id);
    const filtered = clients.filter(c => c.id !== id);
    this.saveClients(filtered);
    if (client) {
      this.logActivity('delete', client);
    }
    return true;
  },

  // Get settings
  getSettings() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.SETTINGS)) || { theme: 'dark' };
    } catch (e) {
      return { theme: 'dark' };
    }
  },

  // Save settings
  saveSettings(settings) {
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
  },

  // Get activity log
  getActivity(limit = 50) {
    try {
      const activity = JSON.parse(localStorage.getItem(this.KEYS.ACTIVITY)) || [];
      return activity.slice(0, limit);
    } catch (e) {
      return [];
    }
  },

  // Log activity
  logActivity(action, client, oldClient = null) {
    const activity = this.getActivity(100);
    const entry = {
      id: this.generateId(),
      action,
      clientId: client.id,
      clientName: client.clientName,
      businessName: client.businessName,
      timestamp: new Date().toISOString(),
      details: this.getActivityDetails(action, client, oldClient)
    };
    activity.unshift(entry);
    localStorage.setItem(this.KEYS.ACTIVITY, JSON.stringify(activity.slice(0, 100)));
  },

  // Generate activity details
  getActivityDetails(action, client, oldClient) {
    switch (action) {
      case 'create':
        return `Added new client "${client.clientName}" to ${client.phase}`;
      case 'update':
        if (oldClient && oldClient.phase !== client.phase) {
          return `Moved "${client.clientName}" from ${oldClient.phase} to ${client.phase}`;
        }
        return `Updated "${client.clientName}"`;
      case 'delete':
        return `Removed "${client.clientName}"`;
      case 'phase_change':
        return `"${client.clientName}" moved to ${client.phase}`;
      default:
        return `Action on "${client.clientName}"`;
    }
  },

  // Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  // Export data as JSON
  exportData() {
    return {
      clients: this.getClients(),
      settings: this.getSettings(),
      activity: this.getActivity(),
      exportedAt: new Date().toISOString()
    };
  },

  // Import data from JSON
  importData(data) {
    if (data.clients) {
      this.saveClients(data.clients);
    }
    if (data.settings) {
      this.saveSettings(data.settings);
    }
    return true;
  },

  // Get current role
  getRole() {
    return this.getSettings().role || 'user';
  },

  // Set role
  setRole(role) {
    const settings = this.getSettings();
    settings.role = role;
    this.saveSettings(settings);
  },

  // Get current user name
  getCurrentUser() {
    return this.getSettings().currentUser || 'User 1';
  },

  // Set current user
  setCurrentUser(name) {
    const settings = this.getSettings();
    settings.currentUser = name;
    this.saveSettings(settings);
  },

  // Get expenses
  getExpenses() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.EXPENSES)) || {};
    } catch (e) {
      return {};
    }
  },

  // Save expenses
  saveExpenses(expenses) {
    localStorage.setItem(this.KEYS.EXPENSES, JSON.stringify(expenses));
  },

  // Get expense for a package
  getPackageExpense(packageType) {
    const expenses = this.getExpenses();
    return expenses[packageType] || 0;
  },

  // Get stage history for a client
  getClientHistory(clientId) {
    try {
      const history = JSON.parse(localStorage.getItem(this.KEYS.HISTORY)) || [];
      return history.filter(h => h.clientId === clientId);
    } catch (e) {
      return [];
    }
  },

  // Add stage history entry
  addHistoryEntry(clientId, clientName, fromPhase, toPhase, changedBy) {
    try {
      const history = JSON.parse(localStorage.getItem(this.KEYS.HISTORY)) || [];
      history.unshift({
        id: this.generateId(),
        clientId,
        clientName,
        fromPhase,
        toPhase,
        changedBy,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history.slice(0, 500)));
    } catch (e) {
      console.error('Error saving history:', e);
    }
  },

  // Get AI generation prompts
  getAIPrompts() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.AI_PROMPTS)) || {
        adType: "Analyze the business niche '{niche}' and target audience '{audience}'. Suggest the top 3 most effective Facebook ad formats (e.g. Carousel, Single Image, Video) for this local business. For each, explain WHY it works for this specific niche. Keep it concise.",
        campaignStructure: "For a local service business in niche '{niche}' with a budget of ₱150-300/day, outline a recommended campaign structure. Include Campaign Objective (e.g. Leads, Messages), Ad Sets (Targeting suggestions), and number of ads. Explain the strategy briefly."
      };
    } catch (e) {
      console.error('Error parsing AI prompts:', e);
      return {
        adType: '',
        campaignStructure: ''
      };
    }
  },

  // Save AI generation prompts
  saveAIPrompts(prompts) {
    localStorage.setItem(this.KEYS.AI_PROMPTS, JSON.stringify(prompts));
  },

  // Clear all data
  clearAll() {
    localStorage.removeItem(this.KEYS.CLIENTS);
    localStorage.removeItem(this.KEYS.SETTINGS);
    localStorage.removeItem(this.KEYS.ACTIVITY);
    localStorage.removeItem(this.KEYS.EXPENSES);
    localStorage.removeItem(this.KEYS.HISTORY);
    localStorage.removeItem(this.KEYS.AI_PROMPTS);
    this.init();
  }
};

// Initialize storage on load
Storage.init();
