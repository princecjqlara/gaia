import { createClient } from '@supabase/supabase-js';

/**
 * Debug endpoint to check AI follow-up schedule status
 * Shows failed records with their error messages
 */
export default async function handler(req, res) {
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
        // Check failed records to see error messages
        const { data: failedRecords } = await supabase
            .from('ai_followup_schedule')
            .select('id, conversation_id, page_id, status, error_message, created_at')
            .eq('status', 'failed')
            .order('created_at', { ascending: false })
            .limit(10);

        // Check pending records
        const { data: pendingRecords } = await supabase
            .from('ai_followup_schedule')
            .select('id, conversation_id, page_id, scheduled_at, status, created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(10);

        // Count by status
        const { data: allRecords } = await supabase
            .from('ai_followup_schedule')
            .select('status');

        const statusCounts = {};
        for (const r of allRecords || []) {
            statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        }

        // If there are pending records, update them to be due NOW for testing
        const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: updated } = await supabase
            .from('ai_followup_schedule')
            .update({ scheduled_at: pastTime })
            .eq('status', 'pending')
            .select('id');

        // Query what would be due
        const { data: dueNow } = await supabase
            .from('ai_followup_schedule')
            .select('id, conversation_id, page_id, scheduled_at')
            .eq('status', 'pending')
            .lte('scheduled_at', now)
            .limit(10);

        return res.status(200).json({
            currentTime: now,
            statusCounts,
            pendingCount: pendingRecords?.length || 0,
            pendingRecords: pendingRecords?.slice(0, 3),
            failedCount: failedRecords?.length || 0,
            failedWithErrors: failedRecords?.map(r => ({
                id: r.id,
                conversation_id: r.conversation_id,
                page_id: r.page_id,
                error: r.error_message
            })),
            updatedToBeeDue: updated?.length || 0,
            dueNowCount: dueNow?.length || 0
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
