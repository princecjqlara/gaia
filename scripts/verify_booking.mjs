import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const db = createClient(url, key);

const { data } = await db.from('settings').select('value').eq('key', 'ai_chatbot_config').single();
const v = data?.value || {};
console.log('booking_url=' + (v.booking_url || 'EMPTY'));
console.log('welcome_button_url=' + (v.welcome_button_url || 'EMPTY'));
console.log('keys=' + Object.keys(v).join(','));
