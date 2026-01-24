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

/**
 * Calculate best time to contact based on engagement data
 * Returns optimal day/hour when customer typically responds
 */
async function calculateBestTimeToContact(db, conversationId, pageId) {
    try {
        // Get engagement history for this contact
        const { data: engagements } = await db
            .from('contact_engagement')
            .select('day_of_week, hour_of_day, response_latency_seconds')
            .eq('conversation_id', conversationId)
            .eq('message_direction', 'inbound')
            .order('message_timestamp', { ascending: false })
            .limit(30);

        let bestSlots = [];

        if (engagements && engagements.length >= 3) {
            // Calculate scores for each day/hour
            const timeScores = {};
            for (const eng of engagements) {
                const key = `${eng.day_of_week}-${eng.hour_of_day}`;
                if (!timeScores[key]) {
                    timeScores[key] = { day: eng.day_of_week, hour: eng.hour_of_day, count: 0, latency: 0 };
                }
                timeScores[key].count++;
                timeScores[key].latency += eng.response_latency_seconds || 0;
            }

            // Rank by frequency and low latency
            bestSlots = Object.values(timeScores)
                .map(s => ({
                    ...s,
                    score: s.count * (1 - Math.min(s.latency / s.count / 7200, 0.8))
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);
        }

        // If not enough data, use defaults (business hours)
        if (bestSlots.length === 0) {
            const now = new Date();
            const hash = conversationId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
            bestSlots = [
                { day: 1 + (hash % 5), hour: 9 + ((hash >> 4) % 7) },
                { day: 1 + ((hash + 2) % 5), hour: 10 + ((hash >> 2) % 6) }
            ];
        }

        // Find next occurrence of best time
        const now = new Date();
        const best = bestSlots[0];
        let nextTime = new Date(now);
        nextTime.setHours(best.hour, 0, 0, 0);

        let daysUntil = best.day - now.getDay();
        if (daysUntil < 0 || (daysUntil === 0 && now.getHours() >= best.hour)) {
            daysUntil += 7;
        }
        nextTime.setDate(nextTime.getDate() + daysUntil);

        return {
            bestSlots,
            nextBestTime: nextTime,
            hasData: engagements && engagements.length >= 3
        };
    } catch (err) {
        console.log('[CRON] Best time calc error:', err.message);
        // Return default
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        tomorrow.setHours(10, 0, 0, 0);
        return { bestSlots: [], nextBestTime: tomorrow, hasData: false };
    }
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
                meeting_scheduled
            `)
            .neq('ai_enabled', false) // Include null (default enabled) and true
            .neq('human_takeover', true) // Include null and false
            .neq('intuition_followup_disabled', true) // Skip if intuition follow-ups disabled
            .neq('meeting_scheduled', true) // Skip if meeting already scheduled/mentioned
            // SKIP booked/converted customers - they don't need follow-ups
            .not('lead_status', 'in', '(appointment_booked,converted)')
            .neq('pipeline_stage', 'booked') // Also skip if pipeline_stage is 'booked'
            // Follow up any conversation that's been inactive for the silence period
            .lt('last_message_time', cutoffTime.toISOString())
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

                    // Ensure at least 1 hour wait and schedule for best time
                    waitMinutes = Math.max(60, Math.floor(msTilBest / (1000 * 60)));

                    // If best time is very far away (more than 24h), cap at 24h
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
