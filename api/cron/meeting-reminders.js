/**
 * Meeting Reminder Cron Job
 * Sends reminders to contacts before their scheduled meetings
 * Runs every 15 minutes
 * 
 * Reminder schedule:
 * - 24 hours before: Initial reminder
 * - 2 hours before: Get ready reminder
 * - 30 minutes before: Final reminder
 */

export default async function handler(req, res) {
    // Optional: Verify cron secret (skip if not configured)
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[MEETING-REMINDER] Starting meeting reminder check...');

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const now = new Date();

        // Reminder windows (in milliseconds)
        const reminderWindows = [
            { name: '24h', minMs: 23 * 60 * 60 * 1000, maxMs: 24 * 60 * 60 * 1000, message: '📅 Reminder: You have a meeting TOMORROW' },
            { name: '2h', minMs: 1.5 * 60 * 60 * 1000, maxMs: 2 * 60 * 60 * 1000, message: '⏰ Reminder: Your meeting is in 2 HOURS' },
            { name: '30min', minMs: 25 * 60 * 1000, maxMs: 35 * 60 * 1000, message: '🔔 FINAL REMINDER: Your meeting starts in 30 MINUTES' }
        ];

        let remindersSent = 0;

        for (const window of reminderWindows) {
            const minTime = new Date(now.getTime() + window.minMs);
            const maxTime = new Date(now.getTime() + window.maxMs);

            // Get meetings in this window that haven't been reminded yet
            const { data: meetings, error } = await supabase
                .from('calendar_events')
                .select('*')
                .gte('start_time', minTime.toISOString())
                .lte('start_time', maxTime.toISOString())
                .eq('status', 'scheduled')
                .or(`reminder_${window.name}_sent.is.null,reminder_${window.name}_sent.eq.false`);

            if (error) {
                console.log(`[MEETING-REMINDER] Error fetching ${window.name} meetings:`, error.message);
                continue;
            }

            console.log(`[MEETING-REMINDER] Found ${meetings?.length || 0} meetings for ${window.name} reminder`);

            for (const meeting of meetings || []) {
                try {
                    // Find the conversation for this meeting
                    const conversationId = meeting.notes?.match(/Conversation:\s*(.+)/)?.[1]?.trim();

                    if (!conversationId) {
                        console.log(`[MEETING-REMINDER] No conversation ID for meeting ${meeting.id}`);
                        continue;
                    }

                    // Get conversation details
                    const { data: conversation } = await supabase
                        .from('facebook_conversations')
                        .select('participant_id, page_id')
                        .eq('conversation_id', conversationId)
                        .single();

                    if (!conversation) {
                        console.log(`[MEETING-REMINDER] Conversation not found: ${conversationId}`);
                        continue;
                    }

                    // Get page access token
                    const { data: page } = await supabase
                        .from('connected_pages')
                        .select('page_access_token')
                        .eq('page_id', conversation.page_id)
                        .single();

                    if (!page?.page_access_token) {
                        console.log(`[MEETING-REMINDER] No page token for page ${conversation.page_id}`);
                        continue;
                    }

                    // Format meeting time
                    const meetingTime = new Date(meeting.start_time);
                    const timeStr = meetingTime.toLocaleString('en-PH', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    });

                    // Send reminder message
                    const reminderMessage = `${window.message}\n\n📅 ${meeting.title}\n⏰ ${timeStr}\n\nSee you then! 😊`;

                    const sendResponse = await fetch(
                        `https://graph.facebook.com/v18.0/${conversation.page_id}/messages?access_token=${page.page_access_token}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                recipient: { id: conversation.participant_id },
                                message: { text: reminderMessage },
                                messaging_type: 'MESSAGE_TAG',
                                tag: 'CONFIRMED_EVENT_UPDATE'
                            })
                        }
                    );

                    if (sendResponse.ok) {
                        // Mark reminder as sent
                        await supabase
                            .from('calendar_events')
                            .update({ [`reminder_${window.name}_sent`]: true })
                            .eq('id', meeting.id);

                        console.log(`[MEETING-REMINDER] ✅ Sent ${window.name} reminder for meeting ${meeting.id}`);
                        remindersSent++;
                    } else {
                        const errText = await sendResponse.text();
                        console.log(`[MEETING-REMINDER] Failed to send reminder:`, errText);
                    }
                } catch (meetingErr) {
                    console.log(`[MEETING-REMINDER] Error processing meeting ${meeting.id}:`, meetingErr.message);
                }
            }
        }

        console.log(`[MEETING-REMINDER] Complete. Sent ${remindersSent} reminders.`);

        return res.status(200).json({
            success: true,
            remindersSent,
            timestamp: now.toISOString()
        });

    } catch (err) {
        console.error('[MEETING-REMINDER] Fatal error:', err);
        return res.status(500).json({ error: err.message });
    }
}
