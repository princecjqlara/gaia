import { createClient } from '@supabase/supabase-js';

/**
 * Debug endpoint to check and fix AI follow-up schedule
 * Call via: GET /api/cron/fix-followups
 */
export default async function handler(req, res) {
    // Disable caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Supabase not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date().toISOString();

    try {
        // First, check what's in the table
        const { data: allRecords, error: fetchError } = await supabase
            .from('ai_followup_schedule')
            .select('id, conversation_id, scheduled_at, status, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        if (fetchError) {
            return res.status(500).json({ error: fetchError.message });
        }

        // Count by status
        const statusCounts = {
            pending: 0,
            cancelled: 0,
            sent: 0,
            failed: 0,
            other: 0
        };

        for (const record of allRecords || []) {
            if (statusCounts[record.status] !== undefined) {
                statusCounts[record.status]++;
            } else {
                statusCounts.other++;
            }
        }

        // Update all pending follow-ups to be due 5 minutes in the PAST so they're definitely due
        const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: updatedRecords, error: updateError } = await supabase
            .from('ai_followup_schedule')
            .update({ scheduled_at: pastTime })
            .eq('status', 'pending')
            .select('id, scheduled_at');

        const updatedCount = updatedRecords?.length || 0;

        // Now query exactly like process.js does to see if we find any due
        const { data: dueFollowups, error: dueError } = await supabase
            .from('ai_followup_schedule')
            .select('id, scheduled_at, status')
            .eq('status', 'pending')
            .lte('scheduled_at', now)
            .order('scheduled_at', { ascending: true })
            .limit(50);

        return res.status(200).json({
            message: 'Debug info and fix applied',
            currentTime: now,
            pastTimeSet: pastTime,
            statusCounts,
            recentRecords: allRecords?.slice(0, 5).map(r => ({
                id: r.id,
                status: r.status,
                scheduled_at: r.scheduled_at,
                created_at: r.created_at
            })),
            fixApplied: `Updated ${updatedCount} pending follow-ups to be due at ${pastTime}`,
            updateError: updateError?.message || null,
            updatedRecordsSample: updatedRecords?.slice(0, 3),
            dueFollowupsFound: dueFollowups?.length || 0,
            dueError: dueError?.message || null,
            dueFollowupsSample: dueFollowups?.slice(0, 3)
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
