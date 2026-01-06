import { getSupabaseClient } from './supabase';

// Helper to get supabase client
const getSupabase = () => {
    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not initialized');
    }
    return client;
};

/**
 * Facebook Messenger Service
 * Handles all Facebook API interactions and data management
 */

const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

class FacebookService {
    /**
     * Get Facebook settings from database
     */
    async getSettings() {
        try {
            const { data, error } = await getSupabase()
                .from('facebook_settings')
                .select('*');

            if (error) throw error;

            const settings = {};
            data?.forEach(row => {
                settings[row.setting_key] = row.setting_value;
            });
            return settings;
        } catch (error) {
            console.error('Error fetching Facebook settings:', error);
            return {};
        }
    }

    /**
     * Save Facebook settings
     */
    async saveSettings(key, value, userId) {
        try {
            const { error } = await getSupabase()
                .from('facebook_settings')
                .upsert({
                    setting_key: key,
                    setting_value: value,
                    updated_by: userId,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'setting_key' });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error saving Facebook settings:', error);
            throw error;
        }
    }

    /**
     * Get connected Facebook pages
     */
    async getConnectedPages() {
        try {
            const { data, error } = await getSupabase()
                .from('facebook_pages')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching connected pages:', error);
            return [];
        }
    }

    /**
     * Connect a new Facebook page
     */
    async connectPage(pageData, userId) {
        try {
            const { data, error } = await getSupabase()
                .from('facebook_pages')
                .upsert({
                    page_id: pageData.id,
                    page_name: pageData.name,
                    page_access_token: pageData.access_token,
                    page_picture_url: pageData.picture?.data?.url,
                    connected_by: userId,
                    is_active: true,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'page_id' })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error connecting Facebook page:', error);
            throw error;
        }
    }

