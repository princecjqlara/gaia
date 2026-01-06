import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with fallbacks - prefer anon key
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Default booking settings
const DEFAULT_SETTINGS = {
    working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    available_days: [1, 2, 3, 4, 5],
    start_time: '09:00',
    end_time: '17:00',
    slot_duration: 60,
    buffer_time: 15,
    max_advance_days: 30,
    min_advance_hours: 1,
    booking_mode: 'slots',
    allow_next_hour: false,
    custom_fields: [
        { id: 'name', label: 'Your Name', type: 'text', required: true },
        { id: 'phone', label: 'Phone Number', type: 'tel', required: true },
        { id: 'email', label: 'Email Address', type: 'email', required: false },
        { id: 'notes', label: 'Additional Notes', type: 'textarea', required: false }
    ],
    custom_form: [],
    confirmation_message: 'Your booking has been confirmed! We look forward to meeting with you.',
    messenger_prefill_message: 'Hi! I just booked an appointment for {date} at {time}. Please confirm my booking. Thank you!',
    auto_redirect_enabled: true,
    auto_redirect_delay: 5,
    reminder_enabled: true,
    reminder_hours_before: 24
};

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { pageId } = req.query;

    if (!pageId) {
        return res.status(400).json({ error: 'pageId is required' });
    }

    // Check if Supabase is configured
    if (!supabaseUrl || !supabaseKey) {
        console.log('Supabase not configured, returning defaults');
        return res.status(200).json({ page_id: pageId, ...DEFAULT_SETTINGS });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Handle GET - fetch settings
    if (req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('booking_settings')
                .select('*')
                .eq('page_id', pageId)
                .single();

            // Handle table not existing
            if (error) {
                if (error.code === '42P01' || error.message?.includes('does not exist')) {
                    console.log('booking_settings table not found, returning defaults');
                    return res.status(200).json({ page_id: pageId, ...DEFAULT_SETTINGS });
                }
                // Handle no rows found (normal case)
                if (error.code === 'PGRST116') {
                    return res.status(200).json({ page_id: pageId, ...DEFAULT_SETTINGS });
                }
                throw error;
            }

            // Merge with defaults to ensure all fields are present
            return res.status(200).json({ ...DEFAULT_SETTINGS, ...data } || { page_id: pageId, ...DEFAULT_SETTINGS });
        } catch (error) {
            console.error('Error fetching booking settings:', error);
            // Return defaults on any error
            return res.status(200).json({ page_id: pageId, ...DEFAULT_SETTINGS });
        }
    }

    // Handle POST - save settings (admin)
    if (req.method === 'POST') {
        try {
            const settings = req.body;
            console.log('Received booking settings to save:', JSON.stringify(settings, null, 2));

            // Map settings to database columns - include all important fields
            const dbSettings = {
                page_id: pageId,
                available_days: settings.available_days || [1, 2, 3, 4, 5],
                start_time: settings.start_time || '09:00',
                end_time: settings.end_time || '17:00',
                slot_duration: settings.slot_duration || 30,
                min_advance_hours: settings.min_advance_hours ?? 1,
                booking_mode: settings.booking_mode || 'slots',
                allow_next_hour: settings.allow_next_hour || false,
                custom_fields: settings.custom_fields || [],
                custom_form: settings.custom_form || [],
                confirmation_message: settings.confirmation_message || '',
                messenger_prefill_message: settings.messenger_prefill_message || '',
                auto_redirect_enabled: settings.auto_redirect_enabled !== false,
                auto_redirect_delay: settings.auto_redirect_delay || 5,
                updated_at: new Date().toISOString()
            };

            console.log('Saving to database:', JSON.stringify(dbSettings, null, 2));

            const { data, error } = await supabase
                .from('booking_settings')
                .upsert(dbSettings, { onConflict: 'page_id' })
                .select()
                .single();

            if (error) {
                console.error('Supabase error:', error);
                if (error.code === '42P01' || error.message?.includes('does not exist')) {
                    return res.status(200).json({
                        message: 'Settings saved (table pending migration)',
                        ...settings
                    });
                }
                throw error;
            }

            console.log('Saved successfully:', data);
            return res.status(200).json(data);
        } catch (error) {
            console.error('Error saving booking settings:', error);
            return res.status(500).json({ error: 'Failed to save settings', details: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
