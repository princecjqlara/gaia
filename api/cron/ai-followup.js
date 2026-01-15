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
            cleanedUp: 0,
            timedOut: false
        };

        // Quick cleanup of stale pending follow-ups (scheduled more than 2 hours ago)
        const staleThreshold = new Date(now.getTime() - (2 * 60 * 60 * 1000)).toISOString();
        const { data: staleFollowups } = await db
            .from('ai_followup_schedule')
            .select('id')
            .eq('status', 'pending')
            .lt('scheduled_at', staleThreshold)
            .limit(50);

        if (staleFollowups && staleFollowups.length > 0) {
            console.log(`[CRON] 🧹 Cleaning up ${staleFollowups.length} stale follow-ups`);
            await db
                .from('ai_followup_schedule')
                .update({ status: 'cancelled', error_message: 'Cancelled - stale pending followup' })
                .in('id', staleFollowups.map(f => f.id));
            results.cleanedUp = staleFollowups.length;
        }

        if (checkTimeout()) {
            results.timedOut = true;
            return res.status(200).json({ message: 'Partial completion - cleanup only', ...results });
        }

        // Get AI chatbot config
        const { data: settings } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        const config = settings?.value || {};
        const silenceHours = config.intuition_silence_hours || 4;
        const maxPerRun = 10; // Small batch size to prevent timeout

        // Calculate cutoff time (conversations inactive for X hours)
        const cutoffTime = new Date(now.getTime() - (silenceHours * 60 * 60 * 1000));

        // Find conversations that need follow-up
        const { data: conversations, error } = await db
            .from('facebook_conversations')
            .select(`
                conversation_id,
                page_id,
                participant_name,
                participant_id,
                last_message_time,
                last_message_from_page,
                active_goal_id
            `)
            .or('ai_enabled.is.null,ai_enabled.eq.true')
            .or('human_takeover.is.null,human_takeover.eq.false')
            .or('opt_out.is.null,opt_out.eq.false')
            .lt('last_message_time', cutoffTime.toISOString())
            .or(`cooldown_until.is.null,cooldown_until.lt.${now.toISOString()}`)
            .order('last_message_time', { ascending: true })
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

                // FAST heuristic-based timing (no slow AI API calls)
                let waitMinutes;
                let reason;

                if (minutesSince < 60) {
                    waitMinutes = 30;
                    reason = `Silent for ${minutesSince} mins - quick check-in`;
                } else if (minutesSince < 120) {
                    waitMinutes = 45;
                    reason = `Silent for ${hoursSince}h - gentle follow-up`;
                } else if (minutesSince < 240) {
                    waitMinutes = 60;
                    reason = `Silent for ${hoursSince}h - check back in`;
                } else if (minutesSince < 480) {
                    waitMinutes = 120;
                    reason = `Silent for ${hoursSince}h - giving space`;
                } else {
                    waitMinutes = 180;
                    reason = `Silent for ${hoursSince}h - longer follow-up`;
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

        console.log(`[CRON] Completed: ${results.scheduled} scheduled, ${results.skipped} skipped, ${results.cleanedUp} cleaned up${results.timedOut ? ' (timed out)' : ''}`);

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