    /**
     * Disconnect a Facebook page
     */
    async disconnectPage(pageId) {
        try {
            const { error } = await getSupabase()
                .from('facebook_pages')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('page_id', pageId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error disconnecting Facebook page:', error);
            throw error;
        }
    }

    /**
     * Fetch conversations from Facebook Graph API with pagination
     */
    async fetchConversationsFromFacebook(pageId, accessToken) {
        try {
            const allConversations = [];
            let url = `${GRAPH_API_BASE}/${pageId}/conversations?fields=participants,updated_time,unread_count,messages.limit(1){message,from,created_time}&limit=100&access_token=${accessToken}`;

            // Paginate through all conversations
            while (url) {
                const response = await fetch(url);

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error?.message || 'Failed to fetch conversations');
                }

                const data = await response.json();
                allConversations.push(...(data.data || []));

                // Get next page URL if exists
                url = data.paging?.next || null;

                // Safety limit to prevent infinite loops
                if (allConversations.length >= 500) break;
            }

            return { data: allConversations };
        } catch (error) {
            console.error('Error fetching conversations from Facebook:', error);
            throw error;
        }
    }

    /**
     * Sync conversations from Facebook to database
     */
    async syncConversations(pageId) {
        try {
            // Get page access token
            const pages = await this.getConnectedPages();
            const page = pages.find(p => p.page_id === pageId);
            if (!page) throw new Error('Page not found');

            const fbData = await this.fetchConversationsFromFacebook(pageId, page.page_access_token);

            const conversations = [];
            for (const conv of fbData.data || []) {
                // Find the participant that isn't the page
                const participant = conv.participants?.data?.find(p => p.id !== pageId);
                const lastMessage = conv.messages?.data?.[0];

                const conversationData = {
                    page_id: pageId,
                    conversation_id: conv.id,
                    participant_id: participant?.id || 'unknown',
                    participant_name: participant?.name,
                    last_message_text: lastMessage?.message,
                    last_message_time: lastMessage?.created_time,
                    unread_count: conv.unread_count || 0,
                    updated_at: new Date().toISOString()
                };

                const { data, error } = await getSupabase()
                    .from('facebook_conversations')
                    .upsert(conversationData, { onConflict: 'conversation_id' })
                    .select()
                    .single();

                if (!error && data) {
                    conversations.push(data);
                }
            }

            // Update last synced time
            await getSupabase()
                .from('facebook_pages')
                .update({ last_synced_at: new Date().toISOString() })
                .eq('page_id', pageId);

            return conversations;
        } catch (error) {
            console.error('Error syncing conversations:', error);
            throw error;
        }
    }

    /**
     * Get conversations from database
     */
    async getConversations(pageId = null) {
        try {
            let query = getSupabase()
                .from('facebook_conversations')
                .select(`
          *,
          linked_client:linked_client_id(id, client_name, business_name),
          assigned_user:assigned_to(id, name, email)
        `)
                .order('last_message_time', { ascending: false });

            if (pageId) {
                query = query.eq('page_id', pageId);
            }

            const { data, error } = await query;

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching conversations:', error);
            return [];
        }
    }

    /**
     * Get conversations with pagination
     */
    async getConversationsWithPagination(pageId = null, page = 1, limit = 20) {
        try {
            const offset = (page - 1) * limit;

            let query = getSupabase()
                .from('facebook_conversations')
                .select(`
                    *,
                    linked_client:linked_client_id(id, client_name, business_name),
                    assigned_user:assigned_to(id, name, email)
                `, { count: 'exact' })
                .or('is_archived.is.null,is_archived.eq.false') // Exclude archived
                .order('last_message_time', { ascending: false, nullsFirst: false })
                .range(offset, offset + limit - 1);

            if (pageId) {
                query = query.eq('page_id', pageId);
            }

            const { data, error, count } = await query;

            if (error) {
                console.error('Pagination query error:', error);
                throw error;
            }

            console.log(`Loaded page ${page}: ${data?.length || 0} conversations, total: ${count}, hasMore: ${(offset + limit) < (count || 0)}`);

            return {
                conversations: data || [],
                total: count || 0,
                page,
                hasMore: (offset + limit) < (count || 0)
            };
        } catch (error) {
            console.error('Error fetching paginated conversations:', error);
            return { conversations: [], total: 0, page: 1, hasMore: false };
        }
    }

    /**
     * Fetch messages for a conversation from Facebook
     */
    async fetchMessagesFromFacebook(conversationId, accessToken) {
        try {
            const response = await fetch(
                `${GRAPH_API_BASE}/${conversationId}/messages?fields=message,from,created_time,attachments&limit=50&access_token=${accessToken}`
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to fetch messages');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching messages from Facebook:', error);
            throw error;
        }
    }

    /**
     * Sync messages for a conversation
     */
    async syncMessages(conversationId, pageId) {
        try {
            // Get page access token
            const pages = await this.getConnectedPages();
            const page = pages.find(p => p.page_id === pageId);
            if (!page) throw new Error('Page not found');

            const fbData = await this.fetchMessagesFromFacebook(conversationId, page.page_access_token);

            const messages = [];
            for (const msg of fbData.data || []) {
                const messageData = {
                    conversation_id: conversationId,
                    message_id: msg.id,
                    sender_id: msg.from?.id,
                    sender_name: msg.from?.name,
                    is_from_page: msg.from?.id === pageId,
                    message_text: msg.message,
                    attachments: msg.attachments?.data || [],
                    timestamp: msg.created_time
                };

                const { data, error } = await getSupabase()
                    .from('facebook_messages')
                    .upsert(messageData, { onConflict: 'message_id' })
                    .select()
                    .single();

                if (!error && data) {
                    messages.push(data);
                }
            }

            return messages;
        } catch (error) {
            console.error('Error syncing messages:', error);
            throw error;
        }
    }

    /**
     * Get messages for a conversation from database
     */
    async getMessages(conversationId) {
        try {
            const { data, error } = await getSupabase()
                .from('facebook_messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('timestamp', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching messages:', error);
            return [];
        }
    }

    /**
     * Send a message via Facebook Graph API
     */
    async sendMessage(pageId, recipientId, messageText) {
        try {
            // Get page access token
            const pages = await this.getConnectedPages();
            const page = pages.find(p => p.page_id === pageId);
            if (!page) throw new Error('Page not found');

            const response = await fetch(
                `${GRAPH_API_BASE}/${pageId}/messages?access_token=${page.page_access_token}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recipient: { id: recipientId },
                        message: { text: messageText }
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to send message');
            }

            return await response.json();
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    /**
     * Send a message with MESSAGE_TAG for messaging outside 24-hour window
     * Uses ACCOUNT_UPDATE tag for bulk/automated messages
     */
    async sendMessageWithTag(pageId, recipientId, messageText, tag = 'ACCOUNT_UPDATE') {
        try {
            const pages = await this.getConnectedPages();
            const page = pages.find(p => p.page_id === pageId);
            if (!page) throw new Error('Page not found');

            const response = await fetch(
                `${GRAPH_API_BASE}/${pageId}/messages?access_token=${page.page_access_token}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recipient: { id: recipientId },
                        message: { text: messageText },
                        messaging_type: 'MESSAGE_TAG',
                        tag: tag
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to send tagged message');
            }

            return await response.json();
        } catch (error) {
            console.error('Error sending tagged message:', error);
            throw error;
        }
    }

    /**
     * Link a conversation to a client
     */
    async linkConversationToClient(conversationId, clientId) {
        try {
            const { error } = await getSupabase()
                .from('facebook_conversations')
                .update({ linked_client_id: clientId, updated_at: new Date().toISOString() })
                .eq('conversation_id', conversationId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error linking conversation to client:', error);
            throw error;
        }
    }

    /**
     * Assign conversation to a user
     */
    async assignConversation(conversationId, userId) {
        try {
            const { error } = await getSupabase()
                .from('facebook_conversations')
                .update({ assigned_to: userId, updated_at: new Date().toISOString() })
                .eq('conversation_id', conversationId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error assigning conversation:', error);
            throw error;
        }
    }

    /**
     * Mark messages as read
     */
    async markMessagesAsRead(conversationId) {
        try {
            const { error } = await getSupabase()
                .from('facebook_messages')
                .update({ is_read: true })
                .eq('conversation_id', conversationId)
                .eq('is_read', false);

            if (error) throw error;

            // Also reset unread count on conversation
            await getSupabase()
                .from('facebook_conversations')
                .update({ unread_count: 0, updated_at: new Date().toISOString() })
                .eq('conversation_id', conversationId);

            return true;
        } catch (error) {
            console.error('Error marking messages as read:', error);
            throw error;
        }
    }

    /**
     * Get total unread count across all conversations
     */
    async getTotalUnreadCount() {
        try {
            const { data, error } = await getSupabase()
                .from('facebook_conversations')
                .select('unread_count');

            if (error) throw error;

            return data?.reduce((sum, conv) => sum + (conv.unread_count || 0), 0) || 0;
        } catch (error) {
            console.error('Error getting unread count:', error);
            return 0;
        }
    }

    /**
     * Subscribe to real-time message updates
     */
    subscribeToMessages(callback) {
        return getSupabase()
            .channel('facebook_messages_changes')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'facebook_messages' },
                callback
            )
            .subscribe();
    }

    /**
     * Subscribe to real-time conversation updates
     */
    subscribeToConversations(callback) {
        return getSupabase()
            .channel('facebook_conversations_changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'facebook_conversations' },
                callback
            )
            .subscribe();
    }

    /**
     * Send media attachment via Facebook Graph API
     * @param {string} pageId - Page ID
     * @param {string} recipientId - Recipient PSID
     * @param {File} file - File to upload (max 25MB)
     * @param {string} mediaType - 'image', 'video', 'audio', or 'file'
     */
    async sendMediaMessage(pageId, recipientId, file, mediaType = 'file') {
        try {
            // Validate file size (25MB max)
            const maxSize = 25 * 1024 * 1024;
            if (file.size > maxSize) {
                throw new Error('File size exceeds 25MB limit');
            }

            // Get page access token
            const pages = await this.getConnectedPages();
            const page = pages.find(p => p.page_id === pageId);
            if (!page) throw new Error('Page not found');

            // First, upload the file to Facebook
            const formData = new FormData();
            formData.append('message', JSON.stringify({
                attachment: {
                    type: mediaType,
                    payload: { is_reusable: true }
                }
            }));
            formData.append('filedata', file);

            const uploadResponse = await fetch(
                `${GRAPH_API_BASE}/me/message_attachments?access_token=${page.page_access_token}`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.error?.message || 'Failed to upload media');
            }

            const uploadData = await uploadResponse.json();
            const attachmentId = uploadData.attachment_id;

            // Send the attachment to the recipient
            const sendResponse = await fetch(
                `${GRAPH_API_BASE}/${pageId}/messages?access_token=${page.page_access_token}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recipient: { id: recipientId },
                        message: {
                            attachment: {
                                type: mediaType,
                                payload: { attachment_id: attachmentId }
                            }
                        }
                    })
                }
            );

            if (!sendResponse.ok) {
                const errorData = await sendResponse.json();
                throw new Error(errorData.error?.message || 'Failed to send media');
            }

            return await sendResponse.json();
        } catch (error) {
            console.error('Error sending media message:', error);
            throw error;
        }
    }

    /**
     * Search messages in a conversation or across all conversations
     */
    async searchMessages(searchTerm, conversationId = null) {
        try {
            let query = getSupabase()
                .from('facebook_messages')
                .select('*, conversation:conversation_id(participant_name)')
                .ilike('message_text', `%${searchTerm}%`)
                .order('timestamp', { ascending: false })
                .limit(50);

            if (conversationId) {
                query = query.eq('conversation_id', conversationId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error searching messages:', error);
            return [];
        }
    }

    /**
     * Get messages with pagination for loading history
     */
    async getMessagesWithPagination(conversationId, page = 1, limit = 50) {
        try {
            const offset = (page - 1) * limit;

            const { data, error, count } = await getSupabase()
                .from('facebook_messages')
                .select('*', { count: 'exact' })
                .eq('conversation_id', conversationId)
                .order('timestamp', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) throw error;

            return {
                messages: (data || []).reverse(), // Reverse to show oldest first
                total: count || 0,
                page,
                hasMore: (offset + limit) < (count || 0)
            };
        } catch (error) {
            console.error('Error fetching paginated messages:', error);
            return { messages: [], total: 0, page: 1, hasMore: false };
        }
    }

    /**
     * Send "Book Appointment" button template
     */
    async sendBookingButton(pageId, recipientId, bookingUrl) {
        try {
            const pages = await this.getConnectedPages();
            const page = pages.find(p => p.page_id === pageId);
            if (!page) throw new Error('Page not found');

            const response = await fetch(
                `${GRAPH_API_BASE}/${pageId}/messages?access_token=${page.page_access_token}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recipient: { id: recipientId },
                        message: {
                            attachment: {
                                type: 'template',
                                payload: {
                                    template_type: 'button',
                                    text: '📅 Book an Appointment\nChoose a convenient date and time that works for you. Click below to view available slots.',
                                    buttons: [{
                                        type: 'web_url',
                                        url: bookingUrl,
                                        title: '📆 Book Now',
                                        webview_height_ratio: 'tall',
                                        messenger_extensions: false
                                    }]
                                }
                            }
                        }
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to send booking button');
            }

            return await response.json();
        } catch (error) {
            console.error('Error sending booking button:', error);
            throw error;
        }
    }


    /**
     * Save AI analysis results to conversation
     */
    async saveAIAnalysis(conversationId, analysis) {
        try {
            const updateData = {
                ai_analysis: analysis,
                ai_notes: analysis.notes || null,
                extracted_details: analysis.details || {},
                meeting_detected: analysis.meeting?.hasMeeting || false,
                meeting_datetime: analysis.meeting?.datetime || null,
                updated_at: new Date().toISOString()
            };

            const { error } = await getSupabase()
                .from('facebook_conversations')
                .update(updateData)
                .eq('conversation_id', conversationId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error saving AI analysis:', error);
            throw error;
        }
    }

    /**
     * Find existing client by name or contact details
     */
    async findExistingClient(participantName, details = {}) {
        try {
            let query = getSupabase()
                .from('clients')
                .select('*');

            // Try to match by business name, client name, or contact details
            const searchTerms = [
                participantName,
                details.businessName,
                details.facebookPage,
                details.phone,
                details.email
            ].filter(Boolean);

            if (searchTerms.length === 0) return null;

            // Search across multiple fields
            const { data, error } = await query
                .or(searchTerms.map(term =>
                    `client_name.ilike.%${term}%,business_name.ilike.%${term}%,contact_details.ilike.%${term}%`
                ).join(','));

            if (error) throw error;
            return data?.[0] || null;
        } catch (error) {
            console.error('Error finding existing client:', error);
            return null;
        }
    }

    /**
     * Transfer Facebook contact to client pipeline
     */
    async transferToClient(conversationId, clientData, userId) {
        try {
            // Get conversation details
            const { data: conv, error: convError } = await getSupabase()
                .from('facebook_conversations')
                .select('*')
                .eq('conversation_id', conversationId)
                .single();

            if (convError) throw convError;

            // Create new client
            const newClient = {
                client_name: clientData.clientName || conv.participant_name,
                business_name: clientData.businessName || conv.extracted_details?.businessName,
                contact_details: clientData.contactDetails || conv.participant_id,
                facebook_page: clientData.facebookPage || conv.extracted_details?.facebookPage,
                niche: clientData.niche || conv.extracted_details?.niche,
                notes: conv.ai_notes || clientData.notes || '',
                phase: 'booked',
                package: clientData.package || null,
                payment_status: 'unpaid',
                assigned_to: userId,
                created_by: userId,
                source: 'facebook_messenger',
                created_at: new Date().toISOString()
            };

            const { data: client, error: clientError } = await getSupabase()
                .from('clients')
                .insert(newClient)
                .select()
                .single();

            if (clientError) throw clientError;

            // Link conversation to new client
            await this.linkConversationToClient(conversationId, client.id);

            return client;
        } catch (error) {
            console.error('Error transferring to client:', error);
            throw error;
        }
    }

    /**
     * Update existing client/lead with conversation data
     */
    async updateExistingLead(conversationId, clientId, updates = {}) {
        try {
            // Get conversation for context
            const { data: conv } = await getSupabase()
                .from('facebook_conversations')
                .select('*')
                .eq('conversation_id', conversationId)
                .single();

            // Prepare update data
            const updateData = {
                updated_at: new Date().toISOString()
            };

            // Only update if new data is provided
            if (updates.notes || conv?.ai_notes) {
                updateData.notes = updates.notes || conv.ai_notes;
            }
            if (updates.facebookPage || conv?.extracted_details?.facebookPage) {
                updateData.facebook_page = updates.facebookPage || conv.extracted_details?.facebookPage;
            }
            if (updates.niche || conv?.extracted_details?.niche) {
                updateData.niche = updates.niche || conv.extracted_details?.niche;
            }
            if (updates.contactDetails || conv?.extracted_details?.phone) {
                updateData.contact_details = updates.contactDetails || conv.extracted_details?.phone;
            }

            const { data, error } = await getSupabase()
                .from('clients')
                .update(updateData)
                .eq('id', clientId)
                .select()
                .single();

            if (error) throw error;

            // Link conversation to client if not already
            await this.linkConversationToClient(conversationId, clientId);

            return data;
        } catch (error) {
            console.error('Error updating existing lead:', error);
            throw error;
        }
    }

    /**
     * Create meeting from AI-detected meeting
     */
    async createMeetingFromAI(conversationId, meetingData, userId) {
        try {
            // Get conversation
            const { data: conv } = await getSupabase()
                .from('facebook_conversations')
                .select('*')
                .eq('conversation_id', conversationId)
                .single();

            // Create meeting/event
            const meeting = {
                title: `Meeting with ${conv.participant_name || 'Facebook Contact'}`,
                description: `Auto-booked from Facebook Messenger conversation.\n\n${conv.ai_notes || ''}`,
                start_time: meetingData.datetime || conv.meeting_datetime,
                client_id: conv.linked_client_id,
                created_by: userId,
                type: 'meeting',
                attendees: [userId],
                source: 'ai_detected',
                created_at: new Date().toISOString()
            };

            const { data, error } = await getSupabase()
                .from('events')
                .insert(meeting)
                .select()
                .single();

            if (error) throw error;

            // Update conversation with meeting ID
            await getSupabase()
                .from('facebook_conversations')
                .update({
                    auto_booked_meeting_id: data.id,
                    updated_at: new Date().toISOString()
                })
                .eq('conversation_id', conversationId);

            return data;
        } catch (error) {
            console.error('Error creating meeting from AI:', error);
            throw error;
        }
    }

    /**
     * Get AI analysis for a conversation
     */
    async getAIAnalysis(conversationId) {
        try {
            const { data, error } = await getSupabase()
                .from('facebook_conversations')
                .select('ai_analysis, ai_notes, extracted_details, meeting_detected, meeting_datetime, auto_booked_meeting_id')
                .eq('conversation_id', conversationId)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting AI analysis:', error);
            return null;
        }
    }

    // ============================================
    // ARCHIVE / DELETE CONVERSATIONS
    // ============================================

    /**
     * Archive a conversation (soft delete)
     */
    async archiveConversation(conversationId) {
        try {
            const { error } = await getSupabase()
                .from('facebook_conversations')
                .update({
                    is_archived: true,
                    archived_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('conversation_id', conversationId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error archiving conversation:', error);
            throw error;
        }
    }

    /**
     * Restore an archived conversation
     */
    async restoreConversation(conversationId) {
        try {
            const { error } = await getSupabase()
                .from('facebook_conversations')
                .update({
                    is_archived: false,
                    archived_at: null,
                    updated_at: new Date().toISOString()
                })
                .eq('conversation_id', conversationId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error restoring conversation:', error);
            throw error;
        }
    }

    /**
     * Delete a conversation permanently
     */
    async deleteConversation(conversationId) {
        try {
            // First delete all messages for this conversation
            await getSupabase()
                .from('facebook_messages')
                .delete()
                .eq('conversation_id', conversationId);

            // Then delete the conversation itself
            const { error } = await getSupabase()
                .from('facebook_conversations')
                .delete()
                .eq('conversation_id', conversationId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting conversation:', error);
            throw error;
        }
    }

    /**
     * Get archived conversations
     */
    async getArchivedConversations(pageId = null) {
        try {
            let query = getSupabase()
                .from('facebook_conversations')
                .select('*')
                .eq('is_archived', true)
                .order('archived_at', { ascending: false });

            if (pageId) {
                query = query.eq('page_id', pageId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching archived conversations:', error);
            return [];
        }
    }

    // ============================================
    // TAGS MANAGEMENT
    // ============================================

    /**
     * Get all tags for a page
     */
    async getTags(pageId) {
        try {
            const { data, error } = await getSupabase()
                .from('conversation_tags')
                .select('*')
                .eq('page_id', pageId)
                .order('name');

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching tags:', error);
            return [];
        }
    }

    /**
     * Create a new tag
     */
    async createTag(pageId, name, color = '#a855f7', userId = null) {
        try {
            const { data, error } = await getSupabase()
                .from('conversation_tags')
                .insert({
                    page_id: pageId,
                    name,
                    color,
                    created_by: userId
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating tag:', error);
            throw error;
        }
    }

    /**
     * Delete a tag
     */
    async deleteTag(tagId) {
        try {
            const { error } = await getSupabase()
                .from('conversation_tags')
                .delete()
                .eq('id', tagId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting tag:', error);
            throw error;
        }
    }

    /**
     * Assign a tag to a conversation
     */
    async assignTag(conversationId, tagId, userId = null) {
        try {
            const { data, error } = await getSupabase()
                .from('conversation_tag_assignments')
                .insert({
                    conversation_id: conversationId,
                    tag_id: tagId,
                    assigned_by: userId
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error assigning tag:', error);
            throw error;
        }
    }

    /**
     * Remove a tag from a conversation
     */
    async removeTag(conversationId, tagId) {
        try {
            const { error } = await getSupabase()
                .from('conversation_tag_assignments')
                .delete()
                .eq('conversation_id', conversationId)
                .eq('tag_id', tagId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error removing tag:', error);
            throw error;
        }
    }

    /**
     * Get tags for a conversation
     */
    async getConversationTags(conversationId) {
        try {
            const { data, error } = await getSupabase()
                .from('conversation_tag_assignments')
                .select('tag:tag_id(*)')
                .eq('conversation_id', conversationId);

            if (error) throw error;
            return (data || []).map(d => d.tag);
        } catch (error) {
            console.error('Error fetching conversation tags:', error);
            return [];
        }
    }

    /**
     * Get conversations by tag
     */
    async getConversationsByTag(tagId) {
        try {
            const { data, error } = await getSupabase()
                .from('conversation_tag_assignments')
                .select('conversation:conversation_id(*)')
                .eq('tag_id', tagId);

            if (error) throw error;
            return (data || []).map(d => d.conversation);
        } catch (error) {
            console.error('Error fetching conversations by tag:', error);
            return [];
        }
    }

    // ============================================
    // BULK MESSAGING
    // ============================================

    /**
     * Send bulk message to multiple recipients
     * @param {string} pageId - Page ID
     * @param {string} filterType - 'all', 'booked', 'unbooked', 'pipeline', 'not_pipeline', 'tag'
     * @param {string} messageText - Message content
     * @param {string} filterValue - Optional filter value (tag ID)
     */
    async sendBulkMessage(pageId, filterType, messageText, filterValue = null, userId = null) {
        try {
            // Get recipients based on filter
            let query = getSupabase()
                .from('facebook_conversations')
                .select('conversation_id, participant_id')
                .eq('page_id', pageId)
                .eq('is_archived', false);

            // Apply filters
            switch (filterType) {
                case 'booked':
                    query = query.not('linked_client_id', 'is', null);
                    break;
                case 'unbooked':
                    query = query.is('linked_client_id', null);
                    break;
                case 'pipeline':
                    query = query.not('linked_client_id', 'is', null);
                    break;
                case 'not_pipeline':
                    query = query.is('linked_client_id', null);
                    break;
                case 'tag':
                    if (filterValue) {
                        const tagConvs = await this.getConversationsByTag(filterValue);
                        const convIds = tagConvs.map(c => c.conversation_id);
                        query = query.in('conversation_id', convIds);
                    }
                    break;
            }

            const { data: recipients, error: recipientError } = await query;
            if (recipientError) throw recipientError;

            if (!recipients || recipients.length === 0) {
                return { success: true, sent: 0, failed: 0, message: 'No recipients found' };
            }

            // Log the bulk message
            const { data: bulkLog } = await getSupabase()
                .from('bulk_messages')
                .insert({
                    page_id: pageId,
                    message_text: messageText,
                    filter_type: filterType,
                    filter_value: filterValue,
                    recipients_count: recipients.length,
                    status: 'sending',
                    sent_by: userId
                })
                .select()
                .single();

            // Send messages
            let sent = 0;
            let failed = 0;

            for (const recipient of recipients) {
                try {
                    // Use ACCOUNT_UPDATE tag for bulk/automated messages
                    await this.sendMessageWithTag(pageId, recipient.participant_id, messageText, 'ACCOUNT_UPDATE');
                    sent++;
                    // Add small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (err) {
                    console.error(`Failed to send to ${recipient.participant_id}:`, err);
                    failed++;
                }
            }

            // Update bulk log
            if (bulkLog) {
                await getSupabase()
                    .from('bulk_messages')
                    .update({
                        sent_count: sent,
                        failed_count: failed,
                        status: 'completed',
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', bulkLog.id);
            }

            return { success: true, sent, failed, total: recipients.length };
        } catch (error) {
            console.error('Error sending bulk message:', error);
            throw error;
        }
    }

    /**
     * Get bulk message history
     */
    async getBulkMessageHistory(pageId) {
        try {
            const { data, error } = await getSupabase()
                .from('bulk_messages')
                .select('*')
                .eq('page_id', pageId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching bulk message history:', error);
            return [];
        }
    }

    // ============================================
    // SAVED REPLIES
    // ============================================

    /**
     * Get all saved replies for a page
     */
    async getSavedReplies(pageId) {
        try {
            const { data, error } = await getSupabase()
                .from('saved_replies')
                .select('*')
                .eq('page_id', pageId)
                .order('usage_count', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching saved replies:', error);
            return [];
        }
    }

    /**
     * Create a new saved reply
     */
    async createSavedReply(pageId, title, content, shortcut = null, category = 'general', userId = null) {
        try {
            const { data, error } = await getSupabase()
                .from('saved_replies')
                .insert({
                    page_id: pageId,
                    title,
                    content,
                    shortcut,
                    category,
                    created_by: userId
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating saved reply:', error);
            throw error;
        }
    }

    /**
     * Update a saved reply
     */
    async updateSavedReply(replyId, updates) {
        try {
            const { data, error } = await getSupabase()
                .from('saved_replies')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', replyId)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating saved reply:', error);
            throw error;
        }
    }

    /**
     * Delete a saved reply
     */
    async deleteSavedReply(replyId) {
        try {
            const { error } = await getSupabase()
                .from('saved_replies')
                .delete()
                .eq('id', replyId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting saved reply:', error);
            throw error;
        }
    }

    /**
     * Use a saved reply (increments usage count)
     */
    async useSavedReply(replyId) {
        try {
            const { data, error } = await getSupabase()
                .rpc('increment_saved_reply_usage', { reply_id: replyId });

            if (error) {
                // If RPC doesn't exist, do a manual increment
                const { data: reply } = await getSupabase()
                    .from('saved_replies')
                    .select('usage_count')
                    .eq('id', replyId)
                    .single();

                if (reply) {
                    await getSupabase()
                        .from('saved_replies')
                        .update({ usage_count: (reply.usage_count || 0) + 1 })
                        .eq('id', replyId);
                }
            }
            return true;
        } catch (error) {
            console.error('Error incrementing saved reply usage:', error);
            return false;
        }
    }

    // ============================================
    // SCHEDULED MESSAGES
    // ============================================

    /**
     * Schedule a message for later
     */
    async scheduleMessage(pageId, messageText, scheduledFor, filterType = 'all', filterValue = null, selectedRecipients = null, mediaUrl = null, userId = null) {
        try {
            const { data, error } = await getSupabase()
                .from('scheduled_messages')
                .insert({
                    page_id: pageId,
                    message_text: messageText,
                    media_url: mediaUrl,
                    filter_type: filterType,
                    filter_value: filterValue,
                    selected_recipients: selectedRecipients,
                    scheduled_for: scheduledFor,
                    status: 'pending',
                    created_by: userId
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error scheduling message:', error);
            throw error;
        }
    }

    /**
     * Get scheduled messages for a page
     */
    async getScheduledMessages(pageId, status = null) {
        try {
            let query = getSupabase()
                .from('scheduled_messages')
                .select('*')
                .eq('page_id', pageId)
                .order('scheduled_for', { ascending: true });

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching scheduled messages:', error);
            return [];
        }
    }

    /**
     * Cancel a scheduled message
     */
    async cancelScheduledMessage(messageId) {
        try {
            const { error } = await getSupabase()
                .from('scheduled_messages')
                .update({ status: 'cancelled' })
                .eq('id', messageId)
                .eq('status', 'pending');

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error cancelling scheduled message:', error);
            throw error;
        }
    }

    // ============================================
    // ADVANCED FILTERING
    // ============================================

    /**
     * Get conversations with advanced filters
     */
    async getConversationsWithFilter(pageId, filters = {}) {
        try {
            let query = getSupabase()
                .from('facebook_conversations')
                .select(`
                    *,
                    linked_client:linked_client_id(id, client_name, business_name),
                    assigned_user:assigned_to(id, name, email)
                `)
                .eq('page_id', pageId)
                .neq('is_archived', true)
                .order('last_message_time', { ascending: false });

            // Apply filters
            if (filters.noReply) {
                // Last message is from customer (not from page)
                query = query.eq('last_message_from_page', false);
            }

            if (filters.notBooked) {
                query = query.is('has_booking', false);
            }

            if (filters.hasBooking) {
                query = query.eq('has_booking', true);
            }

            if (filters.notInPipeline) {
                query = query.is('linked_client_id', null);
            }

            if (filters.inPipeline) {
                query = query.not('linked_client_id', 'is', null);
            }

            if (filters.proposalStatus) {
                query = query.eq('proposal_status', filters.proposalStatus);
            }

            if (filters.unreadOnly) {
                query = query.gt('unread_count', 0);
            }

            const { data, error } = await query;
            if (error) throw error;

            // If filtering by tag, we need to do a secondary filter
            if (filters.tagId) {
                const tagConvs = await this.getConversationsByTag(filters.tagId);
                const tagConvIds = new Set(tagConvs.map(c => c.conversation_id));
                return (data || []).filter(c => tagConvIds.has(c.conversation_id));
            }

            return data || [];
        } catch (error) {
            console.error('Error fetching filtered conversations:', error);
            return [];
        }
    }

    /**
     * Generate AI summary for a conversation
     */
    async generateConversationSummary(conversationId) {
        try {
            // Get messages for the conversation
            const messages = await this.getMessages(conversationId);
            if (messages.length === 0) return null;

            // Build conversation text
            const conversationText = messages.map(m =>
                `${m.is_from_page ? 'Agent' : 'Customer'}: ${m.message_text}`
            ).join('\n');

            // Call AI endpoint
            const response = await fetch('/api/ai/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'summary',
                    conversationText,
                    conversationId
                })
            });

            if (!response.ok) {
                throw new Error('Failed to generate summary');
            }

            const summary = await response.json();

            // Save summary to conversation
            await getSupabase()
                .from('facebook_conversations')
                .update({
                    ai_summary: summary.summary,
                    ai_analysis: summary,
                    updated_at: new Date().toISOString()
                })
                .eq('conversation_id', conversationId);

            return summary;
        } catch (error) {
            console.error('Error generating conversation summary:', error);
            throw error;
        }
    }
}

export const facebookService = new FacebookService();
export default facebookService;

