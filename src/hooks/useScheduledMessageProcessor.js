import { useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '../services/supabase';

/**
 * useScheduledMessageProcessor Hook
 * 
 * Client-side processor for scheduled messages.
 * Checks for pending messages every 60 seconds while the user is online.
 * This reduces server load by handling scheduling locally when possible.
 */
export const useScheduledMessageProcessor = (isActive = true) => {
    const intervalRef = useRef(null);
    const processingRef = useRef(false);

    // Process pending scheduled messages
    const processPendingMessages = useCallback(async () => {
        if (processingRef.current) return; // Prevent concurrent processing
        processingRef.current = true;

        try {
            const supabase = getSupabaseClient();
            if (!supabase) return;

            // Get pending scheduled messages that are due
            const now = new Date().toISOString();
            const { data: pendingMessages, error } = await supabase
                .from('scheduled_messages')
                .select('*')
                .eq('status', 'pending')
                .lte('scheduled_for', now)
                .order('scheduled_for', { ascending: true })
                .limit(10);

            if (error) {
                console.error('Error fetching scheduled messages:', error);
                return;
            }

            if (!pendingMessages || pendingMessages.length === 0) {
                return; // No pending messages
            }

            console.log(`[Scheduler] Processing ${pendingMessages.length} pending message(s)`);

            for (const msg of pendingMessages) {
                try {
                    // Get page access token
                    const { data: page, error: pageError } = await supabase
                        .from('facebook_pages')
                        .select('page_access_token')
                        .eq('page_id', msg.page_id)
                        .single();

                    if (pageError || !page) {
                        console.error(`Page not found for message ${msg.id}`);
                        await markMessageFailed(supabase, msg.id, 'Page not found');
                        continue;
                    }

                    // Get recipients based on filter
                    const recipients = await getRecipients(supabase, msg);

                    if (recipients.length === 0) {
                        console.log(`No recipients found for message ${msg.id}`);
                        await markMessageCompleted(supabase, msg.id, 0, 0);
                        continue;
                    }

                    console.log(`[Scheduler] Sending to ${recipients.length} recipient(s)`);

                    let successCount = 0;
                    let failCount = 0;

                    // Send to each recipient
                    for (const recipient of recipients) {
                        try {
                            const response = await fetch(
                                `https://graph.facebook.com/v21.0/${msg.page_id}/messages`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        recipient: { id: recipient },
                                        message: { text: msg.message_text },
                                        messaging_type: 'MESSAGE_TAG',
                                        tag: 'HUMAN_AGENT'
                                    })
                                }
                            );

                            if (response.ok) {
                                successCount++;
                            } else {
                                failCount++;
                            }

                            // Rate limiting - wait 200ms between messages
                            await new Promise(r => setTimeout(r, 200));
                        } catch (sendErr) {
                            console.error(`Error sending to ${recipient}:`, sendErr);
                            failCount++;
                        }
                    }

                    // Mark as completed
                    await markMessageCompleted(supabase, msg.id, successCount, failCount);
                    console.log(`[Scheduler] Message ${msg.id} completed: ${successCount} sent, ${failCount} failed`);

                } catch (msgErr) {
                    console.error(`Error processing message ${msg.id}:`, msgErr);
                    await markMessageFailed(supabase, msg.id, msgErr.message);
                }
            }

        } catch (err) {
            console.error('[Scheduler] Error in processPendingMessages:', err);
        } finally {
            processingRef.current = false;
        }
    }, []);

    // Start/stop interval based on isActive
    useEffect(() => {
        if (isActive) {
            // Check immediately on mount
            processPendingMessages();

            // Then check every 60 seconds
            intervalRef.current = setInterval(processPendingMessages, 60 * 1000);

            console.log('[Scheduler] Client-side scheduler started (60s interval)');
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                console.log('[Scheduler] Client-side scheduler stopped');
            }
        };
    }, [isActive, processPendingMessages]);

    return {
        processNow: processPendingMessages
    };
};

// Helper: Get recipients based on filter
async function getRecipients(supabase, msg) {
    let query = supabase
        .from('facebook_conversations')
        .select('participant_id')
        .eq('page_id', msg.page_id)
        .or('is_archived.is.null,is_archived.eq.false');

    // Apply filters
    switch (msg.filter_type) {
        case 'all':
            // No additional filter
            break;
        case 'booked':
        case 'pipeline':
            query = query.not('linked_client_id', 'is', null);
            break;
        case 'unbooked':
        case 'not_pipeline':
            query = query.is('linked_client_id', null);
            break;
        case 'no_reply':
            query = query.neq('last_reply_from', 'page');
            break;
        case 'selected':
            if (msg.recipient_ids && msg.recipient_ids.length > 0) {
                return msg.recipient_ids;
            }
            return [];
        case 'tag':
            if (msg.filter_tag_id) {
                // Get conversations with this tag
                const { data: tagged } = await supabase
                    .from('conversation_tag_assignments')
                    .select('conversation_id')
                    .eq('tag_id', msg.filter_tag_id);

                if (tagged && tagged.length > 0) {
                    const convIds = tagged.map(t => t.conversation_id);
                    const { data: convs } = await supabase
                        .from('facebook_conversations')
                        .select('participant_id')
                        .in('conversation_id', convIds);
                    return (convs || []).map(c => c.participant_id);
                }
                return [];
            }
            break;
    }

    const { data, error } = await query.limit(500);
    if (error) {
        console.error('Error getting recipients:', error);
        return [];
    }

    return (data || []).map(c => c.participant_id);
}

// Helper: Mark message as completed
async function markMessageCompleted(supabase, messageId, successCount, failCount) {
    await supabase
        .from('scheduled_messages')
        .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            success_count: successCount,
            fail_count: failCount
        })
        .eq('id', messageId);
}

// Helper: Mark message as failed
async function markMessageFailed(supabase, messageId, errorMessage) {
    await supabase
        .from('scheduled_messages')
        .update({
            status: 'failed',
            processed_at: new Date().toISOString(),
            error_message: errorMessage
        })
        .eq('id', messageId);
}

export default useScheduledMessageProcessor;
