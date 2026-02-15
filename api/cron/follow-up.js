import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with fallbacks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Analyze contact message timestamps to find the hour they're most active.
 * Returns the best hour (0-23) in Asia/Manila timezone, or null if no data.
 */
function getBestContactHour(messages) {
    if (!messages || messages.length === 0) return null;

    const hourCounts = new Array(24).fill(0);
    for (const msg of messages) {
        try {
            const manilaTime = new Date(
                new Date(msg.timestamp).toLocaleString("en-US", { timeZone: "Asia/Manila" })
            );
            hourCounts[manilaTime.getHours()]++;
        } catch { /* skip bad timestamps */ }
    }

    let bestHour = null;
    let maxCount = 0;
    for (let h = 0; h < 24; h++) {
        if (hourCounts[h] > maxCount) {
            maxCount = hourCounts[h];
            bestHour = h;
        }
    }
    return bestHour;
}

/**
 * Cron job to process:
 * 1. Booking follow-ups
 * 2. Calendar event reminders
 * 3. Recurring notification follow-ups (7-day silence at best contact hour)
 * Call via: GET /api/cron/follow-up
 */
export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('Starting follow-up cron job...');

    if (!supabaseUrl || !supabaseKey) {
        return res.status(200).json({ success: true, message: 'Supabase not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const now = new Date();
        const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        let sentCount = 0;
        const results = [];

        // =============================================
        // PART 1: Booking Follow-ups
        // =============================================
        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('*')
            .in('status', ['pending', 'confirmed'])
            .gte('booking_datetime', now.toISOString())
            .lte('booking_datetime', in24Hours.toISOString())
            .not('contact_psid', 'is', null);

        if (error && error.code !== '42P01' && !error.message?.includes('does not exist')) {
            throw error;
        }

        console.log(`Found ${bookings?.length || 0} bookings to check`);

        for (const booking of (bookings || [])) {
            const bookingTime = new Date(booking.booking_datetime);
            const hoursUntil = (bookingTime - now) / (1000 * 60 * 60);

            let followUpType = null;
            if (!booking.reminder_sent && hoursUntil <= 24 && hoursUntil > 2) {
                followUpType = 'reminder_24h';
            } else if (!booking.follow_up_sent && hoursUntil <= 2 && hoursUntil > 0.25) {
                followUpType = 'reminder_2h';
            }
            if (!followUpType) continue;

            const { data: page } = await supabase
                .from('facebook_pages')
                .select('page_access_token')
                .eq('page_id', booking.page_id)
                .single();

            if (!page?.page_access_token) continue;

            const formattedDate = bookingTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
            const h = bookingTime.getHours();
            const m = String(bookingTime.getMinutes()).padStart(2, '0');
            const formattedTime = `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;

            const message = followUpType === 'reminder_24h'
                ? `📅 Reminder: Your appointment is tomorrow!\n\n🗓 ${formattedDate}\n🕐 ${formattedTime}\n\nWe look forward to seeing you, ${booking.contact_name || ''}!`
                : `⏰ Your appointment is coming up soon!\n\n🗓 ${formattedDate}\n🕐 ${formattedTime}\n\nSee you very soon!`;

            try {
                const msgResponse = await fetch(
                    `${GRAPH_API_BASE}/${booking.page_id}/messages?access_token=${page.page_access_token}`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: booking.contact_psid }, message: { text: message } }) }
                );
                if (msgResponse.ok) {
                    const updateField = followUpType === 'reminder_24h' ? { reminder_sent: true } : { follow_up_sent: true };
                    await supabase.from('bookings').update({ ...updateField, updated_at: new Date().toISOString() }).eq('id', booking.id);
                    sentCount++;
                    results.push({ bookingId: booking.id, type: followUpType, status: 'sent' });
                } else {
                    const err = await msgResponse.json();
                    results.push({ bookingId: booking.id, type: followUpType, status: 'failed', error: err.error?.message });
                }
            } catch (msgError) {
                results.push({ bookingId: booking.id, type: followUpType, status: 'error', error: msgError.message });
            }
        }

        // =============================================
        // PART 2: Calendar Events (safe — no .status filter)
        // =============================================
        console.log('Checking calendar events for reminders...');
        let calendarEvents = [];

        try {
            const { data, error: calError } = await supabase
                .from('calendar_events')
                .select('*')
                .gte('start_time', now.toISOString())
                .lte('start_time', in24Hours.toISOString());

            if (!calError) {
                calendarEvents = (data || []).filter(e => !e.cancelled);
            } else if (calError.code !== '42P01') {
                console.error('Calendar events query error:', calError.message);
            }
        } catch (calErr) {
            console.log('Calendar events table not available');
        }

        console.log(`Found ${calendarEvents.length} calendar events to check`);

        for (const event of calendarEvents) {
            const eventTime = new Date(event.start_time);
            const hoursUntil = (eventTime - now) / (1000 * 60 * 60);

            let reminderType = null;
            if (!event.reminder_24h_sent && hoursUntil <= 24 && hoursUntil > 2) reminderType = '24h';
            else if (!event.reminder_1h_sent && hoursUntil <= 2 && hoursUntil > 0.25) reminderType = '1h';
            if (!reminderType) continue;

            let participantId = event.contact_psid;
            let pageId = null;

            if (event.conversation_id) {
                const { data: conv } = await supabase
                    .from('facebook_conversations')
                    .select('participant_id, page_id')
                    .eq('conversation_id', event.conversation_id)
                    .single();
                if (conv) { participantId = participantId || conv.participant_id; pageId = conv.page_id; }
            }
            if (!participantId || !pageId) continue;

            const { data: page } = await supabase
                .from('facebook_pages').select('page_access_token').eq('page_id', pageId).single();
            if (!page?.page_access_token) continue;

            const formattedDate = eventTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
            const h = eventTime.getHours();
            const m = String(eventTime.getMinutes()).padStart(2, '0');
            const formattedTime = `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
            const customerName = event.title?.replace('Booking: ', '') || 'there';

            const message = reminderType === '24h'
                ? `📅 Reminder: Your appointment is tomorrow!\n\n🗓 ${formattedDate}\n🕐 ${formattedTime}\n\nWe look forward to seeing you, ${customerName}!`
                : `⏰ Your appointment is coming up in about 1 hour!\n\n🗓 ${formattedDate}\n🕐 ${formattedTime}\n\nSee you very soon, ${customerName}!`;

            try {
                const msgResponse = await fetch(
                    `${GRAPH_API_BASE}/${pageId}/messages?access_token=${page.page_access_token}`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: participantId }, message: { text: message }, messaging_type: 'MESSAGE_TAG', tag: 'CONFIRMED_EVENT_UPDATE' }) }
                );
                if (msgResponse.ok) {
                    const updateField = reminderType === '24h' ? { reminder_24h_sent: true } : { reminder_1h_sent: true };
                    await supabase.from('calendar_events').update({ ...updateField, updated_at: new Date().toISOString() }).eq('id', event.id);
                    sentCount++;
                    results.push({ eventId: event.id, type: `calendar_${reminderType}`, status: 'sent' });
                } else {
                    const err = await msgResponse.json();
                    results.push({ eventId: event.id, type: `calendar_${reminderType}`, status: 'failed', error: err.error?.message });
                }
            } catch (msgError) {
                results.push({ eventId: event.id, type: `calendar_${reminderType}`, status: 'error', error: msgError.message });
            }
        }

        // =============================================
        // PART 3: Recurring Notification Follow-ups
        // Send 1 follow-up after 7 days of silence, at best contact hour
        // =============================================
        console.log('[RECURRING-FOLLOWUP] Checking for 7-day silence follow-ups...');
        let recurringResults = { checked: 0, sent: 0, skipped: 0 };

        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

            const { data: tokens, error: tokenErr } = await supabase
                .from('recurring_notification_tokens')
                .select('id, conversation_id, participant_id, page_id, token, frequency')
                .eq('token_status', 'active')
                .eq('followup_sent', false);

            if (tokenErr && tokenErr.code !== '42P01') {
                console.error('[RECURRING-FOLLOWUP] Token query error:', tokenErr.message);
            }

            if (tokens && tokens.length > 0) {
                recurringResults.checked = tokens.length;

                for (const tokenRecord of tokens) {
                    try {
                        // Check 7-day silence
                        const { data: lastMsg } = await supabase
                            .from('facebook_messages').select('timestamp')
                            .eq('conversation_id', tokenRecord.conversation_id)
                            .eq('is_from_page', false)
                            .order('timestamp', { ascending: false }).limit(1).single();

                        if (!lastMsg || new Date(lastMsg.timestamp) > new Date(sevenDaysAgo)) {
                            recurringResults.skipped++;
                            continue;
                        }

                        // Don't send if we messaged within 24h
                        const { data: lastPageMsg } = await supabase
                            .from('facebook_messages').select('timestamp')
                            .eq('conversation_id', tokenRecord.conversation_id)
                            .eq('is_from_page', true)
                            .order('timestamp', { ascending: false }).limit(1).single();

                        if (lastPageMsg && new Date(lastPageMsg.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)) {
                            recurringResults.skipped++;
                            continue;
                        }

                        // Best-time analysis
                        const { data: contactMsgs } = await supabase
                            .from('facebook_messages').select('timestamp')
                            .eq('conversation_id', tokenRecord.conversation_id)
                            .eq('is_from_page', false)
                            .order('timestamp', { ascending: false }).limit(50);

                        let bestHour = getBestContactHour(contactMsgs || []);

                        if (bestHour === null) {
                            const { data: neighborMsgs } = await supabase
                                .from('facebook_messages').select('timestamp')
                                .eq('page_id', tokenRecord.page_id)
                                .eq('is_from_page', false)
                                .order('timestamp', { ascending: false }).limit(200);
                            bestHour = getBestContactHour(neighborMsgs || []);
                            if (bestHour === null) bestHour = 10;
                        }

                        const nowManila = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
                        const currentHour = nowManila.getHours();
                        const hourDiff = Math.abs(currentHour - bestHour);
                        if (!(hourDiff <= 1 || hourDiff >= 23)) {
                            recurringResults.skipped++;
                            continue;
                        }

                        // Personalization
                        const { data: conv } = await supabase
                            .from('facebook_conversations')
                            .select('participant_name, extracted_details, ai_analysis')
                            .eq('conversation_id', tokenRecord.conversation_id).single();

                        const name = conv?.participant_name || 'po';
                        const details = conv?.extracted_details || {};
                        const analysis = conv?.ai_analysis || {};
                        const budget = details.budget || analysis.budget;
                        const location = details.location || analysis.location;

                        let followUpMessage;
                        if (budget && location) followUpMessage = `Hi ${name}! 😊 May bago po kaming listing around ${location} na within your ₱${budget} budget! Gusto mo po ba i-check? 🏠`;
                        else if (location) followUpMessage = `Hi ${name}! 😊 May bagong property po kami sa ${location} area! Interested ka pa po ba? 🏠`;
                        else if (budget) followUpMessage = `Hi ${name}! 😊 Nakakita po kami ng magandang property na pasok sa budget mo! Want me to share it? 🏠`;
                        else followUpMessage = `Hi ${name}! 😊 Kumusta na po? May mga bagong listings po kami na baka magustuhan mo! Gusto mo po ba i-check? 🏠`;

                        const { data: page } = await supabase
                            .from('facebook_pages').select('page_access_token')
                            .eq('page_id', tokenRecord.page_id).single();

                        if (!page?.page_access_token) { recurringResults.skipped++; continue; }

                        const sendResp = await fetch(
                            `${GRAPH_API_BASE}/me/messages?access_token=${page.page_access_token}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    recipient: { notification_messages_token: tokenRecord.token },
                                    message: { text: followUpMessage },
                                }),
                            }
                        );

                        const sendResult = await sendResp.json();
                        if (sendResult.error) {
                            if (sendResult.error.code === 551 || sendResult.error.code === 10) {
                                await supabase.from('recurring_notification_tokens').update({ token_status: 'expired' }).eq('id', tokenRecord.id);
                            }
                            continue;
                        }

                        await supabase.from('recurring_notification_tokens').update({ followup_sent: true, last_used_at: new Date().toISOString() }).eq('id', tokenRecord.id);

                        if (sendResult.message_id) {
                            await supabase.from('facebook_messages').insert({
                                message_id: sendResult.message_id,
                                conversation_id: tokenRecord.conversation_id,
                                page_id: tokenRecord.page_id,
                                sender_id: tokenRecord.page_id,
                                message_text: followUpMessage,
                                timestamp: new Date().toISOString(),
                                is_from_page: true,
                                sent_source: 'recurring_followup',
                            });
                        }

                        console.log(`[RECURRING-FOLLOWUP] ✅ Sent to ${name}`);
                        recurringResults.sent++;
                        sentCount++;
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (innerErr) {
                        console.error(`[RECURRING-FOLLOWUP] Error:`, innerErr.message);
                    }
                }
            }
        } catch (recurringErr) {
            console.log('[RECURRING-FOLLOWUP] Non-fatal:', recurringErr.message);
        }

        console.log(`Follow-up cron complete. Sent ${sentCount} total.`);

        return res.status(200).json({
            success: true,
            bookingsChecked: bookings?.length || 0,
            calendarEventsChecked: calendarEvents.length,
            recurringFollowups: recurringResults,
            sent: sentCount,
            results
        });
    } catch (error) {
        console.error('Follow-up cron error:', error);
        return res.status(500).json({ error: error.message });
    }
}

export const config = { maxDuration: 60 };
