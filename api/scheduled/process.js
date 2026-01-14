import { createClient } from '@supabase/supabase-js';

/**
 * Process due scheduled messages
 * This endpoint is called by cron-job.org or similar services
 */
export default async function handler(req, res) {
    // Allow both GET and POST for cron job compatibility
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(200).json({
                success: true,
                message: 'Supabase not configured - skipping',
                processed: 0
            });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get all pending scheduled messages that are due
        const now = new Date().toISOString();
        const { data: pendingMessages, error: fetchError } = await supabase
            .from('scheduled_messages')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_for', now)
            .order('scheduled_for', { ascending: true })
            .limit(10);

        if (fetchError) {
            // Table might not exist yet - that's okay, return success
            console.log('[SCHEDULED] Table error (might not exist):', fetchError.code);
            return res.status(200).json({
                success: true,
                message: 'No scheduled_messages table or empty - this is normal if not using scheduled broadcasts',
                processed: 0
            });
        }

        if (!pendingMessages || pendingMessages.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No pending messages',
                processed: 0
            });
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

                if (scheduledMsg.recipient_ids && scheduledMsg.recipient_ids.length > 0) {
                    recipients = scheduledMsg.recipient_ids.map(id => ({ participant_id: id }));
                } else {
                    // Get recipients based on filter type
                    let query = supabase
                        .from('facebook_conversations')
                        .select('participant_id')
                        .eq('page_id', scheduledMsg.page_id)
                        .or('is_archived.is.null,is_archived.eq.false');

                    switch (scheduledMsg.filter_type) {
                        case 'unbooked':
                        case 'not_booked':
                            query = query.is('linked_client_id', null);
                            break;
                        case 'not_pipeline':
                        case 'not_in_pipeline':
                            query = query.is('linked_client_id', null);
                            break;
                        case 'pipeline':
                        case 'in_pipeline':
                        case 'booked':
                            query = query.not('linked_client_id', 'is', null);
                            break;
                        case 'no_reply':
                            query = query.neq('last_reply_from', 'page');
                            break;
                        case 'tag':
                            if (scheduledMsg.filter_tag_id) {
                                const { data: tagged } = await supabase
                                    .from('conversation_tag_assignments')
                                    .select('conversation_id')
                                    .eq('tag_id', scheduledMsg.filter_tag_id);

                                if (tagged && tagged.length > 0) {
                                    const convIds = tagged.map(t => t.conversation_id);
                                    const { data: convs } = await supabase
                                        .from('facebook_conversations')
                                        .select('participant_id')
                                        .in('conversation_id', convIds);
                                    recipients = (convs || []).map(c => ({ participant_id: c.participant_id }));
                                }
                            }
                            break;
                    }

                    if (scheduledMsg.filter_type !== 'tag' || recipients.length === 0) {
                        const { data: convs } = await query.limit(500);
                        recipients = (convs || []).map(c => ({ participant_id: c.participant_id }));
                    }
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
                        await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (err) {
                        failedCount++;
                    }
                }

                // Update scheduled message status
                await supabase
                    .from('scheduled_messages')
                    .update({
                        status: 'completed',
                        success_count: sentCount,
                        fail_count: failedCount,
                        processed_at: new Date().toISOString()
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
                        error_message: err.message,
                        processed_at: new Date().toISOString()
                    })
                    .eq('id', scheduledMsg.id);

                failed++;
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Scheduled messages processed',
            processed,
            failed
        });
    } catch (error) {
        console.error('Error processing scheduled messages:', error);
        return res.status(200).json({
            success: false,
            error: error.message,
            processed: 0
        });
    }
}
