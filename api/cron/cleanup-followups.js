import { createClient } from '@supabase/supabase-js';

/**
 * Cleanup endpoint - removes old cancelled/failed follow-up records
 * Call via: GET /api/cron/cleanup-followups
 */
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Supabase not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Delete all cancelled records
        const { data: deletedCancelled, error: cancelError } = await supabase
            .from('ai_followup_schedule')
            .delete()
            .eq('status', 'cancelled')
            .select('id');

        // Delete failed records older than 1 hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: deletedFailed, error: failError } = await supabase
            .from('ai_followup_schedule')
            .delete()
            .eq('status', 'failed')
            .lt('created_at', oneHourAgo)
            .select('id');

        // Get remaining counts
        const { data: remaining } = await supabase
            .from('ai_followup_schedule')
            .select('status');

        const statusCounts = {};
        for (const r of remaining || []) {
            statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        }

        return res.status(200).json({
            message: 'Cleanup complete',
            deletedCancelled: deletedCancelled?.length || 0,
            deletedFailed: deletedFailed?.length || 0,
            remainingCounts: statusCounts,
            errors: {
                cancel: cancelError?.message || null,
                fail: failError?.message || null
            }
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
