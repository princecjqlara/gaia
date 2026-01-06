import { useState, useEffect, useCallback } from 'react';
import facebookService from '../services/facebookService';
import { analyzeConversation } from '../services/aiConversationAnalyzer';

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

    // AI Analysis state
    const [aiAnalysis, setAiAnalysis] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [existingClient, setExistingClient] = useState(null);

    // Pagination state
    const [messagePage, setMessagePage] = useState(1);
    const [hasMoreMessages, setHasMoreMessages] = useState(false);
    const [totalMessages, setTotalMessages] = useState(0);

    // Search state
    const [messageSearch, setMessageSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    // Media upload state
    const [uploadingMedia, setUploadingMedia] = useState(false);

    // Conversation pagination state
    const [conversationPage, setConversationPage] = useState(1);
    const [hasMoreConversations, setHasMoreConversations] = useState(false);
    const [totalConversations, setTotalConversations] = useState(0);

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

    // Load conversations with pagination
    const loadConversations = useCallback(async (pageId = null, reset = true) => {
        try {
            setLoading(true);

            // Always load page 1 when reset is true
            const result = await facebookService.getConversationsWithPagination(pageId, 1, 8);

            if (reset) {
                setConversations(result.conversations);
                setConversationPage(1);
            } else {
                setConversations(prev => [...prev, ...result.conversations]);
            }

            setHasMoreConversations(result.hasMore);
            setTotalConversations(result.total);

            // Calculate unread count
            const totalUnread = result.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
            setUnreadCount(prev => reset ? totalUnread : prev + totalUnread);

            return result.conversations;
        } catch (err) {
            console.error('Error loading conversations:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, []); // No dependencies - stable callback

    // Load more conversations
    const loadMoreConversations = useCallback(async (pageId = null) => {
        if (!hasMoreConversations || loading) return;

        try {
            setLoading(true);
            const nextPage = conversationPage + 1;

            const result = await facebookService.getConversationsWithPagination(pageId, nextPage, 8);

            setConversations(prev => [...prev, ...result.conversations]);
            setConversationPage(nextPage);
            setHasMoreConversations(result.hasMore);

            return result.conversations;
        } catch (err) {
            console.error('Error loading more conversations:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [conversationPage, hasMoreConversations, loading]);

    // Load messages for a conversation
    const loadMessages = useCallback(async (conversationId) => {
        try {
            setLoading(true);
            const msgs = await facebookService.getMessages(conversationId);
            setMessages(msgs);

            // Mark messages as read
            await facebookService.markMessagesAsRead(conversationId);

            // Update unread count locally instead of reloading all conversations
            setUnreadCount(prev => Math.max(0, prev - 1));

            return msgs;
        } catch (err) {
            console.error('Error loading messages:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    // Run AI analysis on current conversation
    const runAIAnalysis = useCallback(async (msgs, participantName) => {
        if (!msgs || msgs.length === 0) return null;

        try {
            setAnalyzing(true);
            const analysis = await analyzeConversation(msgs, participantName);
            setAiAnalysis(analysis);
            return analysis;
        } catch (err) {
            console.error('Error running AI analysis:', err);
            return null;
        } finally {
            setAnalyzing(false);
        }
    }, []);

    // Check for existing client
    const checkExistingClient = useCallback(async (participantName, details = {}) => {
        try {
            const client = await facebookService.findExistingClient(participantName, details);
            setExistingClient(client);
            return client;
        } catch (err) {
            console.error('Error checking existing client:', err);
            return null;
        }
    }, []);

    // Select a conversation
    const selectConversation = useCallback(async (conversation) => {
        setSelectedConversation(conversation);
        setAiAnalysis(null);
        setExistingClient(null);
        setMessages([]); // Clear old messages immediately

        if (conversation) {
            try {
                setLoading(true);

                // First, sync messages from Facebook to get the latest
                await facebookService.syncMessages(
                    conversation.conversation_id,
                    conversation.page_id
                );

                // Then load messages from database
                const msgs = await facebookService.getMessages(conversation.conversation_id);
                setMessages(msgs);

                // Mark messages as read
                await facebookService.markMessagesAsRead(conversation.conversation_id);

                // Load existing AI analysis if available
                const savedAnalysis = await facebookService.getAIAnalysis(conversation.conversation_id);
                if (savedAnalysis?.ai_analysis && Object.keys(savedAnalysis.ai_analysis).length > 0) {
                    setAiAnalysis(savedAnalysis.ai_analysis);
                }

                // Check for existing client
                await checkExistingClient(conversation.participant_name, savedAnalysis?.extracted_details);
            } catch (err) {
                console.error('Error loading conversation:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        } else {
            setMessages([]);
        }
    }, [checkExistingClient]);

    // Analyze current conversation with AI
    const analyzeCurrentConversation = useCallback(async () => {
        if (!selectedConversation || messages.length === 0) return null;

        const analysis = await runAIAnalysis(messages, selectedConversation.participant_name);

        if (analysis) {
            // Save analysis to database
            await facebookService.saveAIAnalysis(selectedConversation.conversation_id, analysis);

            // Check for existing client with extracted details
            await checkExistingClient(selectedConversation.participant_name, analysis.details);
        }

        return analysis;
    }, [selectedConversation, messages, runAIAnalysis, checkExistingClient]);

    // Transfer conversation to client pipeline
    const transferToClient = useCallback(async (clientData = {}, userId) => {
        if (!selectedConversation) return null;

        try {
            setLoading(true);
            const client = await facebookService.transferToClient(
                selectedConversation.conversation_id,
                clientData,
                userId
            );

            // Update selected conversation with linked client
            setSelectedConversation(prev => ({
                ...prev,
                linked_client_id: client.id,
                linked_client: client
            }));

            await loadConversations();
            return client;
        } catch (err) {
            console.error('Error transferring to client:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [selectedConversation, loadConversations]);

    // Update existing lead with conversation data
    const updateExistingLead = useCallback(async (clientId, updates = {}) => {
        if (!selectedConversation) return null;

        try {
            setLoading(true);
            const client = await facebookService.updateExistingLead(
                selectedConversation.conversation_id,
                clientId,
                updates
            );

            // Update selected conversation
            setSelectedConversation(prev => ({
                ...prev,
                linked_client_id: client.id,
                linked_client: client
            }));

            await loadConversations();
            return client;
        } catch (err) {
            console.error('Error updating existing lead:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [selectedConversation, loadConversations]);

    // Book meeting from AI detection
    const bookMeetingFromAI = useCallback(async (meetingData = {}, userId) => {
        if (!selectedConversation) return null;

        try {
            setLoading(true);
            const meeting = await facebookService.createMeetingFromAI(
                selectedConversation.conversation_id,
                meetingData,
                userId
            );

            // Update AI analysis state
            setAiAnalysis(prev => ({
                ...prev,
                meetingBooked: true,
                bookedMeetingId: meeting.id
            }));

            return meeting;
        } catch (err) {
            console.error('Error booking meeting:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [selectedConversation]);

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

    // Send media message
    const sendMediaMessage = useCallback(async (file, mediaType = 'file') => {
        if (!selectedConversation || !file) return null;

        try {
            setUploadingMedia(true);

            await facebookService.sendMediaMessage(
                selectedConversation.page_id,
                selectedConversation.participant_id,
                file,
                mediaType
            );

            // Sync and reload messages
            await facebookService.syncMessages(
                selectedConversation.conversation_id,
                selectedConversation.page_id
            );
            await loadMessages(selectedConversation.conversation_id);

            return true;
        } catch (err) {
            console.error('Error sending media:', err);
            setError(err.message);
            return false;
        } finally {
            setUploadingMedia(false);
        }
    }, [selectedConversation, loadMessages]);

    // Send booking button to contact
    const sendBookingButton = useCallback(async () => {
        if (!selectedConversation) return null;

        try {
            setLoading(true);

            const bookingUrl = `${window.location.origin}/book/${selectedConversation.page_id}?psid=${selectedConversation.participant_id}&name=${encodeURIComponent(selectedConversation.participant_name || '')}`;

            await facebookService.sendBookingButton(
                selectedConversation.page_id,
                selectedConversation.participant_id,
                bookingUrl
            );

            // Sync and reload
            await facebookService.syncMessages(
                selectedConversation.conversation_id,
                selectedConversation.page_id
            );
            await loadMessages(selectedConversation.conversation_id);

            return true;
        } catch (err) {
            console.error('Error sending booking button:', err);
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    }, [selectedConversation, loadMessages]);

    // Load more messages (pagination)
    const loadMoreMessages = useCallback(async () => {
        if (!selectedConversation || !hasMoreMessages || loading) return;

        try {
            setLoading(true);
            const nextPage = messagePage + 1;

            const result = await facebookService.getMessagesWithPagination(
                selectedConversation.conversation_id,
                nextPage
            );

            setMessages(prev => [...result.messages, ...prev]);
            setMessagePage(nextPage);
            setHasMoreMessages(result.hasMore);

            return result;
        } catch (err) {
            console.error('Error loading more messages:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [selectedConversation, hasMoreMessages, loading, messagePage]);

    // Search messages
    const searchMessagesAction = useCallback(async (searchTerm) => {
        if (!searchTerm.trim()) {
            setSearchResults([]);
            setMessageSearch('');
            return [];
        }

        try {
            setSearching(true);
            setMessageSearch(searchTerm);

            const results = await facebookService.searchMessages(
                searchTerm,
                selectedConversation?.conversation_id // Search in current convo or all
            );

            setSearchResults(results);
            return results;
        } catch (err) {
            console.error('Error searching messages:', err);
            return [];
        } finally {
            setSearching(false);
        }
    }, [selectedConversation]);

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

    // Delete a conversation
    const deleteConversation = useCallback(async (conversationId) => {
        try {
            await facebookService.deleteConversation(conversationId);

            // Clear selection if deleted conversation was selected
            if (selectedConversation?.conversation_id === conversationId) {
                setSelectedConversation(null);
                setMessages([]);
            }

            // Remove from local state
            setConversations(prev => prev.filter(c => c.conversation_id !== conversationId));

            return true;
        } catch (err) {
            console.error('Error deleting conversation:', err);
            setError(err.message);
            return false;
        }
    }, [selectedConversation, loadConversations]);

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

                // Update the conversation in the list in-place (don't reset pagination)
                setConversations(prev => prev.map(conv =>
                    conv.conversation_id === payload.new.conversation_id
                        ? { ...conv, last_message_text: payload.new.message_text, last_message_time: payload.new.timestamp }
                        : conv
                ));
            });

            // Subscribe to conversation updates
            conversationSubscription = facebookService.subscribeToConversations((payload) => {
                console.log('Conversation updated:', payload);

                // Update the conversation in-place instead of reloading all
                if (payload.new) {
                    setConversations(prev => prev.map(conv =>
                        conv.conversation_id === payload.new.conversation_id
                            ? { ...conv, ...payload.new }
                            : conv
                    ));
                }
            });
        };

        setupSubscriptions();

        return () => {
            messageSubscription?.unsubscribe();
            conversationSubscription?.unsubscribe();
        };
    }, [selectedConversation]);

    // Initial load - only run once on mount
    useEffect(() => {
        loadConnectedPages();
        loadConversations();
        loadSettings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty deps - only run on mount

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

        // AI State
        aiAnalysis,
        analyzing,
        existingClient,

        // Pagination & Search State
        messagePage,
        hasMoreMessages,
        totalMessages,
        messageSearch,
        searchResults,
        searching,
        uploadingMedia,
        // Conversation pagination
        conversationPage,
        hasMoreConversations,
        totalConversations,

        // Actions
        loadConversations,
        loadMoreConversations,
        loadMessages,
        selectConversation,
        sendMessage,
        sendMediaMessage,
        sendBookingButton,
        loadMoreMessages,
        searchMessages: searchMessagesAction,
        syncAllConversations,
        syncMessages,
        linkToClient,
        assignToUser,
        deleteConversation,
        loadSettings,
        saveSettings,
        connectPage,
        disconnectPage,
        loadConnectedPages,

        // AI Actions
        analyzeCurrentConversation,
        transferToClient,
        updateExistingLead,
        bookMeetingFromAI,

        // Utilities
        clearError: () => setError(null),
        clearSearch: () => { setSearchResults([]); setMessageSearch(''); }
    };
}

export default useFacebookMessenger;

