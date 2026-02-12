import { useState, useEffect, useCallback, useRef } from 'react';
import facebookService from '../services/facebookService';
import { analyzeConversation } from '../services/aiConversationAnalyzer';
import { autoAssignService } from '../services/autoAssignService';

/**
 * React hook for Facebook Messenger functionality
 */
export function useFacebookMessenger() {
    const INITIAL_MESSAGE_LIMIT = 8;
    const MESSAGE_PAGE_SIZE = 15;
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

    // Automatic conversation insights (no AI required)
    const [conversationInsights, setConversationInsights] = useState(null);

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

    // Search conversations across ALL contacts (not just loaded page)
    const [conversationSearchResults, setConversationSearchResults] = useState([]);
    const [searchingConversations, setSearchingConversations] = useState(false);

    const selectedConversationRef = useRef(null);
    const messageLimitRef = useRef(INITIAL_MESSAGE_LIMIT);

    useEffect(() => {
        selectedConversationRef.current = selectedConversation;
    }, [selectedConversation]);

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

    // Helper function to deduplicate conversations by participant_id
    // Keeps the most recent conversation for each participant
    const deduplicateByParticipant = (conversations) => {
        const seenParticipants = new Map();
        return conversations.filter(conv => {
            const participantId = conv.participant_id;
            if (!participantId) return true; // Keep if no participant_id

            const existing = seenParticipants.get(participantId);
            if (!existing) {
                seenParticipants.set(participantId, conv);
                return true;
            }

            // Keep only the more recent conversation
            const existingTime = new Date(existing.last_message_time || 0).getTime();
            const currentTime = new Date(conv.last_message_time || 0).getTime();
            if (currentTime > existingTime) {
                seenParticipants.set(participantId, conv);
                return true;
            }
            console.log('[DEDUP] Skipping duplicate for participant:', participantId);
            return false;
        });
    };

    // Hydrate conversation previews using latest messages (fallback when conversation row is stale)
    const hydrateConversationPreviews = useCallback(async (conversationList) => {
        try {
            if (!conversationList || conversationList.length === 0) return conversationList;

            const conversationIds = conversationList
                .map(conv => conv.conversation_id)
                .filter(Boolean);

            if (conversationIds.length === 0) return conversationList;

            const [latestMessages, unreadMessages] = await Promise.all([
                facebookService.getLatestMessagesForConversations(conversationIds, 500),
                facebookService.getUnreadMessagesForConversations(conversationIds, 1000)
            ]);

            if (!latestMessages || latestMessages.length === 0) return conversationList;

            const latestByConversation = new Map();
            for (const msg of latestMessages) {
                if (!latestByConversation.has(msg.conversation_id)) {
                    latestByConversation.set(msg.conversation_id, msg);
                }
            }

            const unreadCountByConversation = new Map();
            if (unreadMessages && unreadMessages.length > 0) {
                for (const msg of unreadMessages) {
                    const current = unreadCountByConversation.get(msg.conversation_id) || 0;
                    unreadCountByConversation.set(msg.conversation_id, current + 1);
                }
            }

            const hydrated = conversationList.map(conv => {
                const latest = latestByConversation.get(conv.conversation_id);
                if (!latest) return conv;

                const isActiveConversation =
                    selectedConversationRef.current?.conversation_id === conv.conversation_id;
                const inboundUnread = latest.is_from_page === false;

                let nextUnread = conv.unread_count || 0;
                if (isActiveConversation) {
                    nextUnread = 0;
                } else if (unreadCountByConversation.has(conv.conversation_id)) {
                    nextUnread = unreadCountByConversation.get(conv.conversation_id);
                } else if (inboundUnread) {
                    nextUnread = Math.max(nextUnread, 1);
                }

                return {
                    ...conv,
                    last_message_text: latest.message_text || conv.last_message_text,
                    last_message_time: latest.timestamp || conv.last_message_time,
                    last_message_from_page: latest.is_from_page,
                    unread_count: nextUnread
                };
            });

            return hydrated.sort((a, b) =>
                new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0)
            );
        } catch (err) {
            console.error('Error hydrating conversation previews:', err);
            return conversationList;
        }
    }, []);

    // Load conversations with pagination
    // silent = true prevents loading state from causing UI flicker
    const loadConversations = useCallback(async (pageId = null, reset = true, silent = false) => {
        try {
            // Only show loading spinner if not a silent/background refresh
            if (!silent) {
                setLoading(true);
            }

            // Always load page 1 when reset is true
            const result = await facebookService.getConversationsWithPagination(pageId, 1, 8);

            // Deduplicate to prevent same contact showing multiple times
            const dedupedConversations = deduplicateByParticipant(result.conversations);
            const hydratedConversations = await hydrateConversationPreviews(dedupedConversations);

            if (reset) {
                setConversations(hydratedConversations);
                setConversationPage(1);
            } else {
                setConversations(prev => deduplicateByParticipant([...prev, ...hydratedConversations]));
            }

            setHasMoreConversations(result.hasMore);
            setTotalConversations(result.total);

            // Calculate unread count
            const totalUnread = hydratedConversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
            setUnreadCount(prev => reset ? totalUnread : prev + totalUnread);

            return hydratedConversations;
        } catch (err) {
            console.error('Error loading conversations:', err);
            setError(err.message);
            return [];
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    }, []); // No dependencies - stable callback

    // Load more conversations
    const loadMoreConversations = useCallback(async (pageId = null) => {
        if (!hasMoreConversations || loading) return;

        try {
            setLoading(true);
            const nextPage = conversationPage + 1;

            const result = await facebookService.getConversationsWithPagination(pageId, nextPage, 8);

            // Deduplicate when appending to existing conversations
            setConversations(prev => deduplicateByParticipant([...prev, ...result.conversations]));
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
    const loadMessages = useCallback(async (conversationId, limit = messageLimitRef.current || MESSAGE_PAGE_SIZE) => {
        try {
            setLoading(true);
            const msgs = await facebookService.getMessages(conversationId, limit);
            setMessages(msgs);
            setHasMoreMessages(msgs.length === limit);
            messageLimitRef.current = limit;

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
        setConversationInsights(null); // Clear insights
        setMessages([]); // Clear old messages immediately

        if (conversation) {
            try {
                setLoading(true);
                messageLimitRef.current = INITIAL_MESSAGE_LIMIT;
                const initialLimit = messageLimitRef.current;

                // Load recent messages from database first (fast)
                const msgs = await facebookService.getMessages(
                    conversation.conversation_id,
                    initialLimit
                );
                setMessages(msgs);
                setHasMoreMessages(msgs.length === initialLimit);

                // Mark messages as read
                await facebookService.markMessagesAsRead(conversation.conversation_id);

                // Sync latest messages in the background
                facebookService
                    .syncMessages(
                        conversation.conversation_id,
                        conversation.page_id
                    )
                    .then(async () => {
                        if (
                            selectedConversationRef.current?.conversation_id !==
                            conversation.conversation_id
                        ) {
                            return;
                        }

                        const syncedMsgs = await facebookService.getMessages(
                            conversation.conversation_id,
                            initialLimit
                        );
                        setMessages(syncedMsgs);
                        setHasMoreMessages(syncedMsgs.length === initialLimit);
                    })
                    .catch((syncError) => {
                        console.warn('Background sync failed:', syncError);
                    });

                // Load automatic insights (booking status, timeline, stats, AI)
                const insights = await facebookService.getConversationInsights(
                    conversation.conversation_id,
                    conversation.participant_id,
                    conversation.page_id
                );
                setConversationInsights(insights);

                // Set AI analysis from insights if available (populated by getConversationInsights)
                if (insights?.aiAnalysis) {
                    setAiAnalysis(insights.aiAnalysis);
                }

                // Check for existing client
                await checkExistingClient(conversation.participant_name, insights?.aiAnalysis?.details);
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

    // Silent refresh for messages - doesn't clear messages or show loading
    // Used for background auto-refresh to prevent UI flashing
    const refreshMessages = useCallback(async (conversationId, pageId) => {
        if (!conversationId) return;

        try {
            // Silently sync and get messages without clearing UI
            try {
                await facebookService.syncMessages(conversationId, pageId);
            } catch (syncError) {
                console.warn('Silent sync failed, falling back to local messages:', syncError);
            }

            const currentLimit = messageLimitRef.current || MESSAGE_PAGE_SIZE;
            const msgs = await facebookService.getMessages(conversationId, currentLimit);
            setMessages(msgs);
            setHasMoreMessages(msgs.length === currentLimit);
            messageLimitRef.current = currentLimit;

            // Silently mark as read
            await facebookService.markMessagesAsRead(conversationId);
        } catch (err) {
            console.error('Error refreshing messages:', err);
        }
    }, []);

    // Analyze current conversation with AI
    const analyzeCurrentConversation = useCallback(async () => {
        if (!selectedConversation || messages.length === 0) return null;

        const analysis = await runAIAnalysis(messages, selectedConversation.participant_name);

        if (analysis) {
            // Save analysis to database
            await facebookService.saveAIAnalysisResults(selectedConversation.conversation_id, analysis);

            // Refresh conversation insights to get updated AI summary, contact info, etc.
            const updatedInsights = await facebookService.getConversationInsights(
                selectedConversation.conversation_id,
                selectedConversation.participant_id,
                selectedConversation.page_id
            );
            setConversationInsights(updatedInsights);

            // Check for existing client with extracted details
            await checkExistingClient(selectedConversation.participant_name, analysis.details);
        }

        return analysis;
    }, [selectedConversation, messages, runAIAnalysis, checkExistingClient]);

    // Transfer conversation to client pipeline with auto-assign
    const transferToClient = useCallback(async (clientData = {}, userId) => {
        if (!selectedConversation) return null;

        try {
            setLoading(true);
            const client = await facebookService.transferToClient(
                selectedConversation.conversation_id,
                clientData,
                userId
            );

            // Auto-assign to clocked-in chat support user (round-robin)
            try {
                const assignedUser = await autoAssignService.assignConversation(
                    selectedConversation.conversation_id
                );
                if (assignedUser) {
                    console.log(`[Pipeline] Auto-assigned to ${assignedUser.name || assignedUser.email}`);
                }
            } catch (assignErr) {
                console.log('[Pipeline] Auto-assign skipped:', assignErr.message);
            }

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
        console.log('[HOOK] sendMessage called');

        if (!selectedConversation) {
            console.log('[HOOK] No selected conversation');
            return false;
        }

        if (!messageText.trim()) {
            console.log('[HOOK] Empty message text');
            return false;
        }

        console.log('[HOOK] Sending to:', {
            page_id: selectedConversation.page_id,
            participant_id: selectedConversation.participant_id,
            conversation_id: selectedConversation.conversation_id,
            messageLength: messageText.length
        });

        try {
            setLoading(true);

            // Send via Facebook API
            console.log('[HOOK] Calling facebookService.sendMessage...');
            const result = await facebookService.sendMessage(
                selectedConversation.page_id,
                selectedConversation.participant_id,
                messageText,
                selectedConversation.conversation_id
            );
            console.log('[HOOK] sendMessage result:', result);

            // Sync messages to get the sent message
            console.log('[HOOK] Syncing messages...');
            await facebookService.syncMessages(
                selectedConversation.conversation_id,
                selectedConversation.page_id
            );

            // Reload messages
            console.log('[HOOK] Reloading messages...');
            await loadMessages(selectedConversation.conversation_id);

            console.log('[HOOK] Message sent successfully');
            return true;
        } catch (err) {
            console.error('[HOOK] Error sending message:', err);
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

    // Send property card or carousel to contact
    const sendPropertyCard = useCallback(async (propertyOrProperties) => {
        if (!selectedConversation || !propertyOrProperties) return null;

        try {
            setLoading(true);

            console.log('[HOOK] Sending property card with visitor name:', selectedConversation.participant_name);
            await facebookService.sendPropertyCard(
                selectedConversation.page_id,
                selectedConversation.participant_id,
                propertyOrProperties,
                selectedConversation.participant_name // Pass name for tracking
            );

            // Sync and reload
            await facebookService.syncMessages(
                selectedConversation.conversation_id,
                selectedConversation.page_id
            );
            await loadMessages(selectedConversation.conversation_id);

            return true;
        } catch (err) {
            console.error('Error sending property card:', err);
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    }, [selectedConversation, loadMessages]);

    // Send video card to contact
    const sendVideoMessage = useCallback(async (videoUrl, buttonTitle, buttonUrl) => {
        if (!selectedConversation || !videoUrl) return null;

        try {
            setLoading(true);

            await facebookService.sendVideoCard(
                selectedConversation.page_id,
                selectedConversation.participant_id,
                videoUrl,
                buttonTitle,
                buttonUrl
            );

            // Sync and reload
            await facebookService.syncMessages(
                selectedConversation.conversation_id,
                selectedConversation.page_id
            );
            await loadMessages(selectedConversation.conversation_id);

            return true;
        } catch (err) {
            console.error('Error sending video card:', err);
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    }, [selectedConversation, loadMessages]);

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

    // Load more (older) messages - for scroll-up pagination
    const loadMoreMessages = useCallback(async (limit = MESSAGE_PAGE_SIZE) => {
        if (!selectedConversation || messages.length === 0) return [];

        try {
            // Get timestamp of oldest message
            const oldestMessage = messages[0];
            if (!oldestMessage?.timestamp) return [];

            const olderMessages = await facebookService.getMoreMessages(
                selectedConversation.conversation_id,
                oldestMessage.timestamp,
                limit
            );

            if (olderMessages.length > 0) {
                // Prepend older messages
                setMessages(prev => [...olderMessages, ...prev]);
                const currentLimit = messageLimitRef.current || messages.length || MESSAGE_PAGE_SIZE;
                messageLimitRef.current = currentLimit + olderMessages.length;
            }

            setHasMoreMessages(olderMessages.length === limit);

            return olderMessages;
        } catch (err) {
            console.error('Error loading more messages:', err);
            return [];
        }
    }, [selectedConversation, messages]);

    // Link conversation to client
    const linkToClient = useCallback(async (conversationId, clientId) => {
        try {
            await facebookService.linkConversationToClient(conversationId, clientId);

            // Update local state immediately for responsive UI
            if (selectedConversation?.conversation_id === conversationId) {
                setSelectedConversation(prev => ({
                    ...prev,
                    linked_client_id: clientId,
                    linked_client: clientId ? prev?.linked_client : null
                }));
            }

            // Also update conversations list
            setConversations(prev => prev.map(conv =>
                conv.conversation_id === conversationId
                    ? { ...conv, linked_client_id: clientId, linked_client: clientId ? conv.linked_client : null }
                    : conv
            ));

            return true;
        } catch (err) {
            console.error('Error linking to client:', err);
            setError(err.message);
            return false;
        }
    }, [selectedConversation]);

    // Refresh contact name from Facebook
    const refreshContactName = useCallback(async () => {
        if (!selectedConversation) return null;

        try {
            const newName = await facebookService.refreshContactName(
                selectedConversation.conversation_id,
                selectedConversation.participant_id,
                selectedConversation.page_id
            );

            // Update local state
            setSelectedConversation(prev => ({
                ...prev,
                participant_name: newName
            }));

            // Update conversations list
            setConversations(prev => prev.map(conv =>
                conv.conversation_id === selectedConversation.conversation_id
                    ? { ...conv, participant_name: newName }
                    : conv
            ));

            return newName;
        } catch (err) {
            console.error('Error refreshing contact name:', err);
            throw err;
        }
    }, [selectedConversation]);

    // Manually set contact name (when Facebook API fails)
    const setContactName = useCallback(async (newName) => {
        if (!selectedConversation) return null;

        try {
            const savedName = await facebookService.setContactName(
                selectedConversation.conversation_id,
                newName
            );

            // Update local state
            setSelectedConversation(prev => ({
                ...prev,
                participant_name: savedName
            }));

            // Update conversations list
            setConversations(prev => prev.map(conv =>
                conv.conversation_id === selectedConversation.conversation_id
                    ? { ...conv, participant_name: savedName }
                    : conv
            ));

            return savedName;
        } catch (err) {
            console.error('Error setting contact name:', err);
            throw err;
        }
    }, [selectedConversation]);

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

    // Update lead status for a conversation
    const updateLeadStatus = useCallback(async (conversationId, status) => {
        try {
            const updatedConv = await facebookService.updateLeadStatus(conversationId, status);

            // Update local state immediately for responsive UI
            if (selectedConversation?.conversation_id === conversationId) {
                setSelectedConversation(prev => ({
                    ...prev,
                    lead_status: status
                }));
            }

            // Update conversations list
            setConversations(prev => prev.map(conv =>
                conv.conversation_id === conversationId
                    ? { ...conv, lead_status: status }
                    : conv
            ));

            return updatedConv;
        } catch (err) {
            console.error('Error updating lead status:', err);
            setError(err.message);
            return null;
        }
    }, [selectedConversation]);

    // Bulk update lead status for multiple conversations
    const bulkUpdateLeadStatus = useCallback(async (conversationIds, status) => {
        try {
            await facebookService.bulkUpdateLeadStatus(conversationIds, status);

            // Update conversations list
            setConversations(prev => prev.map(conv =>
                conversationIds.includes(conv.conversation_id)
                    ? { ...conv, lead_status: status }
                    : conv
            ));

            return true;
        } catch (err) {
            console.error('Error bulk updating lead status:', err);
            setError(err.message);
            return false;
        }
    }, []);

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

    const searchConversationsAction = useCallback(async (searchTerm, pageId = null) => {
        if (!searchTerm || searchTerm.trim().length < 2) {
            setConversationSearchResults([]);
            return [];
        }

        try {
            setSearchingConversations(true);
            const result = await facebookService.searchConversations(searchTerm, pageId);
            setConversationSearchResults(result.conversations || []);
            return result.conversations || [];
        } catch (err) {
            console.error('Error searching conversations:', err);
            setError(err.message);
            return [];
        } finally {
            setSearchingConversations(false);
        }
    }, []);

    const clearConversationSearch = useCallback(() => {
        setConversationSearchResults([]);
    }, []);

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

                const isFromPage = payload.new?.is_from_page === true;
                const conversationId = payload.new?.conversation_id;
                if (!conversationId) {
                    return;
                }

                // If viewing the same conversation, add the message
                if (selectedConversation &&
                    conversationId === selectedConversation.conversation_id) {
                    setMessages(prev => [...prev, payload.new]);
                }

                // Update the conversation in the list in-place (don't reset pagination)
                setConversations(prev => {
                    const exists = prev.some(conv => conv.conversation_id === conversationId);
                    if (exists) {
                        // Update existing conversation
                        return prev.map(conv => {
                            if (conv.conversation_id !== conversationId) return conv;

                            const isActiveConversation = selectedConversation?.conversation_id === conversationId;
                            const shouldIncrementUnread = !isFromPage && !isActiveConversation;
                            const nextUnreadCount = shouldIncrementUnread
                                ? (conv.unread_count || 0) + 1
                                : conv.unread_count || 0;

                            return {
                                ...conv,
                                last_message_text: payload.new.message_text || '[Attachment]',
                                last_message_time: payload.new.timestamp,
                                last_message_from_page: isFromPage,
                                unread_count: nextUnreadCount
                            };
                        });
                    }
                    // Conversation not in current list - will be handled by conversation subscription
                    return prev;
                });

                if (!isFromPage) {
                    const isActiveConversation = selectedConversation?.conversation_id === conversationId;
                    if (!isActiveConversation) {
                        setUnreadCount(prev => prev + 1);
                    }
                }

                // If conversation is not in the list, trigger silent refresh to bring it to top
                setConversations(prev => {
                    const exists = prev.some(conv => conv.conversation_id === conversationId);
                    if (!exists) {
                        // Trigger async refresh (via setTimeout to avoid blocking)
                        setTimeout(() => {
                            facebookService.getConversationsWithPagination(null, 1, 8)
                                .then(result => {
                                    setConversations(result.conversations);
                                    setConversationPage(1);
                                    setHasMoreConversations(result.hasMore);
                                    setTotalConversations(result.total);
                                    console.log('[REALTIME] Refreshed conversations after new message');
                                })
                                .catch(err => console.error('Error refreshing conversations:', err));
                        }, 100);
                    }
                    return prev;
                });
            });

            // Subscribe to conversation updates
            conversationSubscription = facebookService.subscribeToConversations((payload) => {
                console.log('Conversation updated:', payload);

                if (payload.new) {
                    setConversations(prev => {
                        // Check if conversation already exists by conversation_id
                        const existingByConvId = prev.findIndex(
                            conv => conv.conversation_id === payload.new.conversation_id
                        );

                        // Also check by participant_id to prevent duplicates from same contact
                        const existingByParticipant = prev.findIndex(
                            conv => conv.participant_id === payload.new.participant_id &&
                                conv.conversation_id !== payload.new.conversation_id
                        );

                        if (existingByConvId >= 0) {
                            // Update existing conversation and move to top
                            const updated = [...prev];
                            updated[existingByConvId] = { ...updated[existingByConvId], ...payload.new };
                            // Move to top if it has a new message
                            if (payload.eventType === 'INSERT' || payload.new.last_message_time) {
                                const [movedConv] = updated.splice(existingByConvId, 1);
                                return [movedConv, ...updated];
                            }
                            return updated;
                        } else if (existingByParticipant >= 0) {
                            // Same participant with different conversation_id - update the existing one
                            // This handles cases where Facebook creates new thread IDs for same contact
                            console.log('[DEDUP] Same participant, updating existing:', payload.new.participant_id);
                            const updated = [...prev];
                            // Use the newer conversation_id but keep it in place
                            updated[existingByParticipant] = {
                                ...updated[existingByParticipant],
                                ...payload.new
                            };
                            // Move to top
                            const [movedConv] = updated.splice(existingByParticipant, 1);
                            return [movedConv, ...updated];
                        } else {
                            // NEW conversation - add to the top of the list
                            console.log('Adding new conversation to list:', payload.new.conversation_id);
                            return [payload.new, ...prev];
                        }
                    });
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

    // Auto-refresh conversations every 30 seconds to catch name updates and new messages
    useEffect(() => {
        const refreshInterval = setInterval(() => {
            // Silent refresh - doesn't show loading spinner
            loadConversations(null, true, true);
        }, 30000); // 30 seconds

        return () => clearInterval(refreshInterval);
    }, [loadConversations]);

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
        conversationInsights,

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
        refreshMessages,
        sendMessage,
        sendVideoMessage,
        // Lead status
        sendMediaMessage,
        sendBookingButton,
        sendPropertyCard,
        loadMoreMessages,
        searchMessages: searchMessagesAction,
        searchConversations: searchConversationsAction,
        syncAllConversations,
        syncMessages,
        linkToClient,
        refreshContactName,
        setContactName,
        assignToUser,
        updateLeadStatus,
        bulkUpdateLeadStatus,
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

        // Conversation search results
        conversationSearchResults,
        searchingConversations,
        clearConversationSearch,

        // Utilities
        clearError: () => setError(null),
        clearSearch: () => { setSearchResults([]); setMessageSearch(''); }
    };
}

export default useFacebookMessenger;

