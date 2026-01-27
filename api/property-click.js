import { createClient } from '@supabase/supabase-js';

// Lazy-load Supabase client
let supabase = null;
function getSupabase() {
    if (!supabase) {
        supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return supabase;
}

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Property Click Webhook Handler
 * Called when a contact clicks on a property link from Messenger
 * This sends a confirmation message back to the contact and logs the view
 */
export default async function handler(req, res) {
    // Allow all origins for API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { participantId, propertyId, propertyTitle, propertyUrl } = req.body;

        console.log('[PROPERTY CLICK] Received notification:', {
            participantId,
            propertyId,
            propertyTitle
        });

        if (!participantId || !propertyId) {
            return res.status(400).json({ error: 'Missing required fields: participantId, propertyId' });
        }

        const db = getSupabase();

        // 1. Find the conversation and page for this participant
        const { data: conversation, error: convError } = await db
            .from('facebook_conversations')
            .select('conversation_id, page_id, participant_name')
            .eq('participant_id', participantId)
            .single();

        if (convError || !conversation) {
            console.log('[PROPERTY CLICK] Conversation not found for participant:', participantId);
            return res.status(404).json({ error: 'Conversation not found' });
        }

        console.log('[PROPERTY CLICK] Found conversation:', conversation.conversation_id);

        // 2. Get the page access token
        const { data: page, error: pageError } = await db
            .from('facebook_pages')
            .select('page_access_token, page_name')
            .eq('page_id', conversation.page_id)
            .single();

        if (pageError || !page?.page_access_token) {
            console.log('[PROPERTY CLICK] Page not found:', conversation.page_id);
            return res.status(404).json({ error: 'Page not found' });
        }

        // 3. Log the property view in the database
        const { error: viewError } = await db.from('property_views').insert({
            property_id: propertyId,
            property_title: propertyTitle,
            participant_id: participantId,
            visitor_name: conversation.participant_name,
            source: 'fb_messenger',
            viewed_at: new Date().toISOString()
        });

        if (viewError) {
            console.error('[PROPERTY CLICK] Error logging view:', viewError);
        } else {
            console.log('[PROPERTY CLICK] ✅ Logged property view');
        }

        // 4. Update the conversation with the last viewed property
        await db.from('facebook_conversations').update({
            last_property_viewed: propertyId,
            last_property_viewed_at: new Date().toISOString()
        }).eq('conversation_id', conversation.conversation_id);

        // 5. Send a confirmation message to the contact
        const messageText = `👋 We noticed you're checking out **${propertyTitle}**! Great choice! 🏠\n\nIf you have any questions about this property or would like to schedule a viewing, just let me know. I'm here to help! 😊`;

        const response = await fetch(
            `${GRAPH_API_BASE}/${conversation.page_id}/messages?access_token=${page.page_access_token}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: participantId },
                    message: { text: messageText },
                    messaging_type: 'MESSAGE_TAG',
                    tag: 'ACCOUNT_UPDATE'
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[PROPERTY CLICK] ❌ Failed to send message:', errorData);

            // Still return success since view was logged
            return res.status(200).json({
                success: true,
                messageSent: false,
                error: 'Could not send confirmation message',
                viewLogged: true
            });
        }

        console.log('[PROPERTY CLICK] ✅ Sent confirmation message to contact');

        // 6. Log this action in the AI action log
        await db.from('ai_action_log').insert({
            conversation_id: conversation.conversation_id,
            action_type: 'property_click_detected',
            details: {
                property_id: propertyId,
                property_title: propertyTitle,
                message_sent: true
            }
        });

        return res.status(200).json({
            success: true,
            messageSent: true,
            viewLogged: true,
            conversationId: conversation.conversation_id
        });

    } catch (error) {
        console.error('[PROPERTY CLICK] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

export const config = {
    api: {
        bodyParser: true
    }
};
