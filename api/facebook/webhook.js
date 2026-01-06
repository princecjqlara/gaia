import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

/**
 * Facebook Webhook Handler
 * Handles both verification (GET) and incoming messages (POST)
 */
export default async function handler(req, res) {
    // Handle GET request for webhook verification
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || 'TEST_TOKEN';

        if (mode === 'subscribe' && token === verifyToken) {
            console.log('Webhook verified successfully');
            return res.status(200).send(challenge);
        } else {
            console.log('Webhook verification failed', { mode, token, verifyToken });
            return res.status(403).json({ error: 'Verification failed' });
        }
    }

    // Handle POST request for incoming messages
    if (req.method === 'POST') {
        const body = req.body;

        console.log('Webhook received:', JSON.stringify(body, null, 2));

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
                            console.log('Message delivered:', event.delivery);
                        }

                        // Handle message read
                        if (event.read) {
                            console.log('Message read:', event.read);
                        }
                    } catch (error) {
                        console.error('Error processing webhook event:', error);
                    }
                }
            }

            // Always return 200 to acknowledge receipt
            return res.status(200).json({ status: 'ok' });
        }

        return res.status(200).json({ status: 'ignored' });
    }

    // Method not allowed
    return res.status(405).json({ error: 'Method not allowed' });
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
        console.log('Missing sender or message');
        return;
    }

    console.log(`[WEBHOOK] Incoming message from ${senderId}:`, message.text || '[attachment]');

    // Find or create conversation
    const conversationId = `t_${senderId}`;

    try {
        // First, check if conversation exists
        const { data: existingConv, error: fetchError } = await supabase
            .from('facebook_conversations')
            .select('*')
            .eq('conversation_id', conversationId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('[WEBHOOK] Error fetching existing conversation:', fetchError);
        }

        const newUnreadCount = (existingConv?.unread_count || 0) + 1;

        // Upsert conversation with incremented unread count
        const { error: convError } = await supabase
            .from('facebook_conversations')
            .upsert({
                conversation_id: conversationId,
                page_id: pageId,
                participant_id: senderId,
                participant_name: existingConv?.participant_name || null, // Keep existing name
                last_message_text: message.text || '[Attachment]',
                last_message_time: new Date(timestamp).toISOString(),
                last_message_from_page: false, // Message is from user, not page
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
        const { error: msgError } = await supabase
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
