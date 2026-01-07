import { createClient } from '@supabase/supabase-js';

// Lazy-load Supabase client
let supabase = null;
function getSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!url || !key) {
            console.error('[WEBHOOK] Supabase not configured:', { url: !!url, key: !!key });
            return null;
        }
        supabase = createClient(url, key);
    }
    return supabase;
}

/**
 * Fetch Facebook user profile name using Graph API
 */
async function fetchFacebookUserName(userId, pageId) {
    const db = getSupabase();
    if (!db) return null;

    try {
        // Get page access token from database
        const { data: page } = await db
            .from('facebook_pages')
            .select('page_access_token')
            .eq('page_id', pageId)
            .single();

        if (!page?.page_access_token) {
            console.log('[WEBHOOK] No page access token available for user name lookup');
            return null;
        }

        // Fetch user profile from Facebook
        const response = await fetch(
            `https://graph.facebook.com/v18.0/${userId}?fields=name,first_name,last_name&access_token=${page.page_access_token}`
        );

        if (!response.ok) {
            console.log('[WEBHOOK] Failed to fetch user profile:', response.status);
            return null;
        }

        const profile = await response.json();
        const userName = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

        console.log(`[WEBHOOK] Fetched Facebook user name: ${userName}`);
        return userName || null;
    } catch (err) {
        console.error('[WEBHOOK] Error fetching user name:', err.message);
        return null;
    }
}

/**
 * Facebook Webhook Handler
 * Handles verification (GET) and incoming messages (POST)
 */
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Handle GET - Webhook Verification
        if (req.method === 'GET') {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];

            const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || 'TEST_TOKEN';

            console.log('[WEBHOOK] Verification:', { mode, token, expectedToken: VERIFY_TOKEN });

            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                console.log('[WEBHOOK] Verified successfully!');
                return res.status(200).send(challenge);
            } else {
                console.error('[WEBHOOK] Verification failed');
                return res.status(403).send('Verification failed');
            }
        }

        // Handle POST - Incoming Messages
        if (req.method === 'POST') {
            const body = req.body;

            console.log('[WEBHOOK] POST received:', JSON.stringify(body, null, 2));

            if (body.object === 'page') {
                for (const entry of body.entry || []) {
                    const pageId = entry.id;
                    const messaging = entry.messaging || [];

                    for (const event of messaging) {
                        if (event.message) {
                            await handleIncomingMessage(pageId, event);
                        }
                        if (event.postback) {
                            console.log('[WEBHOOK] Postback:', event.postback);
                        }
                    }
                }

                return res.status(200).send('EVENT_RECEIVED');
            }

            return res.status(200).send('OK');
        }

        return res.status(405).send('Method not allowed');
    } catch (error) {
        console.error('[WEBHOOK] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Save incoming message to database
 */
async function handleIncomingMessage(pageId, event) {
    const senderId = event.sender?.id;
    const recipientId = event.recipient?.id;
    const message = event.message;
    const timestamp = event.timestamp;

    if (!senderId || !message) {
        console.log('[WEBHOOK] Missing sender or message');
        return;
    }

    // Check if this is an echo (message sent FROM the page, not received)
    const isEcho = message.is_echo === true;

    // For echoes: sender is the page, recipient is the user
    // For regular messages: sender is the user, recipient is the page
    const participantId = isEcho ? recipientId : senderId;
    const isFromPage = isEcho;

    console.log(`[WEBHOOK] ${isEcho ? 'Echo' : 'Incoming'} from ${participantId}: ${message.text || '[attachment]'}`);

    const db = getSupabase();
    if (!db) {
        console.error('[WEBHOOK] Database not available - message will not be saved');
        return;
    }

    try {
        // Look up existing conversation by participant_id first (matches synced conversations)
        const { data: existingConv } = await db
            .from('facebook_conversations')
            .select('*')
            .eq('participant_id', participantId)
            .eq('page_id', pageId)
            .single();

        // Use existing conversation_id or create temporary one for new conversations
        const conversationId = existingConv?.conversation_id || `t_${participantId}`;

        // Only increment unread for messages FROM the user, not echoes
        const newUnreadCount = isFromPage ? (existingConv?.unread_count || 0) : (existingConv?.unread_count || 0) + 1;

        // Fetch real Facebook user name for new conversations (only for incoming messages)
        let participantName = existingConv?.participant_name;
        if (!participantName && !isFromPage) {
            participantName = await fetchFacebookUserName(participantId, pageId);
        }

        // Upsert conversation
        // Use participant_id + page_id as conflict key to prevent duplicate contacts
        const { error: convError } = await db
            .from('facebook_conversations')
            .upsert({
                conversation_id: conversationId,
                page_id: pageId,
                participant_id: participantId,
                participant_name: participantName || null,
                last_message_text: message.text || '[Attachment]',
                last_message_time: new Date(timestamp).toISOString(),
                last_message_from_page: isFromPage,
                unread_count: newUnreadCount,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'participant_id,page_id',
                ignoreDuplicates: false
            });

        if (convError) {
            console.error('[WEBHOOK] Error saving conversation:', convError);
        } else {
            console.log(`[WEBHOOK] Conversation ${conversationId} saved, unread: ${newUnreadCount}`);
        }

        // Save message
        const { error: msgError } = await db
            .from('facebook_messages')
            .upsert({
                message_id: message.mid,
                conversation_id: conversationId,
                sender_id: senderId,
                message_text: message.text || null,
                attachments: message.attachments || null,
                timestamp: new Date(timestamp).toISOString(),
                is_from_page: isFromPage,
                is_read: isFromPage // Echo messages are already "read"
            }, { onConflict: 'message_id' });

        if (msgError) {
            console.error('[WEBHOOK] Error saving message:', msgError);
        } else {
            console.log(`[WEBHOOK] Message ${message.mid} saved!`);
        }
    } catch (error) {
        console.error('[WEBHOOK] Exception:', error);
    }
}

export const config = {
    api: {
        bodyParser: true
    }
};
