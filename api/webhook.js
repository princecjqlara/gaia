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
    const message = event.message;
    const timestamp = event.timestamp;

    if (!senderId || !message) {
        console.log('[WEBHOOK] Missing sender or message');
        return;
    }

    console.log(`[WEBHOOK] Message from ${senderId}: ${message.text || '[attachment]'}`);

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
            .eq('participant_id', senderId)
            .eq('page_id', pageId)
            .single();

        // Use existing conversation_id or create temporary one for new conversations
        const conversationId = existingConv?.conversation_id || `t_${senderId}`;

        const newUnreadCount = (existingConv?.unread_count || 0) + 1;

        // Upsert conversation
        const { error: convError } = await db
            .from('facebook_conversations')
            .upsert({
                conversation_id: conversationId,
                page_id: pageId,
                participant_id: senderId,
                participant_name: existingConv?.participant_name || `User ${senderId.slice(-4)}`,
                last_message_text: message.text || '[Attachment]',
                last_message_time: new Date(timestamp).toISOString(),
                last_message_from_page: false,
                unread_count: newUnreadCount,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'conversation_id',
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
                is_from_page: false,
                is_read: false
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
