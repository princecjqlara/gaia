import { useState, useEffect, useCallback } from 'react';
import facebookService from '../services/facebookService';

/**
 * React hook for Facebook Messenger functionality
 */
export function useFacebookMessenger() {
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [connectedPages, setConnectedPages] = useState([]);
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState(null);
    const [unreadCount, setUnreadCount] = useState(0);

    // Load connected pages
    const loadConnectedPages = useCallback(async () => {
        try {
            const pages = await facebookService.getConnectedPages();
            setConnectedPages(pages);
            return pages;
        } catch (err) {
            console.error('Error loading connected pages:', err);
            setError(err.message);
            return [];
        }
    }, []);

    // Load conversations
    const loadConversations = useCallback(async (pageId = null) => {
        try {
            setLoading(true);
            const convs = await facebookService.getConversations(pageId);
            setConversations(convs);

            // Calculate unread count
            const totalUnread = convs.reduce((sum, c) => sum + (c.unread_count || 0), 0);
            setUnreadCount(totalUnread);

            return convs;
        } catch (err) {
            console.error('Error loading conversations:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    // Load messages for a conversation
    const loadMessages = useCallback(async (conversationId) => {
        try {
            setLoading(true);
            const msgs = await facebookService.getMessages(conversationId);
            setMessages(msgs);

            // Mark messages as read
            await facebookService.markMessagesAsRead(conversationId);

            // Refresh conversations to update unread count
            loadConversations();

            return msgs;
        } catch (err) {
            console.error('Error loading messages:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, [loadConversations]);

    // Select a conversation
    const selectConversation = useCallback(async (conversation) => {
        setSelectedConversation(conversation);
        if (conversation) {
            await loadMessages(conversation.conversation_id);
        } else {
            setMessages([]);
        }
    }, [loadMessages]);

    // Send a message
    const sendMessage = useCallback(async (messageText) => {
        if (!selectedConversation || !messageText.trim()) return null;

        try {
            setLoading(true);

            // Send via Facebook API
            await facebookService.sendMessage(
                selectedConversation.page_id,
                selectedConversation.participant_id,
                messageText
            );

            // Sync messages to get the sent message
            await facebookService.syncMessages(
                selectedConversation.conversation_id,
                selectedConversation.page_id
            );

            // Reload messages
            await loadMessages(selectedConversation.conversation_id);

            return true;
        } catch (err) {
            console.error('Error sending message:', err);
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    }, [selectedConversation, loadMessages]);

    // Sync all conversations from Facebook
    const syncAllConversations = useCallback(async () => {
        try {
            setSyncing(true);
            setError(null);

            const pages = await loadConnectedPages();

            for (const page of pages) {
                await facebookService.syncConversations(page.page_id);
            }

            await loadConversations();

            return true;
        } catch (err) {
            console.error('Error syncing conversations:', err);
            setError(err.message);
            return false;
        } finally {
            setSyncing(false);
        }
    }, [loadConnectedPages, loadConversations]);

    // Sync messages for current conversation
    const syncMessages = useCallback(async () => {
        if (!selectedConversation) return false;

        try {
            setSyncing(true);

            await facebookService.syncMessages(
                selectedConversation.conversation_id,
                selectedConversation.page_id
            );

            await loadMessages(selectedConversation.conversation_id);

            return true;
        } catch (err) {
            console.error('Error syncing messages:', err);
            setError(err.message);
            return false;
        } finally {
            setSyncing(false);
        }
    }, [selectedConversation, loadMessages]);

    // Link conversation to client
    const linkToClient = useCallback(async (conversationId, clientId) => {
        try {
            await facebookService.linkConversationToClient(conversationId, clientId);
            await loadConversations();
            return true;
        } catch (err) {
            console.error('Error linking to client:', err);
            setError(err.message);
            return false;
        }
    }, [loadConversations]);

    // Assign conversation to user
    const assignToUser = useCallback(async (conversationId, userId) => {
        try {
            await facebookService.assignConversation(conversationId, userId);
            await loadConversations();
            return true;
        } catch (err) {
            console.error('Error assigning conversation:', err);
            setError(err.message);
            return false;
        }
    }, [loadConversations]);

    // Load settings
    const loadSettings = useCallback(async () => {
        try {
            const settings = await facebookService.getSettings();
            setSettings(settings);
            return settings;
        } catch (err) {
            console.error('Error loading settings:', err);
            return {};
        }
    }, []);

    // Save settings
    const saveSettings = useCallback(async (key, value, userId) => {
        try {
            await facebookService.saveSettings(key, value, userId);
            await loadSettings();
            return true;
        } catch (err) {
            console.error('Error saving settings:', err);
            setError(err.message);
            return false;
        }
    }, [loadSettings]);

    // Connect a new page
    const connectPage = useCallback(async (pageData, userId) => {
        try {
            await facebookService.connectPage(pageData, userId);
            await loadConnectedPages();
            return true;
        } catch (err) {
            console.error('Error connecting page:', err);
            setError(err.message);
            return false;
        }
    }, [loadConnectedPages]);

    // Disconnect a page
    const disconnectPage = useCallback(async (pageId) => {
        try {
            await facebookService.disconnectPage(pageId);
            await loadConnectedPages();
            return true;
        } catch (err) {
            console.error('Error disconnecting page:', err);
            setError(err.message);
            return false;
        }
    }, [loadConnectedPages]);

    // Set up real-time subscriptions
    useEffect(() => {
        let messageSubscription;
        let conversationSubscription;

        const setupSubscriptions = async () => {
            // Subscribe to new messages
            messageSubscription = facebookService.subscribeToMessages((payload) => {
                console.log('New message received:', payload);

                // If viewing the same conversation, add the message
                if (selectedConversation &&
                    payload.new.conversation_id === selectedConversation.conversation_id) {
                    setMessages(prev => [...prev, payload.new]);
                }

                // Refresh conversations to update unread counts
                loadConversations();
            });

            // Subscribe to conversation updates
            conversationSubscription = facebookService.subscribeToConversations((payload) => {
                console.log('Conversation updated:', payload);
                loadConversations();
            });
        };

        setupSubscriptions();

        return () => {
            messageSubscription?.unsubscribe();
            conversationSubscription?.unsubscribe();
        };
    }, [selectedConversation, loadConversations]);

    // Initial load
    useEffect(() => {
        loadConnectedPages();
        loadConversations();
        loadSettings();
    }, [loadConnectedPages, loadConversations, loadSettings]);

    return {
        // State
        conversations,
        selectedConversation,
        messages,
        connectedPages,
        settings,
        loading,
        syncing,
        error,
        unreadCount,

        // Actions
        loadConversations,
        loadMessages,
        selectConversation,
        sendMessage,
        syncAllConversations,
        syncMessages,
        linkToClient,
        assignToUser,
        loadSettings,
        saveSettings,
        connectPage,
        disconnectPage,
        loadConnectedPages,

        // Utilities
        clearError: () => setError(null)
    };
}

export default useFacebookMessenger;
