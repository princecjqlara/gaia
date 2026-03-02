import { createClient } from '@supabase/supabase-js';

/**
 * AI Silence Detection Cron (OPTIMIZED FOR SPEED)
 * Finds conversations with no activity for X hours and schedules follow-ups
 * Uses fast heuristic-based timing instead of slow AI API calls
 * Runs every 30 minutes via Vercel cron or external cron service
 */

let supabase = null;
function getSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (!url || !key) return null;
        supabase = createClient(url, key);
    }
    return supabase;
}

function getNextDailyOccurrence(hourOfDay, referenceTime = new Date()) {
    const next = new Date(referenceTime);
    next.setHours(hourOfDay, 0, 0, 0);

    if (next.getTime() <= referenceTime.getTime()) {
        next.setDate(next.getDate() + 1);
    }

    return next;
}

/**
 * Calculate best time to contact based on engagement data
 * Returns the next daily occurrence of the best hour
 */
export async function calculateBestTimeToContact(db, conversationId, pageId) {
    void pageId;

    try {
        // Get engagement history for this contact
        const { data: engagements } = await db
            .from('contact_engagement')
            .select('hour_of_day, response_latency_seconds')
            .eq('conversation_id', conversationId)
            .eq('message_direction', 'inbound')
            .order('message_timestamp', { ascending: false })
            .limit(30);

        let bestSlots = [];

        if (engagements && engagements.length >= 3) {
            // Calculate scores by hour only (daily pattern)
            const timeScores = {};
            for (const eng of engagements) {
                const hour = Number.parseInt(eng.hour_of_day, 10);
                if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;

                if (!timeScores[hour]) {
                    timeScores[hour] = { hour, count: 0, latency: 0 };
                }
                timeScores[hour].count++;
                timeScores[hour].latency += eng.response_latency_seconds || 0;
            }

            // Rank by frequency and low latency
            bestSlots = Object.values(timeScores)
                .map((slot) => ({
                    ...slot,
                    score: slot.count * (1 - Math.min(slot.latency / slot.count / 7200, 0.8))
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);
        }

        // If not enough data, use deterministic defaults (business hours)
        if (bestSlots.length === 0) {
            const hash = (conversationId || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
            bestSlots = [
                { hour: 9 + (Math.abs(hash) % 8), score: 0, count: 0 }
            ];
        }

        const now = new Date();
        const bestHour = bestSlots[0].hour;

        return {
            bestSlots,
            nextBestTime: getNextDailyOccurrence(bestHour, now),
            hasData: engagements && engagements.length >= 3
        };
    } catch (err) {
        console.log('[CRON] Best time calc error:', err.message);
        const now = new Date();
        return {
            bestSlots: [],
            nextBestTime: getNextDailyOccurrence(10, now),
            hasData: false
        };
    }
}

function parseTimestampToIso(value) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function getConversationMessages(conversation, maxMessagesPerConversation = 25) {
    const rawMessages = Array.isArray(conversation?.messages?.data)
        ? conversation.messages.data
        : [];

    return rawMessages
        .filter((msg) => msg?.id && parseTimestampToIso(msg.created_time))
        .sort((a, b) => {
            const aTime = new Date(a.created_time).getTime();
            const bTime = new Date(b.created_time).getTime();
            return bTime - aTime;
        })
        .slice(0, Math.max(1, maxMessagesPerConversation));
}

function getPrimaryParticipant(participants = [], pageId) {
    const normalizedPageId = String(pageId || '');
    const nonPageParticipant = participants.find((p) => p?.id && String(p.id) !== normalizedPageId);
    if (nonPageParticipant) return nonPageParticipant;
    return participants.find((p) => p?.id) || null;
}

export function buildBackfillConversationRecords({
    pageId,
    conversations,
    now = new Date(),
    maxMessagesPerConversation = 25
} = {}) {
    const nowIso = parseTimestampToIso(now) || new Date().toISOString();
    const records = {
        conversations: [],
        messages: [],
        engagements: []
    };

    const safeConversations = Array.isArray(conversations) ? conversations : [];

    for (const conversation of safeConversations) {
        const conversationId = conversation?.id;
        if (!conversationId) continue;

        const participants = Array.isArray(conversation?.participants?.data)
            ? conversation.participants.data
            : [];
        const participant = getPrimaryParticipant(participants, pageId);
        const participantId = participant?.id || `unknown_${conversationId}`;
        const participantName = participant?.name || 'Facebook Contact';

        const messages = getConversationMessages(conversation, maxMessagesPerConversation);
        const latestMessage = messages[0] || null;

        const latestTimestamp = parseTimestampToIso(latestMessage?.created_time)
            || parseTimestampToIso(conversation?.updated_time);

        if (!latestTimestamp) continue;

        const latestSenderId = latestMessage?.from?.id;
        const latestFromPage = latestSenderId
            ? String(latestSenderId) === String(pageId)
            : null;

        records.conversations.push({
            conversation_id: conversationId,
            page_id: pageId,
            participant_id: participantId,
            participant_name: participantName,
            last_message_text: latestMessage?.message || conversation?.snippet || null,
            last_message_time: latestTimestamp,
            last_message_from_page: latestFromPage,
            unread_count: Number.isFinite(conversation?.unread_count) ? conversation.unread_count : 0,
            updated_at: nowIso
        });

        for (const message of messages) {
            const messageTimestamp = parseTimestampToIso(message?.created_time);
            if (!message?.id || !messageTimestamp) continue;

            const isFromPage = String(message?.from?.id || '') === String(pageId);

            records.messages.push({
                conversation_id: conversationId,
                message_id: message.id,
                sender_id: message?.from?.id || null,
                sender_name: message?.from?.name || null,
                is_from_page: isFromPage,
                is_read: isFromPage ? true : false,
                message_text: message?.message || null,
                attachments: message?.attachments?.data || [],
                timestamp: messageTimestamp
            });

            const msgDate = new Date(messageTimestamp);
            records.engagements.push({
                conversation_id: conversationId,
                page_id: pageId,
                participant_id: message?.from?.id || participantId,
                message_direction: isFromPage ? 'outbound' : 'inbound',
                day_of_week: msgDate.getDay(),
                hour_of_day: msgDate.getHours(),
                engagement_score: 1,
                message_timestamp: messageTimestamp
            });
        }
    }

    return records;
}

async function fetchConversationsForBackfill(pageId, accessToken, options = {}) {
    const {
        limit = 40,
        afterCursor = null,
        maxMessagesPerConversation = 25
    } = options;

    const params = new URLSearchParams();
    params.set('fields', `id,updated_time,unread_count,participants.limit(10){id,name},messages.limit(${maxMessagesPerConversation}){id,message,from,created_time,attachments}`);
    params.set('limit', String(limit));
    params.set('access_token', accessToken);
    if (afterCursor) params.set('after', afterCursor);

    const response = await fetch(`https://graph.facebook.com/v21.0/${pageId}/conversations?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload?.error) {
        const errorMessage = payload?.error?.message || `HTTP ${response.status}`;
        throw new Error(errorMessage);
    }

    return {
        conversations: Array.isArray(payload?.data) ? payload.data : [],
        nextCursor: payload?.paging?.cursors?.after || null
    };
}

async function hydrateOldContactsForFollowups(db, checkTimeout, options = {}) {
    const maxConversations = Number.isFinite(options?.maxConversations)
        ? Math.max(0, options.maxConversations)
        : 120;
    const maxPages = Number.isFinite(options?.maxPages)
        ? Math.max(1, options.maxPages)
        : 5;
    const maxPageBatches = Number.isFinite(options?.maxPageBatches)
        ? Math.max(1, options.maxPageBatches)
        : 2;

    const metrics = {
        hydratedConversations: 0,
        hydratedMessages: 0,
        hydratedPages: 0
    };

    if (maxConversations === 0) {
        return metrics;
    }

    try {
        const { data: pages, error: pagesError } = await db
            .from('facebook_pages')
            .select('page_id, page_access_token, is_active')
            .neq('page_access_token', 'pending')
            .order('last_synced_at', { ascending: true, nullsFirst: true })
            .limit(maxPages);

        if (pagesError) {
            console.log('[CRON] Old-contact hydration skipped (pages query):', pagesError.message);
            return metrics;
        }

        const activePages = (pages || []).filter((page) => page?.page_id && page?.page_access_token && page?.is_active !== false);

        for (const page of activePages) {
            if (checkTimeout()) break;
            if (metrics.hydratedConversations >= maxConversations) break;

            let hydratedThisPage = false;
            let pageBatches = 0;
            let afterCursor = null;

            while (pageBatches < maxPageBatches && metrics.hydratedConversations < maxConversations) {
                if (checkTimeout()) break;

                const remaining = maxConversations - metrics.hydratedConversations;
                const fetchLimit = Math.max(1, Math.min(40, remaining));

                let batch;
                try {
                    batch = await fetchConversationsForBackfill(page.page_id, page.page_access_token, {
                        limit: fetchLimit,
                        afterCursor
                    });
                } catch (fetchError) {
                    console.log(`[CRON] Old-contact hydration failed for page ${page.page_id}: ${fetchError.message}`);
                    break;
                }

                const records = buildBackfillConversationRecords({
                    pageId: page.page_id,
                    conversations: batch.conversations
                });

                if (records.conversations.length > 0) {
                    const { error: conversationError } = await db
                        .from('facebook_conversations')
                        .upsert(records.conversations, { onConflict: 'conversation_id' });

                    if (!conversationError) {
                        metrics.hydratedConversations += records.conversations.length;
                        hydratedThisPage = true;
                    } else {
                        console.log(`[CRON] Old-contact conversation upsert failed for page ${page.page_id}: ${conversationError.message}`);
                    }
                }

                if (records.messages.length > 0) {
                    const { error: messageError } = await db
                        .from('facebook_messages')
                        .upsert(records.messages, { onConflict: 'message_id' });

                    if (!messageError) {
                        metrics.hydratedMessages += records.messages.length;
                    } else {
                        console.log(`[CRON] Old-contact message upsert failed for page ${page.page_id}: ${messageError.message}`);
                    }
                }

                if (records.engagements.length > 0) {
                    const { error: engagementError } = await db
                        .from('contact_engagement')
                        .upsert(records.engagements, { onConflict: 'conversation_id,message_timestamp', ignoreDuplicates: true });
                    if (engagementError) {
                        console.log(`[CRON] Old-contact engagement upsert failed for page ${page.page_id}: ${engagementError.message}`);
                    }
                }

                pageBatches += 1;
                afterCursor = batch.nextCursor;
                if (!afterCursor) break;
            }

            if (hydratedThisPage) {
                metrics.hydratedPages += 1;
            }
        }
    } catch (error) {
        console.log('[CRON] Old-contact hydration error:', error.message);
    }

    return metrics;
}

export default async function handler(req, res) {
    // Track start time for timeout protection
    const startTime = Date.now();
    const MAX_EXECUTION_TIME = 25000; // 25 seconds (5s buffer before 30s timeout)

    const checkTimeout = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed > MAX_EXECUTION_TIME) {
            console.log(`[CRON] ⏰ Approaching timeout at ${elapsed}ms, returning early`);
            return true;
        }
        return false;
    };

    // Verify cron authorization (optional - only checked if CRON_SECRET is set)
    const authHeader = req.headers.authorization;
    const vercelCron = req.headers['x-vercel-cron'];
    const cronSecret = process.env.CRON_SECRET;

    // Skip auth if Vercel cron OR if no secret is configured
    if (cronSecret && !vercelCron && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[CRON] AI Follow-up silence detection started');

    try {
        const db = getSupabase();
        if (!db) {
            throw new Error('Database not configured');
        }

        const now = new Date();
        const results = {
            scanned: 0,
            scheduled: 0,
            skipped: 0,
            timedOut: false
        };

        if (checkTimeout()) {
            results.timedOut = true;
            return res.status(200).json({ message: 'Partial completion - timeout before processing', ...results });
        }

        // Get AI chatbot config
        const { data: settings } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        const config = settings?.value || {};

        // Check global bot enabled - if false, skip all processing
        if (config.global_bot_enabled === false) {
            console.log('[CRON] ⛔ Global bot is DISABLED - skipping follow-up scheduling');
            return res.status(200).json({
                message: 'Bot is globally disabled',
                disabled: true,
                ...results
            });
        }

        // Respect admin follow-up toggles
        if (config.enable_silence_followups === false || config.enable_intuition_followups === false) {
            console.log('[CRON] Follow-ups disabled in settings - skipping scheduling');
            return res.status(200).json({
                message: 'Follow-ups disabled in settings',
                disabled: true,
                ...results
            });
        }

        // Use configured silence hours OR default to 0.5 hours (30 mins) for aggressive first follow-up
        const silenceHours = config.intuition_silence_hours || 0.5;
        const maxPerRun = 50; // Increased batch size to process more users per run

        if (config.include_old_page_contacts !== false && !checkTimeout()) {
            const hydrationMetrics = await hydrateOldContactsForFollowups(db, checkTimeout, {
                maxConversations: Number.isFinite(config.old_contact_backfill_limit)
                    ? config.old_contact_backfill_limit
                    : 120,
                maxPages: Number.isFinite(config.old_contact_backfill_page_limit)
                    ? config.old_contact_backfill_page_limit
                    : 5,
                maxPageBatches: Number.isFinite(config.old_contact_backfill_batches_per_page)
                    ? config.old_contact_backfill_batches_per_page
                    : 2
            });
            results.hydratedConversations = hydrationMetrics.hydratedConversations;
            results.hydratedMessages = hydrationMetrics.hydratedMessages;
            results.hydratedPages = hydrationMetrics.hydratedPages;
        }

        // Calculate cutoff time (conversations inactive for X hours)
        const cutoffTime = new Date(now.getTime() - (silenceHours * 60 * 60 * 1000));

        // Find conversations that need follow-up:
        // - AI is enabled (or null = default enabled)
        // - Human hasn't taken over
        // - Intuition follow-ups not disabled
        // - No meeting scheduled
        // - Last message time is older than cutoff (silence period passed)
        const { data: conversations, error } = await db
            .from('facebook_conversations')
            .select(`
                conversation_id,
                page_id,
                participant_name,
                participant_id,
                last_message_time,
                last_message_from_page,
                active_goal_id,
                ai_enabled,
                human_takeover,
                lead_status,
                pipeline_stage,
                intuition_followup_disabled,
                best_time_scheduling_disabled,
                meeting_scheduled
            `)
            .neq('ai_enabled', false) // Include null (default enabled) and true
            .neq('human_takeover', true) // Include null and false
            .neq('intuition_followup_disabled', true) // Skip if intuition follow-ups disabled
            .neq('best_time_scheduling_disabled', true) // Skip if best time scheduling disabled
            .neq('meeting_scheduled', true) // Skip if meeting already scheduled/mentioned
            // SKIP booked/converted customers - they don't need follow-ups
            .not('lead_status', 'in', '(appointment_booked,converted)')
            .neq('pipeline_stage', 'booked') // Also skip if pipeline_stage is 'booked'
            // Follow up any conversation that's been inactive for the silence period
            .lt('last_message_time', cutoffTime.toISOString())
            // Allow older conversations; delivery switches to UTILITY templates outside 7-day window
            .order('last_message_time', { ascending: true }) // Oldest first (most in need of follow-up)
            .limit(maxPerRun);

        if (error) {
            console.error('[CRON] Error fetching conversations:', error);
            throw error;
        }

        if (!conversations || conversations.length === 0) {
            console.log('[CRON] No conversations need silence follow-up');
            return res.status(200).json({ message: 'No silence follow-ups needed', ...results });
        }

        console.log(`[CRON] Found ${conversations.length} conversations with silence`);
        results.scanned = conversations.length;

        for (const conv of conversations) {
            // Check timeout before processing each conversation
            if (checkTimeout()) {
                console.log(`[CRON] ⏰ Timeout reached after processing ${results.scheduled + results.skipped} conversations`);
                results.timedOut = true;
                break;
            }

            try {
                // Check for existing pending follow-ups
                const { data: existingFollowups } = await db
                    .from('ai_followup_schedule')
                    .select('id, scheduled_at, created_at')
                    .eq('conversation_id', conv.conversation_id)
                    .eq('status', 'pending');

                if (existingFollowups && existingFollowups.length > 0) {
                    // Check if existing follow-up is stale (scheduled to run more than 2 hours AGO and still pending)
                    // This means it was supposed to run but didn't - truly stale
                    const oldestFollowup = existingFollowups[0];
                    const scheduledTime = new Date(oldestFollowup.scheduled_at);
                    const hoursPastScheduled = (now.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60);

                    if (hoursPastScheduled > 2) {
                        // Truly stale - scheduled to run >2 hours ago but still pending
                        console.log(`[CRON] Cancelling stale follow-up for ${conv.conversation_id} (was scheduled ${hoursPastScheduled.toFixed(1)}h ago)`);
                        await db
                            .from('ai_followup_schedule')
                            .update({ status: 'cancelled', error_message: 'Stale: was scheduled >2h ago' })
                            .eq('id', oldestFollowup.id);
                    } else {
                        // Follow-up is still scheduled for the future OR recently due - skip
                        results.skipped++;
                        continue;
                    }
                }

                // Calculate minutes since last message for smart timing
                const minutesSince = Math.floor((now - new Date(conv.last_message_time)) / (1000 * 60));
                const hoursSince = Math.floor(minutesSince / 60);
                const daysSince = Math.floor(hoursSince / 24);

                // GRADUATED FOLLOW-UP STRATEGY (Updated):
                // - 0-1 hours: AGGRESSIVE - follow up every 30 minutes
                // - 1-4 hours: MODERATE - follow up every 1 hour  
                // - 4-24 hours: MILD - follow up every 6 hours
                // - 24+ hours: ONCE DAILY at best time to contact

                let waitMinutes;
                let reason;
                let aggressiveness;

                if (hoursSince < 1) {
                    // AGGRESSIVE: Very fresh lead - act fast!
                    waitMinutes = 30;
                    reason = `Hot lead! ${minutesSince} mins silent - quick follow-up`;
                    aggressiveness = 'aggressive';
                } else if (hoursSince < 4) {
                    // MODERATE: Still warm, check every hour
                    waitMinutes = 60; // 1 hour
                    reason = `Warm lead, ${hoursSince}h silent - hourly follow-up`;
                    aggressiveness = 'moderate';
                } else if (hoursSince < 24) {
                    // MILD: They may be busy, check every 6 hours
                    waitMinutes = 360; // 6 hours
                    reason = `${hoursSince}h silent - gentle check-in every 6h`;
                    aggressiveness = 'mild';
                } else {
                    // 24h+ SILENCE: ONCE DAILY at best time to contact!
                    const bestTime = await calculateBestTimeToContact(db, conv.conversation_id, conv.page_id);
                    const msTilBest = bestTime.nextBestTime.getTime() - now.getTime();

                    // Keep scheduling close to the best hour while avoiding immediate sends
                    waitMinutes = Math.max(5, Math.floor(msTilBest / (1000 * 60)));

                    // Safety cap (best-time function should already stay within 24h)
                    waitMinutes = Math.min(waitMinutes, 24 * 60);

                    if (bestTime.hasData) {
                        reason = `${daysSince} day(s) silent - daily follow-up at best time (${bestTime.nextBestTime.toLocaleTimeString()})`;
                    } else {
                        reason = `${daysSince} day(s) silent - daily follow-up at default business hours`;
                    }
                    aggressiveness = 'best_time';
                }

                // Calculate scheduled time
                const waitMs = waitMinutes * 60 * 1000;
                const scheduledAt = new Date(now.getTime() + waitMs);

                // Create follow-up with correct type
                const followUpType = aggressiveness === 'best_time' ? 'best_time' : 'intuition';

                const { error: insertError } = await db
                    .from('ai_followup_schedule')
                    .insert({
                        conversation_id: conv.conversation_id,
                        page_id: conv.page_id,
                        scheduled_at: scheduledAt.toISOString(),
                        scheduled_for: scheduledAt.toISOString(),
                        follow_up_type: followUpType,
                        reason: reason,
                        status: 'pending'
                    });

                if (insertError) {
                    console.error(`[CRON] Error scheduling for ${conv.conversation_id}:`, insertError);
                    results.skipped++;
                } else {
                    console.log(`[CRON] ✅ Scheduled follow-up for ${conv.participant_name || conv.conversation_id} at ${scheduledAt.toISOString()} (in ${waitMinutes} mins)`);
                    results.scheduled++;

                    // Log the action
                    await db.from('ai_action_log').insert({
                        conversation_id: conv.conversation_id,
                        page_id: conv.page_id,
                        action_type: 'silence_detected',
                        action_data: {
                            hoursSince,
                            waitMinutes,
                            reason
                        },
                        explanation: `AI intuition: ${reason}`
                    });
                }
            } catch (err) {
                console.error(`[CRON] Error processing ${conv.conversation_id}:`, err);
                results.skipped++;
            }
        }

        console.log(`[CRON] Completed: ${results.scheduled} scheduled, ${results.skipped} skipped${results.timedOut ? ' (timed out)' : ''}`);

        return res.status(200).json({
            message: results.timedOut ? 'Partial completion due to timeout' : 'Silence detection complete',
            ...results
        });

    } catch (error) {
        console.error('[CRON] Fatal error:', error);
        return res.status(500).json({ error: error.message });
    }
}

export const config = {
    api: {
        bodyParser: true
    }
};
