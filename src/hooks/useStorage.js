import { useState, useEffect } from 'react';

const KEYS = {
  CLIENTS: 'campy_clients',
  SETTINGS: 'campy_settings',
  EXPENSES: 'campy_expenses',
  HISTORY: 'campy_history',
  AI_PROMPTS: 'campy_ai_prompts'
};

export const useStorage = () => {
  const [clients, setClients] = useState([]);

  const loadClients = () => {
    const storedClients = JSON.parse(localStorage.getItem(KEYS.CLIENTS) || '[]');
    setClients(storedClients);
  };

  useEffect(() => {
    // Initialize storage
    if (!localStorage.getItem(KEYS.CLIENTS)) {
      localStorage.setItem(KEYS.CLIENTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(KEYS.SETTINGS)) {
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify({
        theme: 'dark',
        role: 'user',
        currentUser: 'User 1'
      }));
    }

    // Load clients
    loadClients();

    // Listen for storage changes (from syncAllData or other tabs)
    const handleStorageChange = () => {
      loadClients();
    };
    window.addEventListener('storage', handleStorageChange);
    // Also listen for custom event for same-tab updates
    window.addEventListener('syncComplete', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('syncComplete', handleStorageChange);
    };
  }, []);

  const saveClients = (newClients) => {
    localStorage.setItem(KEYS.CLIENTS, JSON.stringify(newClients));
    setClients(newClients);
  };

  const getClient = (id) => {
    return clients.find(c => c.id === id);
  };

  const addClient = (client) => {
    if (!client.id) {
      client.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }
    client.createdAt = client.createdAt || new Date().toISOString();
    client.updatedAt = new Date().toISOString();
    
    const updatedClients = [...clients, client];
    saveClients(updatedClients);
    return client;
  };

  const updateClient = (id, updates) => {
    const updatedClients = clients.map(c => 
      c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
    );
    saveClients(updatedClients);
    return updatedClients.find(c => c.id === id);
  };

  const deleteClient = (id) => {
    const updatedClients = clients.filter(c => c.id !== id);
    saveClients(updatedClients);
  };

  return {
    clients,
    getClient,
    addClient,
    updateClient,
    deleteClient,
    KEYS
  };
};

