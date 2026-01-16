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
 * Extract name from message text using common patterns
 * Examples: "I'm John", "My name is Maria", "This is Pedro here"
 */
function extractNameFromText(text) {
    if (!text || text.length < 3) return null;

    const patterns = [
        /(?:i'?m|im|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:my name is|my name's|name is|name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:this is|it's|its)\s+([A-Z][a-z]+)(?:\s+here|\s+speaking)?/i,
        /(?:hey|hi|hello),?\s+(?:this is\s+)?([A-Z][a-z]+)\s+here/i,
        /^([A-Z][a-z]+)\s+here[.!]?$/i,
        /(?:call me|you can call me)\s+([A-Z][a-z]+)/i,
        /(?:ako si|ako po si|si)\s+([A-Z][a-z]+)/i, // Filipino: "Ako si [Name]"
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const name = match[1].trim();
            // Validate: 2-25 chars, letters/spaces only, no common words (English + Filipino)
            const invalidNames = [
                // English common words
                'interested', 'here', 'yes', 'no', 'ok', 'okay', 'thanks', 'thank', 'hello', 'hi', 'hey',
                'good', 'great', 'nice', 'sure', 'fine', 'well', 'please', 'help', 'want', 'need',
                // Filipino common words that might match patterns
                'gusto', 'ako', 'ikaw', 'siya', 'kami', 'kayo', 'sila', 'tayo', 'namin', 'nila',
                'ito', 'yan', 'yun', 'dito', 'dyan', 'doon', 'sino', 'ano', 'saan', 'kailan',
                'paano', 'bakit', 'oo', 'hindi', 'wala', 'meron', 'may', 'mga', 'lang', 'din',
                'rin', 'nga', 'naman', 'pala', 'daw', 'raw', 'kasi', 'pero', 'at', 'o',
                'pwede', 'puwede', 'kaya', 'talaga', 'sobra', 'grabe', 'nako', 'hala', 'sige',
                'salamat', 'maraming', 'pasensya', 'sorry', 'kuya', 'ate', 'boss', 'sir', 'maam'
            ];
            if (name.length >= 2 && name.length <= 25 && /^[A-Za-z\s]+$/.test(name) && !invalidNames.includes(name.toLowerCase())) {
                return name;
            }
        }
    }
    return null;
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

        // Try Method 1: Direct PSID lookup
        const url = `https://graph.facebook.com/v21.0/${userId}?fields=name,first_name,last_name&access_token=${page.page_access_token}`;
        console.log(`[WEBHOOK] Fetching user profile for PSID: ${userId}`);

        const response = await fetch(url);
        const responseText = await response.text();

        console.log(`[WEBHOOK] Facebook API response status: ${response.status}`);
        console.log(`[WEBHOOK] Facebook API response: ${responseText.substring(0, 200)}`);

        if (!response.ok) {
            // Log privacy errors - this helps debugging
            try {
                const errorData = JSON.parse(responseText);
                console.log(`[WEBHOOK] Facebook API error code: ${errorData.error?.code}, message: ${errorData.error?.message?.substring(0, 100)}`);
                if (errorData.error?.code === 100) {
                    console.log('[WEBHOOK] Privacy restriction - user profile not accessible');
                } else if (errorData.error?.code === 190) {
                    console.error('[WEBHOOK] Page access token may be expired');
                }
            } catch (e) {
                // Ignore parse errors
            }
            return null;
        }

        try {
            const profile = JSON.parse(responseText);
            const userName = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

            if (userName) {
                console.log(`[WEBHOOK] ✅ Successfully fetched user name: ${userName}`);
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
 * Alternative: Fetch name from conversation participants API
 * This is how sync gets names successfully
 */
async function fetchNameFromConversation(conversationId, participantId, pageId) {
    const db = getSupabase();
    if (!db) return null;

    try {
        const { data: page } = await db
            .from('facebook_pages')
            .select('page_access_token')
            .eq('page_id', pageId)
            .single();

        if (!page?.page_access_token) return null;

        // Fetch conversation with participants (this is how sync gets names!)
        const url = `https://graph.facebook.com/v21.0/${conversationId}?fields=participants{id,name},messages.limit(5){from{id,name}}&access_token=${page.page_access_token}`;
        console.log(`[WEBHOOK] Trying conversation API for name...`);

        const response = await fetch(url);
        if (!response.ok) {
            console.log('[WEBHOOK] Conversation API failed:', response.status);
            return null;
        }

        const data = await response.json();

        // Source 1: Check participants
        const participant = data.participants?.data?.find(p => p.id === participantId);
        if (participant?.name) {
            console.log(`[WEBHOOK] ✅ Got name from conversation participants: ${participant.name}`);
            return participant.name;
        }

        // Source 2: Check message sender (from field)
        const customerMsg = data.messages?.data?.find(m => m.from?.id === participantId && m.from?.name);
        if (customerMsg?.from?.name) {
            console.log(`[WEBHOOK] ✅ Got name from message sender: ${customerMsg.from.name}`);
            return customerMsg.from.name;
        }

        console.log('[WEBHOOK] Conversation API returned no name');
        return null;
    } catch (err) {
        console.log('[WEBHOOK] Conversation API error:', err.message);
        return null;
    }
}

/**
 * Fetch the real Facebook conversation ID for a participant
 * This queries Facebook's Conversations API to find the thread ID
 */
async function fetchRealConversationId(participantId, pageId) {
    const db = getSupabase();
    if (!db) return null;

    try {
        // Get page access token
        const { data: page } = await db
            .from('facebook_pages')
            .select('page_access_token')
            .eq('page_id', pageId)
            .single();

        if (!page?.page_access_token || page.page_access_token === 'pending') {
            console.log('[WEBHOOK] No valid page access token for conversation lookup');
            return null;
        }

        // Query Facebook's conversations endpoint to find the thread with this participant
        const url = `https://graph.facebook.com/v21.0/${pageId}/conversations?fields=id,participants&access_token=${page.page_access_token}`;
        console.log(`[WEBHOOK] Fetching conversations to find thread for participant: ${participantId}`);

        const response = await fetch(url);
        if (!response.ok) {
            console.error('[WEBHOOK] Failed to fetch conversations from Facebook');
            return null;
        }

        const data = await response.json();

        // Find the conversation that includes this participant
        for (const conv of data.data || []) {
            const participants = conv.participants?.data || [];
            const hasParticipant = participants.some(p => p.id === participantId);
            if (hasParticipant) {
                console.log(`[WEBHOOK] Found real conversation ID: ${conv.id} for participant ${participantId}`);
                return conv.id;
            }
        }

        console.log(`[WEBHOOK] Conversation not found for participant ${participantId} in first page of results`);
        return null;
    } catch (err) {
        console.error('[WEBHOOK] Error fetching real conversation ID:', err.message);
        return null;
    }
}

/**
 * Facebook Webhook Handler
 * Handles verification (GET) and incoming messages (POST)
 */
export default async function handler(req, res) {
    console.log('[WEBHOOK] v2.0 - AI Auto-Response Enabled');

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

            // Only log actual message events, not delivery/read receipts
            const hasMessageEvent = body.entry?.some(e => e.messaging?.some(m => m.message));
            if (hasMessageEvent) {
                console.log('[WEBHOOK] Message received');
            }

            if (body.object === 'page') {
                for (const entry of body.entry || []) {
                    const pageId = entry.id;
                    const messaging = entry.messaging || [];

                    for (const event of messaging) {
                        // Only process actual messages, ignore delivery/read receipts
                        if (event.message) {
                            await handleIncomingMessage(pageId, event);
                        }
                        // Silently ignore delivery receipts, read receipts, typing indicators
                        // These are: event.delivery, event.read, event.typing
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
        return; // Silent return for invalid events
    }

    // Check if this is an echo (message sent FROM the page, not received)
    // Method 1: Facebook sets is_echo flag for echoed messages
    // Method 2: Sender ID matches page ID (for Business Suite messages)
    const hasEchoFlag = message.is_echo === true;
    const senderMatchesPage = String(senderId) === String(pageId);
    const isEcho = hasEchoFlag || senderMatchesPage;

    // DEBUG: Log all detection values
    console.log(`[WEBHOOK] Echo Detection: hasEchoFlag=${hasEchoFlag}, senderId=${senderId}, pageId=${pageId}, senderMatchesPage=${senderMatchesPage}, FINAL_isEcho=${isEcho}`);

    // For echoes: sender is the page, recipient is the user
    // For regular messages: sender is the user, recipient is the page
    const participantId = isEcho ? recipientId : senderId;
    const isFromPage = isEcho;

    // Additional validation: participantId should not be the page
    if (!participantId || String(participantId) === String(pageId)) {
        console.log(`[WEBHOOK] Skipping - no valid participant (participantId=${participantId}, pageId=${pageId})`);
        return;
    }

    const db = getSupabase();
    if (!db) {
        return;
    }

    // DEDUPLICATION: Check if we already processed this message
    if (message.mid) {
        const { data: existingMessage } = await db
            .from('facebook_messages')
            .select('message_id')
            .eq('message_id', message.mid)
            .single();

        if (existingMessage) {
            // Already processed this message, skip
            return;
        }
    }

    console.log(`[WEBHOOK] ${isEcho ? 'Echo' : 'Incoming'} from ${participantId}: ${(message.text || '[attachment]').substring(0, 50)}`);

    try {
        // CRITICAL: Ensure the page exists in facebook_pages before inserting conversation
        // (foreign key constraint requires this)
        const { data: existingPage } = await db
            .from('facebook_pages')
            .select('page_id')
            .eq('page_id', pageId)
            .single();

        if (!existingPage) {
            console.log(`[WEBHOOK] Page ${pageId} not in database, creating minimal entry...`);
            const { error: pageInsertError } = await db
                .from('facebook_pages')
                .insert({
                    page_id: pageId,
                    page_name: `Page ${pageId}`,
                    page_access_token: 'pending', // Will be updated when page is properly connected
                    is_active: true
                });

            if (pageInsertError) {
                console.error('[WEBHOOK] Failed to create page entry:', pageInsertError);
                // Continue anyway - the page might have been created by another request
            } else {
                console.log(`[WEBHOOK] Created minimal page entry for ${pageId}`);
            }
        }

        // Look up existing conversation by participant_id first (matches synced conversations)
        console.log(`[WEBHOOK] STEP 1: Looking up existing conversation for participant ${participantId}`);
        const { data: existingConv, error: convLookupError } = await db
            .from('facebook_conversations')
            .select('*')
            .eq('participant_id', participantId)
            .eq('page_id', pageId)
            .single();

        console.log(`[WEBHOOK] STEP 1 RESULT: existing=${!!existingConv}, error=${convLookupError?.code || 'none'}`);

        // Get conversation_id - for new conversations, try to fetch the real one from Facebook
        let conversationId = existingConv?.conversation_id;
        console.log(`[WEBHOOK] STEP 2: conversationId from existing = ${conversationId || 'null'}`);

        if (!conversationId) {
            // Try to get the real Facebook conversation ID
            console.log(`[WEBHOOK] STEP 3: Fetching real conversation ID from Facebook...`);
            try {
                const realConvId = await fetchRealConversationId(participantId, pageId);
                if (realConvId) {
                    conversationId = realConvId;
                    console.log(`[WEBHOOK] STEP 3 RESULT: Using real Facebook conversation ID: ${conversationId}`);
                } else {
                    // Fallback to temporary ID only if we can't get the real one
                    conversationId = `t_${participantId}`;
                    console.log(`[WEBHOOK] STEP 3 RESULT: Using temporary conversation ID: ${conversationId}`);
                }
            } catch (fetchErr) {
                console.error(`[WEBHOOK] STEP 3 ERROR: ${fetchErr.message}`);
                conversationId = `t_${participantId}`;
            }
        }

        // Only increment unread for messages FROM the user, not echoes
        const newUnreadCount = isFromPage ? (existingConv?.unread_count || 0) : (existingConv?.unread_count || 0) + 1;
        console.log(`[WEBHOOK] STEP 4: unreadCount = ${newUnreadCount}`);

        // Try multiple sources for participant name
        let participantName = existingConv?.participant_name;

        // Fetch name if missing, empty, or is "Unknown" (for both incoming messages AND echoes)
        const needsNameLookup = !participantName || participantName === 'Unknown' || participantName.trim() === '';
        if (needsNameLookup) {
            // Source 1: Check if Facebook included sender name in the event
            const senderNameFromEvent = event.sender?.name || event.recipient?.name || message.sender_name;
            if (senderNameFromEvent) {
                console.log(`[WEBHOOK] Got name from event: ${senderNameFromEvent}`);
                participantName = senderNameFromEvent;
            }

            // Source 2: Try to fetch from Facebook Graph API (direct profile lookup)
            if (!participantName) {
                console.log(`[WEBHOOK] Fetching name from API for participant: ${participantId}`);
                participantName = await fetchFacebookUserName(participantId, pageId);
            }

            // Source 3: Try conversation API with participants (this is how sync works!)
            // If we have a temp ID, first try to get the real conversation ID
            if (!participantName) {
                let convIdForLookup = conversationId;

                // For temporary IDs (t_xxx), try to get the real conversation ID first
                if (conversationId.startsWith('t_')) {
                    console.log(`[WEBHOOK] Temp ID detected, fetching real conversation ID for name lookup...`);
                    const realId = await fetchRealConversationId(participantId, pageId);
                    if (realId) {
                        convIdForLookup = realId;
                        // Also update our conversationId so it's saved correctly
                        conversationId = realId;
                        console.log(`[WEBHOOK] Updated to real conversation ID: ${realId}`);
                    }
                }

                if (convIdForLookup && !convIdForLookup.startsWith('t_')) {
                    console.log(`[WEBHOOK] Trying conversation API for name (sync method)...`);
                    participantName = await fetchNameFromConversation(convIdForLookup, participantId, pageId);
                }
            }

            // Source 3: Try to extract name from message content using patterns
            if (!participantName) {
                // Check current message first
                const currentMsgText = message.text || '';
                const extractedFromCurrent = extractNameFromText(currentMsgText);
                if (extractedFromCurrent) {
                    console.log(`[WEBHOOK] Extracted name from current message: ${extractedFromCurrent}`);
                    participantName = extractedFromCurrent;
                }

                // If still no name, check existing messages from this conversation
                if (!participantName && conversationId) {
                    try {
                        const { data: existingMsgs } = await db
                            .from('facebook_messages')
                            .select('message_text, is_from_page')
                            .eq('conversation_id', conversationId)
                            .eq('is_from_page', false)
                            .order('timestamp', { ascending: true })
                            .limit(10);

                        if (existingMsgs) {
                            for (const msg of existingMsgs) {
                                const extracted = extractNameFromText(msg.message_text || '');
                                if (extracted) {
                                    console.log(`[WEBHOOK] Extracted name from history: ${extracted}`);
                                    participantName = extracted;
                                    break;
                                }
                            }
                        }
                    } catch (err) {
                        console.log('[WEBHOOK] Could not check message history for name');
                    }
                }
            }

            if (participantName) {
                console.log(`[WEBHOOK] Name resolved: ${participantName}`);
            } else {
                console.log(`[WEBHOOK] Could not resolve name for ${participantId}`);
            }
        }


        // Save/update conversation - use select + insert/update pattern for robustness
        // This works regardless of whether unique constraint exists
        const isNewConversation = !existingConv;

        const conversationData = {
            conversation_id: conversationId,
            page_id: pageId,
            participant_id: participantId,
            participant_name: participantName || null,
            last_message_text: message.text || '[Attachment]',
            last_message_time: new Date(timestamp).toISOString(),
            last_message_from_page: isFromPage,
            unread_count: newUnreadCount,
            updated_at: new Date().toISOString(),
            // AUTO-ENABLE: AI is enabled by default for all contacts
            ai_enabled: existingConv?.ai_enabled ?? true,
            // Set default goal if not already set - use null for new (column is UUID type)  
            active_goal_id: existingConv?.active_goal_id || null
            // Note: goal_completed column removed - doesn't exist in database
        };

        let convError = null;

        // Use UPSERT with conversation_id as conflict key (has UNIQUE constraint)
        console.log(`[WEBHOOK] UPSERTING conversation ${conversationId} for participant ${participantId}`);
        console.log(`[WEBHOOK] Save values: isFromPage=${isFromPage}, unread_count=${newUnreadCount}, name=${participantName || 'null'}`);
        const { error, data } = await db
            .from('facebook_conversations')
            .upsert(conversationData, {
                onConflict: 'conversation_id',
                ignoreDuplicates: false
            })
            .select();

        convError = error;

        if (error) {
            console.error(`[WEBHOOK] UPSERT FAILED - Code: ${error.code}`);
            console.error(`[WEBHOOK] UPSERT FAILED - Message: ${error.message}`);
            console.error(`[WEBHOOK] UPSERT FAILED - Details: ${error.details}`);
            console.error(`[WEBHOOK] UPSERT FAILED - Hint: ${error.hint}`);
            console.error(`[WEBHOOK] Conv ID: ${conversationId}, Page: ${pageId}, Participant: ${participantId}`);
            console.error('[WEBHOOK] Aborting - conversation not saved');
            return;
        }

        console.log(`[WEBHOOK] Conversation ${conversationId} saved, unread: ${newUnreadCount}`);

        // Save message
        // For echoes (messages from page), check if already saved by app
        let sentSource = null;
        if (isFromPage) {
            // Check if this message was already saved by the app (sent via Campy)
            const { data: existingMsg } = await db
                .from('facebook_messages')
                .select('sent_source')
                .eq('message_id', message.mid)
                .single();

            if (existingMsg?.sent_source === 'app') {
                // Already saved by app, don't overwrite sent_source
                sentSource = 'app';
                console.log(`[WEBHOOK] Message ${message.mid} was sent via app`);
            } else {
                // Not sent via app = sent via Facebook Business Suite
                sentSource = 'business_suite';
                console.log(`[WEBHOOK] Message ${message.mid} was sent via Facebook Business Suite`);
            }
        }

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
                is_read: isFromPage, // Echo messages are already "read"
                sent_source: sentSource
            }, { onConflict: 'message_id' });

        if (msgError) {
            console.error('[WEBHOOK] Error saving message:', msgError);
        } else {
            console.log(`[WEBHOOK] Message ${message.mid} saved!`);
        }

        // Track engagement data for best time calculation (incoming messages only)
        if (!isFromPage) {
            const msgDate = new Date(timestamp);
            await db.from('contact_engagement').insert({
                conversation_id: conversationId,
                page_id: pageId,
                message_direction: 'inbound',
                day_of_week: msgDate.getDay(),
                hour_of_day: msgDate.getHours(),
                engagement_score: 1,
                message_timestamp: msgDate.toISOString()
            });

            // Cancel any pending follow-ups since user responded
            const { data: cancelled } = await db
                .from('ai_followup_schedule')
                .update({ status: 'cancelled', completed_at: new Date().toISOString() })
                .eq('conversation_id', conversationId)
                .eq('status', 'pending');

            if (cancelled && cancelled.length > 0) {
                console.log(`[WEBHOOK] Cancelled ${cancelled.length} pending follow-ups - user responded`);
            }
        }

        // TRIGGER AI AUTO-RESPONSE for incoming user messages (not echoes)
        if (!isFromPage && message.text) {
            console.log('[WEBHOOK] Triggering AI auto-response...');
            await triggerAIResponse(db, conversationId, pageId, existingConv);
        }
    } catch (error) {
        console.error('[WEBHOOK] Exception:', error);
    }
}

/**
 * Trigger AI auto-response for a conversation
 */
async function triggerAIResponse(db, conversationId, pageId, conversation) {
    try {
        console.log('[WEBHOOK] === AI AUTO-RESPONSE ===');

        // Skip database logging to avoid errors
        console.log('[WEBHOOK] Conversation:', conversationId, 'Page:', pageId);


        // Get AI config from settings
        const { data: settings } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        const config = settings?.value || {};

        console.log('[WEBHOOK] AI Config check:', {
            auto_respond: config.auto_respond_to_new_messages,
            conv_ai_enabled: conversation?.ai_enabled,
            human_takeover: conversation?.human_takeover,
            cooldown_until: conversation?.cooldown_until
        });

        // Check admin settings - respect all configurations
        if (config.auto_respond_to_new_messages === false) {
            console.log('[WEBHOOK] AI auto-respond disabled in admin settings');
            return;
        }

        // Check conversation-level AI settings
        if (conversation?.ai_enabled === false) {
            console.log('[WEBHOOK] AI disabled for this conversation');
            return;
        }

        // Check if human has taken over
        if (conversation?.human_takeover === true) {
            console.log('[WEBHOOK] Human takeover active - AI skipping');
            return;
        }

        // SPAM PREVENTION: Check if we already sent the last message
        // If AI/page sent the last message, don't respond again until customer replies
        const { data: lastMessages } = await db
            .from('facebook_messages')
            .select('is_from_page, timestamp')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: false })
            .limit(3);

        if (lastMessages && lastMessages.length >= 2) {
            // Count consecutive messages from page
            let consecutivePageMessages = 0;
            for (const msg of lastMessages) {
                if (msg.is_from_page) {
                    consecutivePageMessages++;
                } else {
                    break;
                }
            }

            // If we already sent 2+ consecutive messages, wait for customer to reply
            if (consecutivePageMessages >= 2) {
                console.log(`[WEBHOOK] AI already sent ${consecutivePageMessages} consecutive messages - waiting for customer reply`);
                return;
            }
        }

        // COOLDOWN: Don't respond if we responded in the last 30 seconds
        if (conversation?.last_ai_response_at) {
            const lastResponse = new Date(conversation.last_ai_response_at);
            const secondsSinceLastResponse = (Date.now() - lastResponse.getTime()) / 1000;
            if (secondsSinceLastResponse < 30) {
                console.log(`[WEBHOOK] AI cooling down - last response ${secondsSinceLastResponse}s ago`);
                return;
            }
        }

        console.log('[WEBHOOK] All checks passed - proceeding with AI response');

        // Get page access token
        const { data: page } = await db
            .from('facebook_pages')
            .select('page_access_token')
            .eq('page_id', pageId)
            .single();

        if (!page?.page_access_token) {
            console.error('[WEBHOOK] No page access token');
            return;
        }

        // Get recent messages
        const { data: messages } = await db
            .from('facebook_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: false })
            .limit(15);

        const recentMessages = (messages || []).reverse();

        // Build AI prompt with Taglish as default language
        const systemPrompt = config.system_prompt || 'You are a friendly AI sales assistant for a business. Be helpful, professional, and concise.';
        const knowledgeBase = config.knowledge_base || '';
        const faqContent = config.faq || ''; // FAQ for RAG pipeline
        const language = config.language || 'Taglish'; // Default to Taglish (Tagalog + English mix)

        // DEBUG: Log what RAG content we have
        console.log('[WEBHOOK] RAG Content Check:', {
            hasKnowledgeBase: !!knowledgeBase,
            kbLength: knowledgeBase.length,
            hasFaq: !!faqContent,
            faqLength: faqContent.length,
            language: language
        });

        let aiPrompt = `## Role
${systemPrompt}

## 🗣️ LANGUAGE (CRITICAL - MUST FOLLOW)
You MUST respond in ${language}. This is MANDATORY.
- Use Taglish (mix Filipino and English naturally in sentences)
- Use "po" and "opo" for respect
- Example: "Hello po! Kumusta? Ready na po tayo sa consultation mo!" 
- Example: "Ano po ang business mo? Gusto namin i-maximize yung ROI mo sa ads."
- NEVER respond in pure English only - always mix Filipino words.

## Platform: Facebook Messenger
Contact Name: ${conversation?.participant_name || 'Customer'}
`;

        // Add ACTIVE GOAL for the conversation
        const activeGoal = conversation?.active_goal_id || 'booking';
        const goalDescriptions = {
            'booking': 'Get the customer to book a consultation or meeting. Guide them towards scheduling.',
            'qualification': 'Qualify the lead - understand their needs, budget, and timeline.',
            'information': 'Provide information about services and answer questions helpfully.',
            'follow_up': 'Re-engage the contact and move them towards next steps.',
            'closing': 'Close the deal - confirm package selection and payment.'
        };

        aiPrompt += `
## 🎯 YOUR CURRENT GOAL (CRITICAL - This is your PRIMARY objective)
Goal: ${activeGoal.toUpperCase()}
Instructions: ${goalDescriptions[activeGoal] || 'Help the customer and guide them towards taking action.'}
Every response should move the conversation closer to achieving this goal.
`;

        // Add calendar availability for booking goals
        if (activeGoal === 'booking' || config.booking_url) {
            try {
                // Get booking settings from database
                const { data: bookingSettings } = await db
                    .from('booking_settings')
                    .select('*')
                    .eq('page_id', pageId)
                    .single();

                // Use settings or defaults
                const startTime = bookingSettings?.start_time || '09:00';
                const endTime = bookingSettings?.end_time || '17:00';
                const availableDays = bookingSettings?.available_days || [1, 2, 3, 4, 5]; // 0=Sun, 1=Mon, etc.
                const slotDuration = bookingSettings?.slot_duration || 60;

                console.log('[WEBHOOK] Using booking settings:', {
                    startTime,
                    endTime,
                    availableDays,
                    slotDuration
                });

                // Parse start/end hours
                const startHour = parseInt(startTime.split(':')[0]);
                const endHour = parseInt(endTime.split(':')[0]);

                // Get next 7 days of available slots
                const now = new Date();
                const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

                // Get existing calendar events to find conflicts
                const { data: existingEvents } = await db
                    .from('calendar_events')
                    .select('start_time, end_time')
                    .gte('start_time', now.toISOString())
                    .lte('start_time', weekFromNow.toISOString())
                    .eq('status', 'scheduled');

                // Generate available slots based on settings
                const availableSlots = [];
                for (let d = 1; d <= 7; d++) {
                    const dayDate = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
                    const dayOfWeek = dayDate.getDay();

                    // Skip if not in available days
                    if (!availableDays.includes(dayOfWeek)) continue;

                    // Check slots based on configured hours
                    for (let hour = startHour; hour < endHour; hour++) {
                        const slotStart = new Date(dayDate);
                        slotStart.setHours(hour, 0, 0, 0);

                        // Check for conflicts
                        const hasConflict = (existingEvents || []).some(e => {
                            const eventStart = new Date(e.start_time);
                            const eventEnd = new Date(e.end_time);
                            return slotStart >= eventStart && slotStart < eventEnd;
                        });

                        if (!hasConflict) {
                            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
                            const dateStr = dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            const timeStr = hour > 12 ? `${hour - 12}:00 PM` : (hour === 12 ? '12:00 PM' : `${hour}:00 AM`);
                            availableSlots.push(`${dayName} ${dateStr}, ${timeStr}`);
                        }
                    }
                }

                if (availableSlots.length > 0) {
                    aiPrompt += `
## 📅 AVAILABLE BOOKING SLOTS (Use these when customer wants to schedule)
${availableSlots.slice(0, 15).join('\n')}

When customer wants to book, suggest one of these times. If they confirm a time, respond with:
"BOOKING_CONFIRMED: [DATE] [TIME] - [CUSTOMER_NAME] - [PHONE_NUMBER if available]"
`;
                    console.log('[WEBHOOK] Added', availableSlots.length, 'available slots to prompt');
                }
            } catch (calErr) {
                console.log('[WEBHOOK] Calendar check error (non-fatal):', calErr.message);
            }
        }

        // Add Knowledge Base (company info, services, etc.)
        if (knowledgeBase) {
            aiPrompt += `
## 📚 Knowledge Base (About the Business - USE THIS INFO)
${knowledgeBase}
`;
        }

        // Add FAQ section for RAG
        if (faqContent) {
            aiPrompt += `
## ❓ FAQ (MUST USE these exact answers when relevant)
${faqContent}
`;
        }

        // Add bot rules with stronger emphasis
        if (config.bot_rules_dos) {
            aiPrompt += `
## ✅ STRICT RULES - DO's (YOU MUST FOLLOW THESE)
${config.bot_rules_dos}
`;
        }
        if (config.bot_rules_donts) {
            aiPrompt += `
## ❌ STRICT RULES - DON'Ts (NEVER DO THESE)
${config.bot_rules_donts}
`;
        }

        // Debug: Log all config being used
        console.log('[WEBHOOK] AI Config Applied:', {
            hasSystemPrompt: !!config.system_prompt,
            hasKnowledgeBase: !!knowledgeBase,
            hasFaq: !!faqContent,
            hasDos: !!config.bot_rules_dos,
            hasDonts: !!config.bot_rules_donts,
            hasBookingUrl: !!config.booking_url,
            activeGoal: activeGoal,
            language: language
        });

        // Add booking info if configured
        if (config.booking_url) {
            aiPrompt += `
## Booking Link
When customer wants to schedule/book, share this: ${config.booking_url}
`;
        }

        aiPrompt += `
## Important Guidelines
- Use Taglish naturally - mix English and Tagalog as Filipinos do
- Be friendly but professional
- If unsure about something, say you'll have a team member follow up
- If user sends an image, describe what you see and respond appropriately

## ⚠️ CRITICAL: NAME RULES (MUST FOLLOW)
- The customer's name is: "${conversation?.participant_name || 'NOT PROVIDED'}"
- If name is "NOT PROVIDED" or "Customer", DO NOT use any name at all
- NEVER invent, assume, or make up a customer name
- NEVER use names like "Jeff", "John", or any other name unless it was explicitly provided above
- Instead of using a name, use "po" for respect (e.g., "Kumusta po?" instead of "Kumusta Jeff?")
- If the customer mentions a name in the conversation, you MAY acknowledge it but do NOT assume that's their name

## ⚠️ MESSAGE SPLITTING RULES (VERY IMPORTANT - FOLLOW STRICTLY)
- ALWAYS split your response into multiple messages for better chat experience
- Use ||| to separate each message part
- Each part should be 1-2 sentences MAX (like real texting)
- EVERY response with more than 2 sentences MUST be split
- Example: "Hi! 😊 ||| Ang basic package natin is ₱1,799/month. ||| Kasama na lahat ng essentials tulad ng: ||| - 2 videos ||| - 2 photos ||| - Ad management ||| Gusto mo ba malaman pa?"
- Another example: "Hello po! ||| I'd be happy to help. ||| What specific service are you interested in?"

## 📅 BOOKING CONFIRMATION — MANDATORY SYSTEM MARKER (YOU MUST DO THIS)
⚠️ THIS IS REQUIRED - THE SYSTEM CANNOT CREATE CALENDAR EVENTS WITHOUT THIS MARKER ⚠️

When a customer confirms/agrees to a specific date and time for a booking or meeting:

STEP 1: Confirm the booking in your message to them (in Taglish)
STEP 2: ALWAYS add this marker at the VERY END (this is for the SYSTEM, customer won't see it):

BOOKING_CONFIRMED: YYYY-MM-DD HH:MM | CustomerName | PhoneNumber

EXAMPLE CONVERSATION:
Customer: "okay"
Your response: "Noted po! ✅ ||| I've scheduled your consultation for January 17, 2026 at 6:00 PM. ||| See you there!
BOOKING_CONFIRMED: 2026-01-17 18:00 | Prince | 09944465847"

⚠️ CRITICAL RULES:
- You MUST add BOOKING_CONFIRMED even if you just say "Noted po!" - if they confirmed a booking, ADD THE MARKER
- Use 24-hour format: 18:00 (not 6pm), 14:00 (not 2pm)
- Use PIPE | as separator, NOT dash -
- If phone was mentioned in conversation, include it
- If customer name is known (from conversation), include it
- This marker MUST be on its own line at the very end
- The marker is invisible to the customer - it's processed by the system
`;

        // Build messages array, handling images for vision models
        const aiMessages = [{ role: 'system', content: aiPrompt }];
        let hasImages = false;

        for (const msg of recentMessages) {
            // Check if message has image attachments
            const attachments = msg.attachments;
            let imageUrl = null;

            if (attachments && Array.isArray(attachments)) {
                for (const att of attachments) {
                    if (att.type === 'image' && att.payload?.url) {
                        imageUrl = att.payload.url;
                        hasImages = true;
                        console.log('[WEBHOOK] Found image in message:', imageUrl.substring(0, 50) + '...');
                        break;
                    }
                }
            }

            if (imageUrl) {
                // For vision models, include image in content
                aiMessages.push({
                    role: msg.is_from_page ? 'assistant' : 'user',
                    content: [
                        { type: 'text', text: msg.message_text || 'The customer sent an image:' },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                });
            } else {
                aiMessages.push({
                    role: msg.is_from_page ? 'assistant' : 'user',
                    content: msg.message_text || '[Attachment]'
                });
            }
        }

        console.log('[WEBHOOK] Has images:', hasImages);

        // Call NVIDIA AI with model rotation
        const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
        if (!NVIDIA_API_KEY) {
            console.error('[WEBHOOK] NVIDIA API key not set');
            return;
        }

        // Model rotation - try each model until one works
        // Use vision models if images are present, otherwise text models
        let MODELS;
        if (hasImages) {
            // Vision-capable models on NVIDIA API
            MODELS = [
                'nvidia/vila',                           // NVIDIA VILA vision model
                'liuhaotian/llava-v1.6-mistral-7b',     // LLaVA vision model
                'adept/fuyu-8b',                         // Fuyu vision model
                'meta/llama-3.2-11b-vision-instruct',   // Llama 3.2 Vision
            ];
            console.log('[WEBHOOK] Using VISION models for image analysis');
        } else {
            // Text-only models
            MODELS = [
                'meta/llama-3.1-405b-instruct',
                'meta/llama-3.1-70b-instruct',
                'mistralai/mixtral-8x22b-instruct-v0.1',
                'mistralai/mistral-7b-instruct-v0.3',
                'google/gemma-2-27b-it',
                'microsoft/phi-3-medium-128k-instruct'
            ];
        }

        let aiReply = null;
        let lastError = null;

        for (const model of MODELS) {
            try {
                console.log(`[WEBHOOK] Trying model: ${model}`);
                const aiResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${NVIDIA_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: aiMessages,
                        temperature: 0.7,
                        max_tokens: 400 // AI controls message splitting via ||| delimiter
                    })
                });

                if (!aiResponse.ok) {
                    const errorText = await aiResponse.text();
                    console.log(`[WEBHOOK] Model ${model} failed: ${errorText.substring(0, 100)}`);
                    lastError = errorText;
                    continue; // Try next model
                }

                const aiData = await aiResponse.json();
                aiReply = aiData.choices?.[0]?.message?.content;

                if (aiReply) {
                    console.log(`[WEBHOOK] Success with model: ${model}`);
                    break; // Got a response, exit loop
                }
            } catch (err) {
                console.log(`[WEBHOOK] Model ${model} error: ${err.message}`);
                lastError = err.message;
                continue;
            }
        }

        if (!aiReply) {
            console.error('[WEBHOOK] All models failed. Last error:', lastError);
            return;
        }

        console.log('[WEBHOOK] AI Reply:', aiReply.substring(0, 80) + '...');
        console.log('[WEBHOOK] AI Reply length:', aiReply.length);
        console.log('[WEBHOOK] Contains ||| delimiter:', aiReply.includes('|||'));

        // Flag to track if booking was already handled (prevent duplicates)
        let bookingHandled = false;

        // Detect BOOKING_CONFIRMED and create calendar event
        if (aiReply.includes('BOOKING_CONFIRMED:')) {
            bookingHandled = true; // Mark as handled to prevent FALLBACK from creating duplicate
            try {
                const bookingMatch = aiReply.match(/BOOKING_CONFIRMED:\s*(.+)/i);
                if (bookingMatch) {
                    const bookingInfo = bookingMatch[1];
                    console.log('[WEBHOOK] Booking detected raw:', bookingInfo);

                    // Parse the booking info (format: DATETIME | NAME | PHONE)
                    // Split by pipe character (not dash, which is in dates)
                    const parts = bookingInfo.split('|').map(p => p.trim());
                    console.log('[WEBHOOK] Booking parts:', JSON.stringify(parts));

                    const dateTimeStr = parts[0] || '';
                    const customerName = parts[1] || conversation?.participant_name || 'Customer';
                    const phone = parts[2] || '';

                    console.log(`[WEBHOOK] Parsed: dateTime="${dateTimeStr}", name="${customerName}", phone="${phone}"`);

                    // Try to parse date/time
                    const bookingDate = new Date(dateTimeStr);
                    if (!isNaN(bookingDate.getTime())) {
                        // Create calendar event - skip if fails, don't block message sending
                        try {
                            const { error: calError } = await db
                                .from('calendar_events')
                                .insert({
                                    title: `📅 Booking: ${customerName}`,
                                    description: `Booked via AI chatbot\nPhone: ${phone}\nConversation: ${conversationId}\nCustomer: ${customerName}`,
                                    start_time: bookingDate.toISOString(),
                                    end_time: new Date(bookingDate.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour
                                    event_type: 'meeting',
                                    status: 'scheduled',
                                    // For automated reminders
                                    conversation_id: conversationId,
                                    contact_psid: conversation?.participant_id || null
                                });

                            if (calError) {
                                console.error('[WEBHOOK] Calendar event creation failed:', calError.message);
                            } else {
                                console.log('[WEBHOOK] ✅ Calendar event created for', bookingDate);
                            }
                        } catch (calErr) {
                            console.error('[WEBHOOK] Calendar insert error:', calErr.message);
                        }

                        // Cancel any pending follow-ups for this conversation (they booked!)
                        try {
                            const { data: cancelledFollowups, error: cancelError } = await db
                                .from('ai_followup_schedule')
                                .update({
                                    status: 'cancelled',
                                    error_message: 'Contact booked - no follow-up needed'
                                })
                                .eq('conversation_id', conversationId)
                                .eq('status', 'pending')
                                .select('id');

                            if (cancelledFollowups?.length > 0) {
                                console.log(`[WEBHOOK] ✅ Cancelled ${cancelledFollowups.length} pending follow-ups - contact booked!`);
                            }
                        } catch (cancelErr) {
                            console.log('[WEBHOOK] Could not cancel follow-ups:', cancelErr.message);
                        }

                        // Move contact to 'booked' pipeline stage with contact details
                        try {
                            const updateData = {
                                pipeline_stage: 'booked',
                                booking_date: bookingDate.toISOString(),
                                booked_at: new Date().toISOString()
                            };

                            // Save phone number if provided
                            if (phone && phone.length > 5) {
                                updateData.phone_number = phone;
                            }

                            await db
                                .from('facebook_conversations')
                                .update(updateData)
                                .eq('conversation_id', conversationId);

                            console.log('[WEBHOOK] ✅ Contact moved to BOOKED pipeline with details:', {
                                booking_date: bookingDate.toISOString(),
                                phone: phone || 'not provided'
                            });
                        } catch (pipeErr) {
                            console.error('[WEBHOOK] Pipeline update error:', pipeErr.message);
                        }

                        // Also add to clients table (the actual pipeline)
                        try {
                            // Check if client already exists by name or phone
                            let existingClient = null;

                            if (phone && phone.length > 5) {
                                const { data: byPhone } = await db
                                    .from('clients')
                                    .select('id')
                                    .ilike('contact_details', `%${phone}%`)
                                    .limit(1)
                                    .maybeSingle();
                                existingClient = byPhone;
                            }

                            if (!existingClient && customerName) {
                                const { data: byName } = await db
                                    .from('clients')
                                    .select('id')
                                    .ilike('client_name', customerName)
                                    .limit(1)
                                    .maybeSingle();
                                existingClient = byName;
                            }

                            if (!existingClient) {
                                // Create new client in pipeline
                                const clientData = {
                                    client_name: customerName,
                                    contact_details: phone || null,
                                    notes: `Booked via AI on ${bookingDate.toLocaleDateString()}`,
                                    phase: 'booked',
                                    payment_status: 'unpaid',
                                    source: 'ai_chatbot',
                                    created_at: new Date().toISOString()
                                };

                                const { data: newClient, error: clientError } = await db
                                    .from('clients')
                                    .insert(clientData)
                                    .select()
                                    .single();

                                if (clientError) {
                                    // Try without source column if it doesn't exist
                                    if (clientError.message?.includes('source')) {
                                        delete clientData.source;
                                        await db.from('clients').insert(clientData);
                                        console.log('[WEBHOOK] ✅ Added to clients pipeline (without source)');
                                    } else {
                                        console.log('[WEBHOOK] Could not add to clients:', clientError.message);
                                    }
                                } else {
                                    console.log('[WEBHOOK] ✅ Added to clients pipeline:', newClient?.id);
                                }
                            } else {
                                // Update existing client to booked phase
                                await db
                                    .from('clients')
                                    .update({ phase: 'booked' })
                                    .eq('id', existingClient.id);
                                console.log('[WEBHOOK] ✅ Updated existing client to booked:', existingClient.id);
                            }
                        } catch (clientErr) {
                            console.log('[WEBHOOK] Clients table sync error (non-critical):', clientErr.message);
                        }
                    }

                    // Remove the BOOKING_CONFIRMED line from the reply (it's internal)
                    aiReply = aiReply.replace(/BOOKING_CONFIRMED:\s*.+/gi, '').trim();

                    // If reply is now empty, add a confirmation message
                    if (!aiReply) {
                        aiReply = `Noted po! ✅ I've scheduled your consultation for ${dateTimeStr}. Thank you for booking with us! See you there! 🎉`;
                        console.log('[WEBHOOK] Added fallback confirmation message');
                    }
                }
            } catch (bookingErr) {
                console.log('[WEBHOOK] Booking parsing error (non-fatal):', bookingErr.message);
            }
        }

        // FALLBACK: Detect booking confirmations from natural language (if AI forgot the marker)
        // Look for patterns like "scheduled for 2026-01-17 18:00" or "booked for January 17"
        console.log('[WEBHOOK] FALLBACK CHECK: aiReply contains BOOKING_CONFIRMED?', aiReply.includes('BOOKING_CONFIRMED:'));
        console.log('[WEBHOOK] FALLBACK CHECK: aiReply preview:', aiReply.substring(0, 150));
        console.log('[WEBHOOK] FALLBACK CHECK: bookingHandled=', bookingHandled);
        if (!bookingHandled && !aiReply.includes('BOOKING_CONFIRMED:')) {
            console.log('[WEBHOOK] FALLBACK: Entering fallback detection...');
            try {
                // Pattern 1: Look for ISO date format (2026-01-17 18:00)
                const isoDateMatch = aiReply.match(/(?:scheduled|booked|confirmed).*?for\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/i);

                // Pattern 2: Look for natural date (January 19, 2026 at 2:00 PM) - flexible pattern
                const naturalDateMatch = aiReply.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})?\s*(?:at\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)?/i);

                // Pattern 3: Look for RELATIVE dates like "tomorrow at 9am", "tomorrow at 9:00 AM"
                const relativeMatch = aiReply.match(/(?:scheduled|booked|confirmed|meeting).*?(tomorrow|today|day after tomorrow)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);

                let detectedDate = null;
                let detectedTime = null;

                if (isoDateMatch) {
                    detectedDate = isoDateMatch[1]; // 2026-01-17
                    detectedTime = isoDateMatch[2]; // 18:00
                    console.log(`[WEBHOOK] FALLBACK: Detected ISO date booking: ${detectedDate} ${detectedTime}`);
                } else if (naturalDateMatch) {
                    console.log('[WEBHOOK] FALLBACK: Match found:', JSON.stringify(naturalDateMatch.slice(0, 7)));
                    const monthNames = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };
                    const month = monthNames[naturalDateMatch[1].toLowerCase()];
                    const day = naturalDateMatch[2].padStart(2, '0');
                    const year = naturalDateMatch[3] || new Date().getFullYear();
                    let hour = parseInt(naturalDateMatch[4]);
                    const minute = naturalDateMatch[5];
                    const ampm = naturalDateMatch[6];

                    // Convert to 24-hour format
                    if (ampm && ampm.toLowerCase() === 'pm' && hour < 12) {
                        hour += 12;
                    } else if (ampm && ampm.toLowerCase() === 'am' && hour === 12) {
                        hour = 0;
                    }

                    detectedDate = `${year}-${month}-${day}`;
                    detectedTime = `${String(hour).padStart(2, '0')}:${minute}`;
                    console.log(`[WEBHOOK] FALLBACK: Detected natural date booking: ${detectedDate} ${detectedTime}`);
                } else if (relativeMatch) {
                    // Handle relative dates: tomorrow, today, day after tomorrow
                    console.log('[WEBHOOK] FALLBACK: Relative date match found:', JSON.stringify(relativeMatch.slice(0, 5)));
                    const relativeDay = relativeMatch[1].toLowerCase();
                    let hour = parseInt(relativeMatch[2]);
                    const minute = relativeMatch[3] || '00';
                    const ampm = relativeMatch[4]?.toLowerCase();

                    // Convert to 24-hour format
                    if (ampm === 'pm' && hour < 12) {
                        hour += 12;
                    } else if (ampm === 'am' && hour === 12) {
                        hour = 0;
                    } else if (!ampm && hour <= 6) {
                        // If no AM/PM specified and hour is 1-6, assume PM (business hours)
                        hour += 12;
                    }

                    // Calculate the date
                    const now = new Date();
                    let targetDate = new Date(now);

                    if (relativeDay === 'tomorrow') {
                        targetDate.setDate(now.getDate() + 1);
                    } else if (relativeDay === 'day after tomorrow') {
                        targetDate.setDate(now.getDate() + 2);
                    }
                    // 'today' stays as current date

                    const year = targetDate.getFullYear();
                    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
                    const day = String(targetDate.getDate()).padStart(2, '0');

                    detectedDate = `${year}-${month}-${day}`;
                    detectedTime = `${String(hour).padStart(2, '0')}:${minute}`;
                    console.log(`[WEBHOOK] FALLBACK: Detected RELATIVE date booking: "${relativeDay}" -> ${detectedDate} ${detectedTime}`);
                }

                if (detectedDate && detectedTime) {
                    const bookingDate = new Date(`${detectedDate}T${detectedTime}`);

                    if (!isNaN(bookingDate.getTime())) {
                        console.log('[WEBHOOK] FALLBACK: Creating calendar event from natural language');

                        // Get customer name from conversation
                        const customerName = conversation?.participant_name || 'Customer';

                        // Try to extract phone from recent messages
                        let phone = '';
                        if (recentMessages && recentMessages.length > 0) {
                            for (const msg of recentMessages) {
                                const msgText = msg.message_text || '';
                                const phoneMatch = msgText.match(/09\d{9}/) || msgText.match(/0\d{10}/) || msgText.match(/\+63\d{10}/);
                                if (phoneMatch) {
                                    phone = phoneMatch[0];
                                    console.log('[WEBHOOK] FALLBACK: Found phone in messages:', phone);
                                    break;
                                }
                            }
                        }

                        // Create calendar event
                        try {
                            const calendarData = {
                                title: `📅 Booking: ${customerName}`,
                                description: `Booked via AI chatbot (auto-detected)\nPhone: ${phone || 'Not provided'}\nConversation: ${conversationId}`,
                                start_time: bookingDate.toISOString(),
                                end_time: new Date(bookingDate.getTime() + 60 * 60 * 1000).toISOString(),
                                event_type: 'meeting',
                                status: 'scheduled',
                                // For automated reminders
                                conversation_id: conversationId,
                                contact_psid: conversation?.participant_id || null
                            };
                            console.log('[WEBHOOK] FALLBACK: Inserting calendar event:', JSON.stringify(calendarData));

                            const { data: calData, error: calError } = await db
                                .from('calendar_events')
                                .insert(calendarData)
                                .select();

                            if (calError) {
                                console.error('[WEBHOOK] FALLBACK: Calendar error code:', calError.code);
                                console.error('[WEBHOOK] FALLBACK: Calendar error msg:', calError.message);
                                console.error('[WEBHOOK] FALLBACK: Calendar error details:', calError.details);
                                console.error('[WEBHOOK] FALLBACK: Calendar error hint:', calError.hint);
                            } else {
                                console.log('[WEBHOOK] FALLBACK: ✅ Calendar event created!', calData?.[0]?.id);
                            }
                        } catch (e) {
                            console.error('[WEBHOOK] FALLBACK: Calendar insert exception:', e.message, e.stack);
                        }

                        // Cancel pending follow-ups
                        try {
                            await db
                                .from('ai_followup_schedule')
                                .update({ status: 'cancelled', error_message: 'Contact booked (auto-detected)' })
                                .eq('conversation_id', conversationId)
                                .eq('status', 'pending');
                            console.log('[WEBHOOK] FALLBACK: Cancelled pending follow-ups');
                        } catch (e) { }

                        // Update conversation
                        try {
                            await db
                                .from('facebook_conversations')
                                .update({ pipeline_stage: 'booked', booking_date: bookingDate.toISOString(), phone_number: phone || null })
                                .eq('conversation_id', conversationId);
                            console.log('[WEBHOOK] FALLBACK: ✅ Updated conversation to booked');
                        } catch (e) { }

                        // ADD TO CLIENTS TABLE (pipeline)
                        try {
                            let existingClient = null;
                            if (phone) {
                                const { data: byPhone } = await db.from('clients').select('id').ilike('contact_details', `%${phone}%`).limit(1).maybeSingle();
                                existingClient = byPhone;
                            }
                            if (!existingClient && customerName && customerName !== 'Customer' && customerName !== 'Unknown') {
                                const { data: byName } = await db.from('clients').select('id').ilike('client_name', customerName).limit(1).maybeSingle();
                                existingClient = byName;
                            }

                            if (!existingClient) {
                                const clientData = {
                                    client_name: customerName,
                                    contact_details: phone || null,
                                    notes: `Booked via AI on ${bookingDate.toLocaleDateString()}`,
                                    phase: 'booked',
                                    payment_status: 'unpaid',
                                    created_at: new Date().toISOString()
                                };
                                await db.from('clients').insert(clientData);
                                console.log('[WEBHOOK] FALLBACK: ✅ Added to clients pipeline');
                            } else {
                                await db.from('clients').update({ phase: 'booked' }).eq('id', existingClient.id);
                                console.log('[WEBHOOK] FALLBACK: ✅ Updated existing client to booked');
                            }
                        } catch (clientErr) {
                            console.log('[WEBHOOK] FALLBACK: Clients error (non-fatal):', clientErr.message);
                        }
                    }
                }
            } catch (fallbackErr) {
                console.log('[WEBHOOK] FALLBACK: Detection error (non-fatal):', fallbackErr.message);
            }
        }

        // Split messages - AI uses |||, but if not, force split by sentences
        let messageParts = [];

        if (aiReply.includes('|||')) {
            // AI decided to split the message
            messageParts = aiReply.split('|||').map(p => p.trim()).filter(p => p.length > 0);
            console.log(`[WEBHOOK] AI split into ${messageParts.length} parts using |||`);
        } else {
            // FALLBACK: Force split by sentences if response is long
            // Split on sentence endings (. ! ?) followed by space
            const sentences = aiReply.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);

            if (sentences.length <= 2) {
                // Short enough, send as one
                messageParts.push(aiReply);
            } else {
                // Group sentences into parts (2-3 sentences each)
                let currentPart = '';
                let sentenceCount = 0;

                for (const sentence of sentences) {
                    currentPart += (currentPart ? ' ' : '') + sentence;
                    sentenceCount++;

                    if (sentenceCount >= 2) {
                        messageParts.push(currentPart.trim());
                        currentPart = '';
                        sentenceCount = 0;
                    }
                }

                // Add remaining sentences
                if (currentPart.trim()) {
                    messageParts.push(currentPart.trim());
                }

                console.log(`[WEBHOOK] Force split into ${messageParts.length} parts by sentences`);
            }
        }

        console.log(`[WEBHOOK] Sending ${messageParts.length} message part(s)`);

        // Send each part via Facebook
        const participantId = conversation?.participant_id || conversationId.replace('t_', '');

        for (let i = 0; i < messageParts.length; i++) {
            const part = messageParts[i];

            // Add delay between messages for natural chat feel
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            console.log(`[WEBHOOK] Sending part ${i + 1}/${messageParts.length}: "${part.substring(0, 50)}..."`);

            const sendResponse = await fetch(
                `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${page.page_access_token}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recipient: { id: participantId },
                        message: { text: part },
                        messaging_type: 'RESPONSE'
                    })
                }
            );

            if (!sendResponse.ok) {
                const err = await sendResponse.text();
                console.error(`[WEBHOOK] Send part ${i + 1} failed:`, err);

                // Try with ACCOUNT_UPDATE tag if 24h window issue
                if (err.includes('allowed window') || err.includes('outside')) {
                    console.log('[WEBHOOK] Retrying with ACCOUNT_UPDATE tag...');
                    const retryResponse = await fetch(
                        `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${page.page_access_token}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                recipient: { id: participantId },
                                message: { text: part },
                                messaging_type: 'MESSAGE_TAG',
                                tag: 'ACCOUNT_UPDATE'
                            })
                        }
                    );
                    if (!retryResponse.ok) {
                        console.error('[WEBHOOK] Retry also failed');
                        return;
                    }
                } else {
                    return;
                }
            }

            // Small delay between messages to maintain order
            if (i < messageParts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log('[WEBHOOK] AI reply sent successfully!');

        // INTELLIGENT FOLLOW-UP: Analyze conversation to schedule smart follow-up
        try {
            await analyzeAndScheduleFollowUp(db, conversationId, pageId, conversation, recentMessages);
        } catch (followUpErr) {
            console.log('[WEBHOOK] Follow-up analysis error (non-fatal):', followUpErr.message);
        }

    } catch (error) {
        console.error('[WEBHOOK] AI Error:', error);
    }
}

