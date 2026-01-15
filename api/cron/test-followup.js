import { createClient } from '@supabase/supabase-js';

/**
 * Test endpoint to send a follow-up to a specific user
 * Call via: GET /api/cron/test-followup?psid=USER_PSID
 */
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Supabase not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const psid = req.query.psid || '61585854906493'; // Default test user

    try {
        // Find the conversation for this user
        const { data: conversation, error: convError } = await supabase
            .from('facebook_conversations')
            .select('conversation_id, page_id, participant_id, participant_name')
            .eq('participant_id', psid)
            .single();

        if (convError || !conversation) {
            return res.status(404).json({
                error: 'Conversation not found for PSID: ' + psid,
                hint: 'Make sure this user has messaged your page'
            });
        }

        // Get page access token
        const { data: page } = await supabase
            .from('facebook_pages')
            .select('page_access_token')
            .eq('page_id', conversation.page_id)
            .single();

        if (!page?.page_access_token) {
            return res.status(500).json({ error: 'No page access token found' });
        }

        // Generate test message
        const contactName = conversation.participant_name || 'there';
        const message = `Hi ${contactName}! 👋 This is a test follow-up message from the AI system.`;

        // Send via Messenger
        const response = await fetch(
            `https://graph.facebook.com/v18.0/${conversation.page_id}/messages?access_token=${page.page_access_token}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: psid },
                    message: { text: message },
                    messaging_type: 'MESSAGE_TAG',
                    tag: 'ACCOUNT_UPDATE'
                })
            }
        );

        const result = await response.json();

        if (response.ok) {
            return res.status(200).json({
                success: true,
                message: 'Test follow-up sent successfully!',
                recipient: {
                    psid,
                    name: contactName,
                    conversation_id: conversation.conversation_id
                },
                facebook_response: result
            });
        } else {
            return res.status(200).json({
                success: false,
                error: result.error?.message || 'Failed to send',
                error_code: result.error?.code,
                recipient: {
                    psid,
                    name: contactName
                },
                hint: 'If error is #551, the user may have blocked the page or their Messenger is unavailable'
            });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
