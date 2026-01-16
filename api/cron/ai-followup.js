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

        const silenceHours = config.intuition_silence_hours || 4;
        const maxPerRun = 50; // Increased batch size to process more users per run

        // Calculate cutoff time (conversations inactive for X hours)
        const cutoffTime = new Date(now.getTime() - (silenceHours * 60 * 60 * 1000));

        // Find conversations that need follow-up:
        // - AI is enabled (or null = default enabled)
        // - Human hasn't taken over
        // - Last message was from the page (meaning we're waiting for user reply)
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
                human_takeover
            `)
            .neq('ai_enabled', false) // Include null (default enabled) and true
            .neq('human_takeover', true) // Include null and false
            // Follow up any conversation that's been inactive for the silence period
            // We don't filter by last_message_from_page because we want to re-engage ALL inactive contacts
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
                    .select('id')
                    .eq('conversation_id', conv.conversation_id)
                    .eq('status', 'pending');

                if (existingFollowups && existingFollowups.length > 0) {
                    // Already has a pending follow-up
                    results.skipped++;
                    continue;
                }

                // Calculate minutes since last message for smart timing
                const minutesSince = Math.floor((now - new Date(conv.last_message_time)) / (1000 * 60));
                const hoursSince = Math.floor(minutesSince / 60);
                const daysSince = Math.floor(hoursSince / 24);

                // GRADUATED FOLLOW-UP STRATEGY:
                // - 0-2 hours: AGGRESSIVE - follow up every 30 minutes
                // - 2-6 hours: MODERATE - follow up every 2 hours  
                // - 6-24 hours: MILD - follow up every 4 hours
                // - 24-72 hours: LIGHT - follow up every 8 hours
                // - 72+ hours: MINIMAL - follow up once daily

                let waitMinutes;
                let reason;
                let aggressiveness;

                if (hoursSince < 2) {
                    // AGGRESSIVE: Fresh lead, they just responded - act fast!
                    waitMinutes = 30;
                    reason = `Hot lead! Last contact ${minutesSince} mins ago - quick follow-up`;
                    aggressiveness = 'aggressive';
                } else if (hoursSince < 6) {
                    // MODERATE: Still warm, but give them some space
                    waitMinutes = 120; // 2 hours
                    reason = `Warm lead, ${hoursSince}h silent - moderate follow-up`;
                    aggressiveness = 'moderate';
                } else if (hoursSince < 24) {
                    // MILD: They may be busy, check in periodically
                    waitMinutes = 240; // 4 hours
                    reason = `${hoursSince}h silent - gentle check-in`;
                    aggressiveness = 'mild';
                } else if (hoursSince < 72) {
                    // LIGHT: Been a day or more, less frequent
                    waitMinutes = 480; // 8 hours
                    reason = `${daysSince} day(s) silent - light touch`;
                    aggressiveness = 'light';
                } else {
                    // MINIMAL: Long time no reply, daily at most
                    waitMinutes = 1440; // 24 hours (daily)
                    reason = `${daysSince} days silent - daily check-in`;
                    aggressiveness = 'minimal';
                }

                // Calculate scheduled time
                const waitMs = waitMinutes * 60 * 1000;
                const scheduledAt = new Date(now.getTime() + waitMs);

                // Create follow-up
                const { error: insertError } = await db
                    .from('ai_followup_schedule')
                    .insert({
                        conversation_id: conv.conversation_id,
                        page_id: conv.page_id,
                        scheduled_at: scheduledAt.toISOString(),
                        follow_up_type: 'best_time',
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
