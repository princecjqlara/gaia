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
     * Fetch conversations from Facebook Graph API
     */
    async fetchConversationsFromFacebook(pageId, accessToken) {
        try {
            const response = await fetch(
                `${GRAPH_API_BASE}/${pageId}/conversations?fields=participants,updated_time,unread_count,messages.limit(1){message,from,created_time}&access_token=${accessToken}`
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to fetch conversations');
            }

            return await response.json();
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
}

export const facebookService = new FacebookService();
export default facebookService;
