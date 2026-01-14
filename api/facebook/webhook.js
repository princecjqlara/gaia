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
 * Fetch Facebook user profile name using Graph API
 * Note: Facebook restricts profile access - the user must have messaged the page
 * and your app needs appropriate permissions (pages_messaging)
 */
async function fetchFacebookUserName(userId, pageId) {
    const db = getSupabase();
    if (!db) {
        console.log('[WEBHOOK] No database connection for name lookup');
        return null;
    }

    try {
        // Get page access token from database
        const { data: page, error: pageError } = await db
            .from('facebook_pages')
            .select('page_access_token')
            .eq('page_id', pageId)
            .single();

        if (pageError) {
            console.error('[WEBHOOK] Error fetching page token:', pageError.message);
            return null;
        }

        if (!page?.page_access_token) {
            console.log('[WEBHOOK] No page access token available for user name lookup');
            return null;
        }

        // Try to fetch user profile from Facebook using PSID
        // This requires that the user has messaged your page
        const url = `https://graph.facebook.com/v18.0/${userId}?fields=name,first_name,last_name&access_token=${page.page_access_token}`;
        console.log(`[WEBHOOK] Fetching user profile for PSID: ${userId}`);

        const response = await fetch(url);
        const responseText = await response.text();

        console.log(`[WEBHOOK] Facebook API response status: ${response.status}`);

        if (!response.ok) {
            // Log the full error for debugging
            console.error('[WEBHOOK] Facebook API error response:', responseText);

            // Check if it's a permission error
            try {
                const errorData = JSON.parse(responseText);
                if (errorData.error?.code === 100) {
                    console.log('[WEBHOOK] User profile not accessible - Facebook privacy/permission restriction');
                } else if (errorData.error?.code === 190) {
                    console.error('[WEBHOOK] Page access token may be expired or invalid');
                } else {
                    console.error('[WEBHOOK] Facebook error:', errorData.error?.message);
                }
            } catch (e) {
                console.error('[WEBHOOK] Could not parse error response');
            }
            return null;
        }

        try {
            const profile = JSON.parse(responseText);
            const userName = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

            if (userName) {
                console.log(`[WEBHOOK] Successfully fetched user name: ${userName}`);
                return userName;
            } else {
                console.log('[WEBHOOK] Profile returned but no name fields available');
                return null;
            }
        } catch (parseError) {
            console.error('[WEBHOOK] Error parsing profile response:', parseError.message);
            return null;
        }
    } catch (err) {
        console.error('[WEBHOOK] Exception fetching user name:', err.message);
        return null;
    }
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
 * Handle incoming message from user (or echo from page)
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

    console.log(`[WEBHOOK] ${isEcho ? 'Echo' : 'Incoming'} message, participant: ${participantId}:`, message.text || '[attachment]');

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
            .eq('participant_id', participantId)
            .eq('page_id', pageId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('[WEBHOOK] Error fetching existing conversation:', fetchError);
        }

        // Use existing conversation_id or create temporary one for new conversations
        const conversationId = existingConv?.conversation_id || `t_${participantId}`;

        // Only increment unread for messages FROM the user, not echoes
        const newUnreadCount = isFromPage ? (existingConv?.unread_count || 0) : (existingConv?.unread_count || 0) + 1;

        // Try multiple sources for participant name
        let participantName = existingConv?.participant_name;

        if (!participantName && !isFromPage) {
            // Source 1: Check if Facebook included sender name in the event (some configurations do)
            const senderNameFromEvent = event.sender?.name || message.sender_name;
            if (senderNameFromEvent) {
                console.log(`[WEBHOOK] Got name from event sender: ${senderNameFromEvent}`);
                participantName = senderNameFromEvent;
            }

            // Source 2: Try to fetch from Facebook Graph API
            if (!participantName) {
                console.log(`[WEBHOOK] No name in event, attempting API fetch for participant: ${participantId}`);
                participantName = await fetchFacebookUserName(participantId, pageId);
            }

            if (participantName) {
                console.log(`[WEBHOOK] Final participant name resolved: ${participantName}`);
            } else {
                console.log(`[WEBHOOK] Could not resolve name for participant ${participantId} - will show as Unknown`);
            }
        }


        // Upsert conversation with incremented unread count
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
                is_from_page: isFromPage,
                is_read: isFromPage // Echo messages are already "read"
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
