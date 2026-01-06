import { createClient } from '@supabase/supabase-js';

// Lazy-load Supabase client to prevent initialization errors
let supabase = null;
function getSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!url || !key) {
            console.error('[WEBHOOK] Supabase URL or key not configured');
            return null;
        }
        supabase = createClient(url, key);
    }
    return supabase;
}

/**
 * Facebook Webhook Handler
 * Handles both verification (GET) and incoming messages (POST)
 */
export default async function handler(req, res) {
    try {
        // Handle GET request for webhook verification
        if (req.method === 'GET') {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];

            const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || 'TEST_TOKEN';

            console.log('[WEBHOOK] Verification attempt:', { mode, token, expectedToken: verifyToken });

            if (mode === 'subscribe' && token === verifyToken) {
                console.log('[WEBHOOK] Verified successfully');
                return res.status(200).send(challenge);
            } else {
                console.log('[WEBHOOK] Verification failed');
                return res.status(403).json({ error: 'Verification failed' });
            }
        }

        // Handle POST request for incoming messages
        if (req.method === 'POST') {
            const body = req.body;

            console.log('[WEBHOOK] POST received:', JSON.stringify(body, null, 2));

            // Check if this is a page subscription
            if (body.object === 'page') {
                // Process each entry
                for (const entry of body.entry || []) {
                    const pageId = entry.id;
                    const messaging = entry.messaging || [];

                    for (const event of messaging) {
                        try {
                            // Handle incoming message
                            if (event.message) {
                                await handleIncomingMessage(pageId, event);
                            }

                            // Handle message delivery
                            if (event.delivery) {
                                console.log('[WEBHOOK] Message delivered:', event.delivery);
                            }

                            // Handle message read
                            if (event.read) {
                                console.log('[WEBHOOK] Message read:', event.read);
                            }
                        } catch (error) {
                            console.error('[WEBHOOK] Error processing event:', error);
                        }
                    }
                }

                return res.status(200).json({ status: 'ok' });
            }

            return res.status(200).json({ status: 'ignored' });
        }

        // Method not allowed
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[WEBHOOK] Handler error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}

/**
 * Handle incoming message from user
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

    console.log(`[WEBHOOK] Incoming message from ${senderId}:`, message.text || '[attachment]');

    const db = getSupabase();
    if (!db) {
        console.error('[WEBHOOK] Database not configured, skipping save');
        return;
    }

    // Find or create conversation - look up by participant_id first (matches synced conversations)
    try {
        const { data: existingConv, error: fetchError } = await db
            .from('facebook_conversations')
            .select('*')
            .eq('participant_id', senderId)
            .eq('page_id', pageId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('[WEBHOOK] Error fetching existing conversation:', fetchError);
        }

        // Use existing conversation_id or create temporary one for new conversations
        const conversationId = existingConv?.conversation_id || `t_${senderId}`;

        const newUnreadCount = (existingConv?.unread_count || 0) + 1;

        // Upsert conversation with incremented unread count
        const { error: convError } = await db
            .from('facebook_conversations')
            .upsert({
                conversation_id: conversationId,
                page_id: pageId,
                participant_id: senderId,
                participant_name: existingConv?.participant_name || null,
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
            console.error('[WEBHOOK] Error upserting conversation:', convError);
        } else {
            console.log(`[WEBHOOK] Conversation ${conversationId} updated, unread: ${newUnreadCount}`);
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
            console.log(`[WEBHOOK] Message ${message.mid} saved successfully`);
        }
    } catch (error) {
        console.error('[WEBHOOK] Exception in handleIncomingMessage:', error);
    }
}

// Vercel config
export const config = {
    api: {
        bodyParser: true
    }
};
