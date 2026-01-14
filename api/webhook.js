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
        const url = `https://graph.facebook.com/v18.0/${userId}?fields=name,first_name,last_name&access_token=${page.page_access_token}`;
        console.log(`[WEBHOOK] Fetching user profile for PSID: ${userId}`);

        const response = await fetch(url);
        const responseText = await response.text();

        console.log(`[WEBHOOK] Facebook API response status: ${response.status}`);

        if (!response.ok) {
            console.error('[WEBHOOK] Facebook API error response:', responseText);
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

        // Try multiple sources for participant name
        let participantName = existingConv?.participant_name;

        // Fetch name if missing (for both incoming messages AND echoes)
        if (!participantName) {
            // Source 1: Check if Facebook included sender name in the event
            const senderNameFromEvent = event.sender?.name || event.recipient?.name || message.sender_name;
            if (senderNameFromEvent) {
                console.log(`[WEBHOOK] Got name from event: ${senderNameFromEvent}`);
                participantName = senderNameFromEvent;
            }

            // Source 2: Try to fetch from Facebook Graph API
            if (!participantName) {
                console.log(`[WEBHOOK] Fetching name from API for participant: ${participantId}`);
                participantName = await fetchFacebookUserName(participantId, pageId);
            }

            if (participantName) {
                console.log(`[WEBHOOK] Name resolved: ${participantName}`);
            } else {
                console.log(`[WEBHOOK] Could not resolve name for ${participantId}`);
            }
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

        // TEMPORARILY BYPASS ALL CHECKS FOR DEBUGGING
        // TODO: Remove this after confirming AI works
        console.log('[WEBHOOK] Bypassing checks for debugging...');

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

        // Build AI prompt
        const systemPrompt = config.system_prompt || 'You are a friendly AI assistant for a business. Be helpful and concise.';
        const knowledgeBase = config.knowledge_base || '';

        let aiPrompt = `${systemPrompt}\n\nPlatform: Facebook Messenger\nContact: ${conversation?.participant_name || 'Unknown'}\n`;
        if (knowledgeBase) {
            aiPrompt += `\nKnowledge Base:\n${knowledgeBase}\n`;
        }
        if (config.bot_rules_dos) {
            aiPrompt += `\nDO: ${config.bot_rules_dos}\n`;
        }
        if (config.bot_rules_donts) {
            aiPrompt += `\nDON'T: ${config.bot_rules_donts}\n`;
        }
        aiPrompt += `\nKeep responses concise for chat.`;

        const aiMessages = [{ role: 'system', content: aiPrompt }];
        for (const msg of recentMessages) {
            aiMessages.push({
                role: msg.is_from_page ? 'assistant' : 'user',
                content: msg.message_text || '[Attachment]'
            });
        }

        // Call NVIDIA AI with model rotation
        const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
        if (!NVIDIA_API_KEY) {
            console.error('[WEBHOOK] NVIDIA API key not set');
            return;
        }

        // Model rotation - try each model until one works
        // These are CLOUD API models available on build.nvidia.com (not NIM-only)
        const MODELS = [
            'meta/llama-3.1-405b-instruct',
            'meta/llama-3.1-70b-instruct',
            'mistralai/mixtral-8x22b-instruct-v0.1',
            'mistralai/mistral-7b-instruct-v0.3',
            'google/gemma-2-27b-it',
            'microsoft/phi-3-medium-128k-instruct'
        ];

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
                        max_tokens: 400
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

        // Send via Facebook
        const participantId = conversation?.participant_id || conversationId.replace('t_', '');
        const sendResponse = await fetch(
            `https://graph.facebook.com/v18.0/${pageId}/messages?access_token=${page.page_access_token}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: participantId },
                    message: { text: aiReply },
                    messaging_type: 'RESPONSE'
                })
            }
        );

        if (!sendResponse.ok) {
            const err = await sendResponse.text();
            console.error('[WEBHOOK] Send failed:', err);

            // Try with ACCOUNT_UPDATE tag if 24h window issue
            if (err.includes('allowed window') || err.includes('outside')) {
                console.log('[WEBHOOK] Retrying with ACCOUNT_UPDATE tag...');
                const retryResponse = await fetch(
                    `https://graph.facebook.com/v18.0/${pageId}/messages?access_token=${page.page_access_token}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            recipient: { id: participantId },
                            message: { text: aiReply },
                            messaging_type: 'MESSAGE_TAG',
                            tag: 'ACCOUNT_UPDATE'
                        })
                    }
                );
                if (retryResponse.ok) {
                    console.log('[WEBHOOK] Sent with tag!');
                } else {
                    console.error('[WEBHOOK] Retry also failed:', await retryResponse.text());
                }
            }
            return;
        }

        console.log('[WEBHOOK] AI reply sent successfully!');

        // Set cooldown
        await db
            .from('facebook_conversations')
            .update({
                cooldown_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
            })
            .eq('conversation_id', conversationId);

    } catch (error) {
        console.error('[WEBHOOK] AI Error:', error);
    }
}

export const config = {
    api: {
        bodyParser: true
    }
};
