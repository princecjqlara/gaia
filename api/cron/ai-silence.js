import { createClient } from '@supabase/supabase-js';

/**
 * AI Silence Detection Cron
 * Finds conversations with no activity for 24+ hours and schedules follow-ups
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

export default async function handler(req, res) {
    // Verify cron authorization
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
        const silenceHours = config.intuition_silence_hours || 24;
        const maxPerRun = config.max_followups_per_cron || 20;

        // Calculate cutoff time (conversations inactive for X hours)
        const cutoffTime = new Date(now.getTime() - (silenceHours * 60 * 60 * 1000));

        // Find conversations that need follow-up:
        // 1. AI is enabled
        // 2. Not in human takeover
        // 3. Not opted out
        // 4. Last message was from page (we're waiting for their response)
        // 5. Last message time is older than cutoff
        // 6. Not in cooldown
        // 7. No pending follow-up already scheduled
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
            .eq('ai_enabled', true)
            .eq('human_takeover', false)
            .eq('opt_out', false)
            .eq('last_message_from_page', true)
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

                // Schedule follow-up for 2 hours from now (give some buffer)
                const scheduledAt = new Date(now.getTime() + (2 * 60 * 60 * 1000));

                // Create follow-up
                const { error: insertError } = await db
                    .from('ai_followup_schedule')
                    .insert({
                        conversation_id: conv.conversation_id,
                        page_id: conv.page_id,
                        scheduled_at: scheduledAt.toISOString(),
                        follow_up_type: 'silence',
                        reason: `No response for ${hoursSince} hours`,
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
                        action_data: { hoursSince, scheduledAt: scheduledAt.toISOString() },
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
