import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const db = createClient(supabaseUrl, supabaseKey);

const out = [];
function log(msg) { out.push(msg); }

async function diagnose() {
    log('=== FOLLOW-UP DIAGNOSTICS ===');

    // 1. Settings
    const { data: settings, error: settingsErr } = await db.from('settings').select('value').eq('key', 'ai_chatbot_config').single();
    if (settingsErr) { log('Settings ERROR: ' + settingsErr.message); }
    else {
        const c = settings?.value || {};
        log('global_bot_enabled: ' + c.global_bot_enabled);
        log('enable_silence_followups: ' + c.enable_silence_followups);
        log('enable_intuition_followups: ' + c.enable_intuition_followups);
        log('intuition_silence_hours: ' + c.intuition_silence_hours);
    }

    // 2. Pending
    const { data: pending, error: pendErr } = await db.from('ai_followup_schedule').select('id, conversation_id, scheduled_at, follow_up_type, reason, status, created_at').eq('status', 'pending').order('scheduled_at', { ascending: true }).limit(10);
    if (pendErr) { log('Pending ERROR: ' + pendErr.message); }
    else {
        log('Pending count: ' + (pending?.length || 0));
        for (const f of (pending || [])) {
            const mins = Math.round((new Date(f.scheduled_at) - new Date()) / 60000);
            log('  type=' + f.follow_up_type + ' conv=' + f.conversation_id + ' sched=' + f.scheduled_at + ' due_in=' + mins + 'min reason=' + (f.reason || '').substring(0, 60));
        }
    }

    // 3. Sent last 24h
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const { data: sent } = await db.from('ai_followup_schedule').select('id, conversation_id, follow_up_type, sent_at').eq('status', 'sent').gte('sent_at', dayAgo).order('sent_at', { ascending: false }).limit(10);
    log('Sent last 24h: ' + (sent?.length || 0));
    for (const f of (sent || [])) { log('  type=' + f.follow_up_type + ' conv=' + f.conversation_id + ' sent=' + f.sent_at); }

    // 4. Cancelled/failed last 24h
    const { data: cancelled } = await db.from('ai_followup_schedule').select('id, conversation_id, follow_up_type, status, error_message, updated_at').in('status', ['cancelled', 'failed']).gte('updated_at', dayAgo).order('updated_at', { ascending: false }).limit(15);
    log('Cancelled/failed last 24h: ' + (cancelled?.length || 0));
    for (const f of (cancelled || [])) { log('  status=' + f.status + ' type=' + f.follow_up_type + ' err=' + (f.error_message || '').substring(0, 80)); }

    // 5. Eligible convs
    const silenceH = settings?.value?.intuition_silence_hours || 0.5;
    const cutoff = new Date(Date.now() - silenceH * 3600000).toISOString();
    const { data: eligible, error: eligErr } = await db.from('facebook_conversations')
        .select('conversation_id, participant_name, last_message_time, ai_enabled, human_takeover, lead_status, pipeline_stage, intuition_followup_disabled, best_time_scheduling_disabled, meeting_scheduled')
        .neq('ai_enabled', false).neq('human_takeover', true).neq('intuition_followup_disabled', true).neq('best_time_scheduling_disabled', true).neq('meeting_scheduled', true)
        .not('lead_status', 'in', '(appointment_booked,converted)').neq('pipeline_stage', 'booked')
        .lt('last_message_time', cutoff).order('last_message_time', { ascending: true }).limit(10);
    if (eligErr) { log('Eligible ERROR: ' + eligErr.message); }
    else {
        log('Eligible convs (silence > ' + silenceH + 'h): ' + (eligible?.length || 0));
        for (const c of (eligible || [])) {
            const hrs = Math.round((Date.now() - new Date(c.last_message_time).getTime()) / 3600000);
            log('  ' + (c.participant_name || 'unknown') + ' | hrs_since=' + hrs + ' | ai=' + c.ai_enabled + ' | human=' + c.human_takeover + ' | lead=' + c.lead_status + ' | intuition_disabled=' + c.intuition_followup_disabled + ' | besttime_disabled=' + c.best_time_scheduling_disabled + ' | meeting=' + c.meeting_scheduled);
        }
    }

    // 6. Action logs
    const { data: logs, error: logErr } = await db.from('ai_action_log').select('id, action_type, explanation, created_at').order('created_at', { ascending: false }).limit(5);
    if (logErr) { log('Logs ERROR: ' + logErr.message); }
    else {
        log('Recent action logs: ' + (logs?.length || 0));
        for (const l of (logs || [])) { log('  [' + l.action_type + '] ' + (l.explanation || '').substring(0, 80) + ' | ' + l.created_at); }
    }

    log('=== DONE ===');
    writeFileSync('scripts/diag_result.json', JSON.stringify(out, null, 2), 'utf8');
}

diagnose().catch(err => { log('FATAL: ' + err.message); writeFileSync('scripts/diag_result.json', JSON.stringify(out, null, 2), 'utf8'); });
