/**
 * Test script: Check current DB config and write booking URL
 * Usage: node scripts/test_booking_url_sync.js
 * 
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_ variants)
 * in environment or hardcoded below
 */

// Try to load from .env if available
try { await import('dotenv/config'); } catch (e) { }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing Supabase credentials.');
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
    console.error('Or try: set SUPABASE_URL=https://xxx.supabase.co');
    console.error('        set SUPABASE_SERVICE_ROLE_KEY=eyJ...');
    process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    console.log('🔍 Connected to:', SUPABASE_URL);
    console.log('');

    // 1. READ current config from DB
    console.log('=== STEP 1: Reading current ai_chatbot_config from DB ===');
    const { data: currentSettings, error: readErr } = await db
        .from('settings')
        .select('value, updated_at')
        .eq('key', 'ai_chatbot_config')
        .single();

    if (readErr) {
        console.error('❌ Error reading settings:', readErr.message);
        if (readErr.code === 'PGRST116') {
            console.log('ℹ️  No ai_chatbot_config row exists yet. Will create one.');
        }
    } else {
        console.log('✅ Current config keys:', Object.keys(currentSettings.value || {}));
        console.log('   booking_url:', currentSettings.value?.booking_url || 'NOT SET');
        console.log('   welcome_button_url:', currentSettings.value?.welcome_button_url || 'NOT SET');
        console.log('   booking_link:', currentSettings.value?.booking_link || 'NOT SET');
        console.log('   booking_mode:', currentSettings.value?.booking_mode || 'NOT SET');
        console.log('   bot_rules_dos:', currentSettings.value?.bot_rules_dos ? 'SET (' + currentSettings.value.bot_rules_dos.length + ' chars)' : 'NOT SET');
        console.log('   bot_rules_donts:', currentSettings.value?.bot_rules_donts ? 'SET (' + currentSettings.value.bot_rules_donts.length + ' chars)' : 'NOT SET');
        console.log('   updated_at:', currentSettings.updated_at);
    }

    console.log('');

    // 2. WRITE booking URL to config
    const BOOKING_URL = 'https://instantmeeting.vercel.app/join/aresmediaofficial';
    console.log('=== STEP 2: Writing booking_url to DB ===');
    console.log('   URL:', BOOKING_URL);

    const existingConfig = currentSettings?.value || {};
    const updatedConfig = {
        ...existingConfig,
        booking_url: BOOKING_URL,
        welcome_button_url: BOOKING_URL, // Also set the new welcome button URL field
    };

    const { error: writeErr } = await db
        .from('settings')
        .upsert({
            key: 'ai_chatbot_config',
            value: updatedConfig,
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

    if (writeErr) {
        console.error('❌ Error writing settings:', writeErr.message);
    } else {
        console.log('✅ booking_url written to database!');
    }

    console.log('');

    // 3. VERIFY by reading again
    console.log('=== STEP 3: Verifying... ===');
    const { data: verifyData, error: verifyErr } = await db
        .from('settings')
        .select('value')
        .eq('key', 'ai_chatbot_config')
        .single();

    if (verifyErr) {
        console.error('❌ Verify error:', verifyErr.message);
    } else {
        console.log('✅ Verified booking_url:', verifyData.value?.booking_url);
        console.log('✅ Verified welcome_button_url:', verifyData.value?.welcome_button_url);
        console.log('✅ All config keys:', Object.keys(verifyData.value || {}));
    }

    // 4. Also check booking_settings table
    console.log('');
    console.log('=== STEP 4: Checking booking_settings table ===');
    const { data: bsData, error: bsErr } = await db
        .from('booking_settings')
        .select('*')
        .limit(5);

    if (bsErr) {
        console.log('⚠️  booking_settings table:', bsErr.message);
    } else {
        console.log('   Rows:', bsData?.length || 0);
        if (bsData?.length > 0) {
            bsData.forEach(row => {
                console.log('   -', row.page_id, ':', row.booking_url || row.booking_link || 'no url');
            });
        }
    }

    console.log('');
    console.log('🎉 Done! The webhook should now use the correct booking URL.');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