/**
 * Intelligent Follow-up Analysis
 * AI analyzes the conversation to decide how long to wait before following up
 */
async function analyzeAndScheduleFollowUp(db, conversationId, pageId, conversation, recentMessages) {
    console.log('[WEBHOOK] === INTELLIGENT FOLLOW-UP ANALYSIS ===');

    // Build conversation summary for AI
    const messagesSummary = recentMessages.slice(-5).map(m =>
        `${m.is_from_page ? 'AI' : 'Customer'}: ${m.message_text || '[attachment]'}`
    ).join('\n');

    const analysisPrompt = `Analyze this conversation and determine the optimal follow-up timing.

CONVERSATION:
${messagesSummary}

You must respond with ONLY valid JSON (no markdown, no explanation):
{
  "wait_minutes": <number between 15-240>,
  "reason": "<brief explanation why this wait time is appropriate>",
  "follow_up_type": "<one of: best_time|intuition|reminder|flow|manual>",
  "urgency": "<one of: low|medium|high>"
}

AGGRESSIVE FOLLOW-UP GUIDELINES (use minutes, not hours):
- Hot lead showing interest: 15-30 minutes
- Customer asked a question: 30-60 minutes
- Customer is comparing options: 60-120 minutes (1-2 hours)
- Conversation ended mid-discussion: 30-60 minutes
- Customer showed buying intent: 15-30 minutes
- Customer just received info: 60-120 minutes
- Customer went silent after question: 30-60 minutes
- Customer said they're busy: 120-180 minutes (2-3 hours)
- Customer asked for time to think: 120-240 minutes (2-4 hours MAX)`;

    try {
        // Get page access token for AI call
        const { data: page } = await db
            .from('facebook_pages')
            .select('page_access_token')
            .eq('page_id', pageId)
            .single();

        const nvidiaKey = process.env.NVIDIA_API_KEY;
        if (!nvidiaKey) {
            console.log('[WEBHOOK] No NVIDIA API key for follow-up analysis');
            return;
        }

        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${nvidiaKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'meta/llama-3.1-8b-instruct',
                messages: [{ role: 'user', content: analysisPrompt }],
                max_tokens: 200,
                temperature: 0.3
            })
        });

        if (!response.ok) {
            console.error('[WEBHOOK] Follow-up AI call failed');
            return;
        }

        const aiResult = await response.json();
        const analysisText = aiResult.choices?.[0]?.message?.content?.trim();

        console.log('[WEBHOOK] Follow-up analysis raw:', analysisText);

        // Parse JSON response
        let analysis;
        try {
            // Clean up the response (remove markdown if present)
            const cleanJson = analysisText.replace(/```json\n?|\n?```/g, '').trim();
            analysis = JSON.parse(cleanJson);
        } catch (parseErr) {
            console.log('[WEBHOOK] Could not parse follow-up analysis, using defaults');
            analysis = { wait_minutes: 30, reason: 'Quick follow-up', follow_up_type: 'intuition', urgency: 'medium' };
        }

        // Calculate scheduled time - use minutes, cap at 4 hours max
        const waitMinutes = Math.min(Math.max(analysis.wait_minutes || 30, 15), 240); // 15 mins to 4 hours max
        const scheduledAt = new Date(Date.now() + waitMinutes * 60 * 1000);

        console.log('[WEBHOOK] Follow-up decision:', {
            wait_minutes: waitMinutes,
            reason: analysis.reason,
            type: analysis.follow_up_type,
            scheduled_at: scheduledAt.toISOString()
        });

        // Cancel any existing pending follow-ups for this conversation
        await db
            .from('ai_followup_schedule')
            .update({ status: 'cancelled' })
            .eq('conversation_id', conversationId)
            .eq('status', 'pending');

        // SANITIZE follow_up_type to ensure it's a valid DB value
        const validTypes = ['best_time', 'intuition', 'manual', 'flow', 'reminder'];
        let sanitizedType = analysis.follow_up_type || 'reminder';
        if (!validTypes.includes(sanitizedType)) {
            // Map common AI responses to valid values
            const typeMapping = {
                'gentle_reminder': 'reminder',
                'check_in': 'reminder',
                'immediate': 'intuition',
                'urgent': 'intuition',
                're_engagement': 'reminder',
                'follow_up': 'reminder'
            };
            sanitizedType = typeMapping[sanitizedType] || 'reminder';
            console.log(`[WEBHOOK] Sanitized follow_up_type from "${analysis.follow_up_type}" to "${sanitizedType}"`);
        }

        // Schedule the new intelligent follow-up
        const { error: scheduleError } = await db
            .from('ai_followup_schedule')
            .insert({
                conversation_id: conversationId,
                page_id: pageId,
                scheduled_at: scheduledAt.toISOString(),
                follow_up_type: sanitizedType,
                reason: analysis.reason || 'AI scheduled follow-up',
                status: 'pending'
            });

        if (scheduleError) {
            console.error('[WEBHOOK] Failed to schedule follow-up:', scheduleError.message);
        } else {
            console.log(`[WEBHOOK] ✅ Intelligent follow-up scheduled for ${scheduledAt.toLocaleString()} (${waitMinutes} mins)`);
        }

    } catch (err) {
        console.error('[WEBHOOK] Follow-up analysis exception:', err.message);
    }
}

export const config = {
    api: {
        bodyParser: true
    }
};
