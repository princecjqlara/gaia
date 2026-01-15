import { createClient } from '@supabase/supabase-js';

/**
 * Process due scheduled messages AND AI intuition follow-ups
 * This endpoint is called by cron-job.org or similar services
 * Updated: 2026-01-15 11:30 - Fixed to always process AI follow-ups
 */
export default async function handler(req, res) {
    // Disable caching for this API route
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Allow both GET and POST for cron job compatibility
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('[SCHEDULED] Processing started at', new Date().toISOString());

    try {
        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

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

        // Initialize counters
        let processed = 0;
        let failed = 0;

        if (!pendingMessages || pendingMessages.length === 0) {
            console.log('[SCHEDULED] No pending scheduled_messages');
            // Don't return early - continue to AI follow-ups
        } else {
            // Process scheduled_messages
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
        } // End of if-else for scheduled_messages

        // ===== ALSO PROCESS AI INTUITION FOLLOW-UPS =====
        let aiFollowupsSent = 0;
        let aiFollowupsFailed = 0;

        try {
            // DEBUG: First, let's see ALL pending follow-ups to understand what's in the table
            const { data: allPendingFollowups, error: debugError } = await supabase
                .from('ai_followup_schedule')
                .select('id, conversation_id, scheduled_at, status, created_at, follow_up_type')
                .eq('status', 'pending')
                .order('scheduled_at', { ascending: true })
                .limit(10);

            console.log(`[AI FOLLOWUP] DEBUG - Pending follow-ups: ${allPendingFollowups?.length || 0}, error: ${debugError?.message || 'none'}`);
            if (allPendingFollowups && allPendingFollowups.length > 0) {
                const first = allPendingFollowups[0];
                const scheduledTime = new Date(first.scheduled_at);
                const nowTime = new Date(now);
                const minutesUntilDue = Math.round((scheduledTime - nowTime) / (1000 * 60));
                console.log(`[AI FOLLOWUP] DEBUG - First pending:`);
                console.log(`[AI FOLLOWUP]   scheduled_at: ${first.scheduled_at}`);
                console.log(`[AI FOLLOWUP]   created_at: ${first.created_at}`);
                console.log(`[AI FOLLOWUP]   follow_up_type: ${first.follow_up_type}`);
                console.log(`[AI FOLLOWUP]   current time: ${now}`);
                console.log(`[AI FOLLOWUP]   minutes until due: ${minutesUntilDue} (negative = overdue)`);
            }

            // Get pending AI follow-ups that are due
            const { data: aiFollowups, error: aiError } = await supabase
                .from('ai_followup_schedule')
                .select('*')
                .eq('status', 'pending')
                .lte('scheduled_at', now)
                .order('scheduled_at', { ascending: true })
                .limit(50);

            console.log(`[AI FOLLOWUP] Query result: ${aiFollowups?.length || 0} follow-ups, error: ${aiError?.message || 'none'}`);

            if (aiError) {
                console.error('[AI FOLLOWUP] Query error:', aiError);
            }

            if (!aiError && aiFollowups && aiFollowups.length > 0) {
                console.log(`[AI FOLLOWUP] Found ${aiFollowups.length} due follow-ups to send`);

                for (const followup of aiFollowups) {
                    try {
                        // Get page access token
                        const { data: page } = await supabase
                            .from('facebook_pages')
                            .select('page_access_token')
                            .eq('page_id', followup.page_id)
                            .single();

                        if (!page?.page_access_token) {
                            console.log(`[AI FOLLOWUP] No token for page ${followup.page_id}`);
                            await supabase
                                .from('ai_followup_schedule')
                                .update({ status: 'failed', error_message: 'No page token' })
                                .eq('id', followup.id);
                            aiFollowupsFailed++;
                            continue;
                        }

                        // Get conversation details separately
                        const { data: conversation } = await supabase
                            .from('facebook_conversations')
                            .select('participant_id, participant_name')
                            .eq('conversation_id', followup.conversation_id)
                            .single();

                        const recipientId = conversation?.participant_id;
                        const contactName = conversation?.participant_name || 'there';

                        if (!recipientId) {
                            console.log(`[AI FOLLOWUP] No recipient for ${followup.conversation_id}`);
                            await supabase
                                .from('ai_followup_schedule')
                                .update({ status: 'failed', error_message: 'No recipient ID' })
                                .eq('id', followup.id);
                            continue;
                        }

                        // Generate a natural follow-up message
                        const messages = [
                            `Hi ${contactName}! 👋 Just checking in - did you have any questions about what we discussed?`,
                            `Hey ${contactName}! 😊 I wanted to follow up - are you still interested?`,
                            `Hi ${contactName}! Just wanted to check if you had a chance to think about it?`,
                            `Hey ${contactName}! 👋 Still here if you need any help or have questions!`,
                            `Hi ${contactName}! Just following up - let me know if you'd like to continue our conversation!`
                        ];
                        const message = messages[Math.floor(Math.random() * messages.length)];

                        // Send via Messenger
                        const response = await fetch(
                            `https://graph.facebook.com/v18.0/${followup.page_id}/messages?access_token=${page.page_access_token}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    recipient: { id: recipientId },
                                    message: { text: message },
                                    messaging_type: 'MESSAGE_TAG',
                                    tag: 'ACCOUNT_UPDATE'
                                })
                            }
                        );

                        if (response.ok) {
                            // Mark as sent
                            await supabase
                                .from('ai_followup_schedule')
                                .update({
                                    status: 'sent',
                                    sent_at: new Date().toISOString()
                                })
                                .eq('id', followup.id);

                            console.log(`[AI FOLLOWUP] ✅ Sent to ${contactName}`);
                            aiFollowupsSent++;
                        } else {
                            const err = await response.json();
                            console.error(`[AI FOLLOWUP] Failed:`, err.error?.message);

                            await supabase
                                .from('ai_followup_schedule')
                                .update({
                                    status: 'failed',
                                    error_message: err.error?.message || 'Send failed'
                                })
                                .eq('id', followup.id);

                            aiFollowupsFailed++;
                        }
                    } catch (err) {
                        console.error(`[AI FOLLOWUP] Error:`, err.message);
                        aiFollowupsFailed++;
                    }
                }
            }
        } catch (aiProcessError) {
            console.log('[AI FOLLOWUP] Error processing:', aiProcessError.message);
        }

        return res.status(200).json({
            success: true,
            message: 'Scheduled messages processed',
            processed,
            failed,
            aiFollowupsSent,
            aiFollowupsFailed
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
