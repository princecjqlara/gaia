import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or key in .env');
    process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log('=== FOLLOW-UP DIAGNOSTICS ===\n');

    // 1. Check AI chatbot config
    console.log('--- 1. AI Chatbot Settings ---');
    const { data: settings, error: settingsErr } = await db
        .from('settings')
        .select('value')
        .eq('key', 'ai_chatbot_config')
        .single();

    if (settingsErr) {
        console.log('ERROR reading settings:', settingsErr.message);
    } else {
        const c = settings?.value || {};
        console.log('global_bot_enabled:', c.global_bot_enabled);
        console.log('enable_silence_followups:', c.enable_silence_followups);
        console.log('enable_intuition_followups:', c.enable_intuition_followups);
        console.log('intuition_silence_hours:', c.intuition_silence_hours);
        console.log('auto_respond_to_new_messages:', c.auto_respond_to_new_messages);
    }

    // 2. Pending follow-ups
    console.log('\n--- 2. Pending Follow-ups ---');
    const { data: pending, error: pendErr } = await db
        .from('ai_followup_schedule')
        .select('id, conversation_id, scheduled_at, follow_up_type, reason, status, created_at')
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(10);

    if (pendErr) {
        console.log('ERROR:', pendErr.message);
    } else {
        console.log(`Found ${pending?.length || 0} pending follow-ups`);
        for (const f of (pending || [])) {
            const minutesUntil = Math.round((new Date(f.scheduled_at) - new Date()) / (1000 * 60));
            console.log(`  [${f.follow_up_type}] conv=${f.conversation_id?.substring(0, 20)}... scheduled_at=${f.scheduled_at} (${minutesUntil > 0 ? `in ${minutesUntil} min` : `${-minutesUntil} min OVERDUE`}) reason="${f.reason?.substring(0, 60)}"`);
        }
    }

    // 3. Recently sent follow-ups
    console.log('\n--- 3. Recently Sent Follow-ups (last 24h) ---');
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: sent, error: sentErr } = await db
        .from('ai_followup_schedule')
        .select('id, conversation_id, follow_up_type, sent_at, reason')
        .eq('status', 'sent')
        .gte('sent_at', oneDayAgo)
        .order('sent_at', { ascending: false })
        .limit(10);

    if (sentErr) {
        console.log('ERROR:', sentErr.message);
    } else {
        console.log(`Found ${sent?.length || 0} sent in last 24h`);
        for (const f of (sent || [])) {
            console.log(`  [${f.follow_up_type}] conv=${f.conversation_id?.substring(0, 20)}... sent_at=${f.sent_at}`);
        }
    }

    // 4. Recently cancelled/failed follow-ups
    console.log('\n--- 4. Recently Cancelled/Failed Follow-ups (last 24h) ---');
    const { data: cancelled, error: cancErr } = await db
        .from('ai_followup_schedule')
        .select('id, conversation_id, follow_up_type, status, error_message, updated_at')
        .in('status', ['cancelled', 'failed'])
        .gte('updated_at', oneDayAgo)
        .order('updated_at', { ascending: false })
        .limit(15);

    if (cancErr) {
        console.log('ERROR:', cancErr.message);
    } else {
        console.log(`Found ${cancelled?.length || 0} cancelled/failed in last 24h`);
        for (const f of (cancelled || [])) {
            console.log(`  [${f.status}] [${f.follow_up_type}] conv=${f.conversation_id?.substring(0, 20)}... error="${f.error_message?.substring(0, 80)}"`);
        }
    }

    // 5. Conversations that should be eligible for follow-up
    console.log('\n--- 5. Conversations Eligible for Follow-up ---');
    const silenceHours = settings?.value?.intuition_silence_hours || 0.5;
    const cutoff = new Date(Date.now() - silenceHours * 60 * 60 * 1000).toISOString();
    const { data: eligible, error: eligErr } = await db
        .from('facebook_conversations')
        .select('conversation_id, participant_name, last_message_time, ai_enabled, human_takeover, lead_status, pipeline_stage, intuition_followup_disabled, best_time_scheduling_disabled, meeting_scheduled')
        .neq('ai_enabled', false)
        .neq('human_takeover', true)
        .neq('intuition_followup_disabled', true)
        .neq('best_time_scheduling_disabled', true)
        .neq('meeting_scheduled', true)
        .not('lead_status', 'in', '(appointment_booked,converted)')
        .neq('pipeline_stage', 'booked')
        .lt('last_message_time', cutoff)
        .order('last_message_time', { ascending: true })
        .limit(10);

    if (eligErr) {
        console.log('ERROR:', eligErr.message);
    } else {
        console.log(`Found ${eligible?.length || 0} eligible conversations (silence > ${silenceHours}h)`);
        for (const c of (eligible || [])) {
            const hoursSince = Math.round((Date.now() - new Date(c.last_message_time).getTime()) / (1000 * 60 * 60));
            console.log(`  ${c.participant_name || 'unknown'} | conv=${c.conversation_id?.substring(0, 20)}... | last_msg=${hoursSince}h ago | ai=${c.ai_enabled} | human=${c.human_takeover} | lead=${c.lead_status} | intuition_disabled=${c.intuition_followup_disabled} | besttime_disabled=${c.best_time_scheduling_disabled} | meeting=${c.meeting_scheduled}`);
        }
    }

    // 6. Check if cron is being called (look at recent action logs)
    console.log('\n--- 6. Recent AI Action Logs ---');
    const { data: logs, error: logErr } = await db
        .from('ai_action_log')
        .select('id, action_type, explanation, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (logErr) {
        console.log('ERROR (table may not exist):', logErr.message);
    } else {
        console.log(`Found ${logs?.length || 0} recent logs`);
        for (const l of (logs || [])) {
            console.log(`  [${l.action_type}] ${l.explanation?.substring(0, 80)} | ${l.created_at}`);
        }
    }

    console.log('\n=== DIAGNOSTICS COMPLETE ===');
}

diagnose().catch(err => console.error('Fatal:', err));
