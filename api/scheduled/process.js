import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

/**
 * Process due scheduled messages
 * This endpoint should be called by a cron job (e.g., every minute)
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get all pending scheduled messages that are due
        const now = new Date().toISOString();
        const { data: pendingMessages, error: fetchError } = await supabase
            .from('scheduled_messages')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_for', now);

        if (fetchError) throw fetchError;

        if (!pendingMessages || pendingMessages.length === 0) {
            return res.status(200).json({ message: 'No pending messages', processed: 0 });
        }

        let processed = 0;
        let failed = 0;

        for (const scheduledMsg of pendingMessages) {
            try {
                // Mark as sending
                await supabase
                    .from('scheduled_messages')
                    .update({ status: 'sending' })
                    .eq('id', scheduledMsg.id);

                // Get page access token
                const { data: page, error: pageError } = await supabase
                    .from('facebook_pages')
                    .select('page_access_token')
                    .eq('page_id', scheduledMsg.page_id)
                    .single();

                if (pageError || !page) {
                    throw new Error('Page not found');
                }

                // Get recipients based on filter or selected list
                let recipients = [];

                if (scheduledMsg.selected_recipients) {
                    recipients = scheduledMsg.selected_recipients;
                } else {
                    // Get recipients based on filter type
                    let query = supabase
                        .from('facebook_conversations')
                        .select('participant_id')
                        .eq('page_id', scheduledMsg.page_id)
                        .neq('is_archived', true);

                    switch (scheduledMsg.filter_type) {
                        case 'not_booked':
                            query = query.is('has_booking', false);
                            break;
                        case 'not_in_pipeline':
                            query = query.is('linked_client_id', null);
                            break;
                        case 'in_pipeline':
                            query = query.not('linked_client_id', 'is', null);
                            break;
                        case 'no_reply':
                            query = query.eq('last_message_from_page', false);
                            break;
                    }

                    const { data: convs } = await query;
                    recipients = (convs || []).map(c => ({ participant_id: c.participant_id }));
                }

                let sentCount = 0;
                let failedCount = 0;

                for (const recipient of recipients) {
                    try {
                        const response = await fetch(
                            `https://graph.facebook.com/v18.0/${scheduledMsg.page_id}/messages?access_token=${page.page_access_token}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    recipient: { id: recipient.participant_id },
                                    message: { text: scheduledMsg.message_text },
                                    messaging_type: 'MESSAGE_TAG',
                                    tag: 'ACCOUNT_UPDATE'
                                })
                            }
                        );

                        if (response.ok) {
                            sentCount++;
                        } else {
                            failedCount++;
                        }

                        // Delay to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (err) {
                        failedCount++;
                    }
                }

                // Update scheduled message status
                await supabase
                    .from('scheduled_messages')
                    .update({
                        status: 'completed',
                        sent_count: sentCount,
                        failed_count: failedCount,
                        executed_at: new Date().toISOString()
                    })
                    .eq('id', scheduledMsg.id);

                processed++;
            } catch (err) {
                console.error(`Error processing scheduled message ${scheduledMsg.id}:`, err);

                // Mark as failed
                await supabase
                    .from('scheduled_messages')
                    .update({
                        status: 'failed',
                        executed_at: new Date().toISOString()
                    })
                    .eq('id', scheduledMsg.id);

                failed++;
            }
        }

        return res.status(200).json({
            message: 'Scheduled messages processed',
            processed,
            failed
        });
    } catch (error) {
        console.error('Error processing scheduled messages:', error);
        return res.status(500).json({ error: error.message });
    }
}
