import { createClient } from '@supabase/supabase-js';

/**
 * AI Silence Detection Cron
 * Finds conversations with no activity for 24+ hours and schedules follow-ups
 * at the contact's best time to contact (not just a fixed interval)
 * Runs every 30 minutes via Vercel cron
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
 * Calculate best time to contact based on engagement history
 * Simplified version for cron (doesn't import from client-side module)
 */
async function calculateBestTimeForContact(db, conversationId) {
    try {
        // Get engagement history for this contact
        const { data: engagements } = await db
            .from('contact_engagement')
            .select('day_of_week, hour_of_day, response_latency_seconds, engagement_score')
            .eq('conversation_id', conversationId)
            .eq('message_direction', 'inbound')
            .order('message_timestamp', { ascending: false })
            .limit(20);

        const now = new Date();

        // If no engagement data, use default business hours
        if (!engagements || engagements.length === 0) {
            // Default: next occurrence of 10 AM
            return getNextOccurrenceOfHour(10);
        }

        // Calculate weighted scores for each day/hour
        const timeScores = {};
        for (const eng of engagements) {
            const key = `${eng.day_of_week}-${eng.hour_of_day}`;
            if (!timeScores[key]) {
                timeScores[key] = {
                    dayOfWeek: eng.day_of_week,
                    hourOfDay: eng.hour_of_day,
                    count: 0,
                    totalScore: 0
                };
            }
            timeScores[key].count++;
            timeScores[key].totalScore += eng.engagement_score || 1;
        }

        // Find best slot
        let bestSlot = null;
        let bestScore = 0;
        for (const slot of Object.values(timeScores)) {
            const score = slot.count * (slot.totalScore / slot.count);
            if (score > bestScore) {
                bestScore = score;
                bestSlot = slot;
            }
        }

        if (!bestSlot) {
            return getNextOccurrenceOfHour(10);
        }

        // Get next occurrence of best day/hour
        return getNextOccurrence(bestSlot.dayOfWeek, bestSlot.hourOfDay);

    } catch (error) {
        console.error('[CRON] Error calculating best time:', error);
        // Fallback to default
        return getNextOccurrenceOfHour(10);
    }
}

/**
 * Get next occurrence of a specific day and hour
 * Schedules at the actual best time - messaging code handles 24h window with tags
 */
function getNextOccurrence(targetDay, targetHour) {
    const now = new Date();
    const result = new Date(now);
    result.setHours(targetHour, 0, 0, 0);

    // Calculate days until target day
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;

    if (daysUntil < 0 || (daysUntil === 0 && now.getHours() >= targetHour)) {
        daysUntil += 7;
    }

    result.setDate(result.getDate() + daysUntil);

    // If it's today but in the past, add 7 days
    if (result <= now) {
        result.setDate(result.getDate() + 7);
    }

    // No cap - follow-ups can be scheduled at the true best time
    // The sendMessage function handles 24h window by using ACCOUNT_UPDATE tag

    return result;
}

/**
 * Get next occurrence of a specific hour (today or tomorrow)
 */
function getNextOccurrenceOfHour(targetHour) {
    const now = new Date();
    const result = new Date(now);
    result.setHours(targetHour, 0, 0, 0);

    if (result <= now) {
        result.setDate(result.getDate() + 1);
    }

    return result;
}

export default async function handler(req, res) {
    // Verify cron authorization (optional - only checked if CRON_SECRET is set)
    const authHeader = req.headers.authorization;
    const vercelCron = req.headers['x-vercel-cron']; // Vercel's built-in cron header
    const cronSecret = process.env.CRON_SECRET;

    // Skip auth if Vercel cron OR if no secret is configured
    if (cronSecret && !vercelCron && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[CRON] Silence detection started');

    try {
        const db = getSupabase();
        if (!db) {
            throw new Error('Database not configured');
        }

        const now = new Date();
        const results = {
            scanned: 0,
            scheduled: 0,
            skipped: 0
        };

        // Get AI chatbot config
        const { data: settings } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        const config = settings?.value || {};
        // AGGRESSIVE SETTINGS: Reduced silence hours, increased capacity
        const silenceHours = config.intuition_silence_hours || 4; // Was 24, now 4 hours default
        const maxPerRun = config.max_followups_per_cron || 100; // Was 20, now 100 per run

        // Calculate cutoff time (conversations inactive for X hours)
        const cutoffTime = new Date(now.getTime() - (silenceHours * 60 * 60 * 1000));

        // Find conversations that need follow-up
        // REMOVED: last_message_from_page requirement - follow up even if user ghosted
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
            .or('ai_enabled.is.null,ai_enabled.eq.true') // Default to enabled
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
            try {
                // Check if there's already a pending follow-up
                const { data: existing } = await db
                    .from('ai_followup_schedule')
                    .select('id')
                    .eq('conversation_id', conv.conversation_id)
                    .eq('status', 'pending')
                    .limit(1);

                if (existing && existing.length > 0) {
                    console.log(`[CRON] Skipping ${conv.conversation_id} - already has pending follow-up`);
                    results.skipped++;
                    continue;
                }

                // Calculate hours since last message
                const hoursSince = Math.floor((now - new Date(conv.last_message_time)) / (1000 * 60 * 60));

                // Calculate BEST TIME to contact this person (not just 2 hours from now)
                const bestTime = await calculateBestTimeForContact(db, conv.conversation_id);

                console.log(`[CRON] Best time for ${conv.participant_name || conv.conversation_id}: ${bestTime.toISOString()}`);

                // Create follow-up scheduled at their best time
                const { error: insertError } = await db
                    .from('ai_followup_schedule')
                    .insert({
                        conversation_id: conv.conversation_id,
                        page_id: conv.page_id,
                        scheduled_at: bestTime.toISOString(),
                        follow_up_type: 'best_time',
                        reason: `No response for ${hoursSince} hours - scheduled at best time`,
                        goal_id: conv.active_goal_id,
                        status: 'pending'
                    });

                if (insertError) {
                    console.error(`[CRON] Error scheduling for ${conv.conversation_id}:`, insertError);
                    results.skipped++;
                } else {
                    console.log(`[CRON] Scheduled silence follow-up for ${conv.participant_name || conv.conversation_id}`);
                    results.scheduled++;

                    // Log the action
                    await db.from('ai_action_log').insert({
                        conversation_id: conv.conversation_id,
                        page_id: conv.page_id,
                        action_type: 'silence_detected',
                        action_data: { hoursSince, scheduledAt: bestTime.toISOString() },
                        explanation: `Silence detected (${hoursSince}h). Follow-up scheduled.`
                    });
                }
            } catch (err) {
                console.error(`[CRON] Error processing ${conv.conversation_id}:`, err);
                results.skipped++;
            }
        }

        console.log(`[CRON] Completed: ${results.scheduled} scheduled, ${results.skipped} skipped`);

        return res.status(200).json({
            message: 'Silence detection complete',
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
