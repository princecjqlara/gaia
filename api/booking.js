import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

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

// --- HELPER FUNCTIONS ---

async function ensureBookingsTableExists(supabase) {
    const { error: checkError } = await supabase.from('bookings').select('id').limit(1);
    if (checkError && (checkError.code === '42P01' || checkError.message?.includes('does not exist'))) {
        console.log('Bookings table not found, attempting to create...');
        try {
            const { error: createError } = await supabase.rpc('exec_sql', {
                sql: `
                    CREATE TABLE IF NOT EXISTS bookings (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        page_id TEXT,
                        contact_psid TEXT,
                        contact_name TEXT,
                        contact_email TEXT,
                        contact_phone TEXT,
                        booking_date DATE NOT NULL,
                        booking_time TIME NOT NULL,
                        booking_datetime TIMESTAMPTZ NOT NULL,
                        form_data JSONB DEFAULT '{}',
                        status TEXT DEFAULT 'pending',
                        notes TEXT,
                        confirmation_sent BOOLEAN DEFAULT false,
                        reminder_sent BOOLEAN DEFAULT false,
                        follow_up_sent BOOLEAN DEFAULT false,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW(),
                        confirmed_at TIMESTAMPTZ,
                        cancelled_at TIMESTAMPTZ
                    );
                    ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
                    CREATE POLICY IF NOT EXISTS "Bookings insertable by all" ON bookings FOR INSERT WITH CHECK (true);
                    CREATE POLICY IF NOT EXISTS "Bookings viewable by authenticated" ON bookings FOR SELECT USING (true);
                `
            });
            if (createError) return false;
            return true;
        } catch (e) {
            return false;
        }
    }
    return true;
}

function generateSlots(config, date, bookedTimes) {
    const slots = [];
    const startTime = config.start_time || '09:00';
    const endTime = config.end_time || '17:00';
    const duration = config.slot_duration || 60;

    const startParts = startTime.split(':');
    const endParts = endTime.split(':');

    let currentHour = parseInt(startParts[0]);
    let currentMinute = parseInt(startParts[1] || 0);
    const endHour = parseInt(endParts[0]);
    const endMinute = parseInt(endParts[1] || 0);

    const nowUTC = new Date();
    const phOffsetMs = 8 * 60 * 60 * 1000;
    const nowPH = new Date(nowUTC.getTime() + phOffsetMs);
    const dateStrPH = `${nowPH.getFullYear()}-${String(nowPH.getMonth() + 1).padStart(2, '0')}-${String(nowPH.getDate()).padStart(2, '0')}`;
    const isToday = date === dateStrPH;

    const sameDayBuffer = config.same_day_buffer || 0;
    const currentPHHour = nowPH.getHours();
    const currentPHMinute = nowPH.getMinutes();
    const minBookingHour = currentPHMinute > 0 ? currentPHHour + 1 + sameDayBuffer : currentPHHour + sameDayBuffer;

    while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
        const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
        const timeWithSeconds = timeStr + ':00';

        if (bookedTimes.includes(timeWithSeconds) || bookedTimes.includes(timeStr)) {
            currentMinute += duration;
            while (currentMinute >= 60) { currentMinute -= 60; currentHour += 1; }
            continue;
        }

        if (isToday && currentHour < minBookingHour) {
            currentMinute += duration;
            while (currentMinute >= 60) { currentMinute -= 60; currentHour += 1; }
            continue;
        }

        slots.push(timeStr);
        currentMinute += duration;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour += 1; }
    }
    return slots;
}

// --- HANDLERS ---

async function handleGetSettings(req, res, supabase) {
    const { pageId } = req.query;
    if (!pageId) return res.status(400).json({ error: 'pageId is required' });
    if (!supabase) return res.status(200).json({ page_id: pageId, ...DEFAULT_SETTINGS });

    try {
        const { data, error } = await supabase
            .from('booking_settings')
            .select('*')
            .eq('page_id', pageId)
            .single();

        if (error) {
            // Return defaults if table or row doesn't exist
            return res.status(200).json({ page_id: pageId, ...DEFAULT_SETTINGS });
        }
        return res.status(200).json({ ...DEFAULT_SETTINGS, ...data });
    } catch (error) {
        console.error('Error fetching settings:', error);
        return res.status(200).json({ page_id: pageId, ...DEFAULT_SETTINGS });
    }
}

async function handlePostSettings(req, res, supabase) {
    const { pageId } = req.query;
    if (!pageId) return res.status(400).json({ error: 'pageId is required' });
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });

    try {
        const settings = req.body;

        // Basic settings that should always verify
        const minimalSettings = {
            page_id: pageId,
            start_time: settings.start_time || '09:00',
            end_time: settings.end_time || '17:00',
            slot_duration: settings.slot_duration || 30,
            custom_fields: settings.custom_fields || [],
            custom_form: settings.custom_form || [],
            updated_at: new Date().toISOString()
        };

        // All possible settings
        const extendedSettings = { ...minimalSettings };
        const optionalFields = [
            'available_days', 'same_day_buffer', 'min_advance_hours', 'booking_mode',
            'allow_next_hour', 'confirmation_message', 'messenger_prefill_message',
            'auto_redirect_enabled', 'auto_redirect_delay'
        ];

        optionalFields.forEach(field => {
            if (settings[field] !== undefined) extendedSettings[field] = settings[field];
        });

        // Try to save extended settings
        let { data, error } = await supabase
            .from('booking_settings')
            .upsert(extendedSettings, { onConflict: 'page_id' })
            .select()
            .single();

        // If that fails (column missing), try minimal settings
        if (error && (error.code === 'PGRST204' || error.message?.includes('column'))) {
            const { data: minData, error: minError } = await supabase
                .from('booking_settings')
                .upsert(minimalSettings, { onConflict: 'page_id' })
                .select()
                .single();

            if (!minError) {
                return res.status(200).json({ ...settings, ...minData, _warning: 'Some settings could not be saved due to schema mismatch' });
            }
            error = minError;
        }

        if (error) throw error;
        return res.status(200).json({ ...DEFAULT_SETTINGS, ...data });
    } catch (error) {
        console.error('Error saving settings:', error);
        return res.status(500).json({ error: 'Failed to save settings', details: error.message });
    }
}

async function handleGetAvailable(req, res, supabase) {
    const { pageId, date, start_time, end_time, slot_duration, min_advance_hours } = req.query;
    if (!pageId || !date) return res.status(400).json({ error: 'pageId and date are required' });

    // Config logic
    const baseConfig = {
        ...DEFAULT_SETTINGS,
        start_time: start_time || DEFAULT_SETTINGS.start_time,
        end_time: end_time || DEFAULT_SETTINGS.end_time,
        slot_duration: parseInt(slot_duration) || DEFAULT_SETTINGS.slot_duration,
        min_advance_hours: parseInt(min_advance_hours) || 1
    };

    if (!supabase) {
        return res.status(200).json({ slots: generateSlots(baseConfig, date, []) });
    }

    try {
        let config = { ...baseConfig };

        // Try fetch settings from DB
        try {
            const { data: settings } = await supabase.from('booking_settings').select('*').eq('page_id', pageId).single();
            if (settings) {
                if (!start_time) config.start_time = settings.start_time || config.start_time;
                if (!end_time) config.end_time = settings.end_time || config.end_time;
                // ... map other fields ...
                config.available_days = settings.available_days;
                config.working_days = settings.working_days;
                config.same_day_buffer = settings.same_day_buffer || 0;
            }
        } catch (e) { }

        // Check working day
        const dateObj = new Date(date);
        const dayOfWeek = dateObj.getDay();
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        let isWorkingDay = true;
        if (config.available_days && Array.isArray(config.available_days)) {
            isWorkingDay = config.available_days.includes(dayOfWeek);
        } else if (config.working_days && Array.isArray(config.working_days)) {
            isWorkingDay = config.working_days.includes(dayNames[dayOfWeek]);
        }

        if (!isWorkingDay) return res.status(200).json({ slots: [], message: 'Not a working day' });

        // Get booked times
        let bookedTimes = [];
        try {
            const { data: bookings } = await supabase
                .from('bookings')
                .select('booking_time')
                .eq('page_id', pageId)
                .eq('booking_date', date)
                .in('status', ['pending', 'confirmed']);
            bookedTimes = (bookings || []).map(b => b.booking_time);
        } catch (e) { }

        // Check calendar events
        try {
            const dateStart = new Date(date); dateStart.setHours(0, 0, 0, 0);
            const dateEnd = new Date(date); dateEnd.setHours(23, 59, 59, 999);
            const { data: events } = await supabase
                .from('calendar_events')
                .select('start_time')
                .gte('start_time', dateStart.toISOString())
                .lte('start_time', dateEnd.toISOString());

            if (events) {
                events.forEach(e => {
                    const et = new Date(e.start_time);
                    const ts = `${String(et.getHours()).padStart(2, '0')}:${String(et.getMinutes()).padStart(2, '0')}:00`;
                    if (!bookedTimes.includes(ts)) bookedTimes.push(ts);
                });
            }
        } catch (e) { }

        return res.status(200).json({ slots: generateSlots(config, date, bookedTimes) });
    } catch (e) {
        return res.status(200).json({ slots: generateSlots(baseConfig, date, []) });
    }
}

async function handleCreateBooking(req, res, supabase) {
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });

    try {
        const {
            pageId, psid, date, time, contactName, contactEmail, contactPhone,
            notes, customFormData, customMessage
        } = req.body;

        if (!pageId || !date || !time || !contactName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Auto-create table check
        const tableReady = await ensureBookingsTableExists(supabase);
        if (!tableReady) {
            // Demo mode
            return res.status(200).json({ success: true, demo: true, message: 'Demo booking', booking: { id: 'demo-' + Date.now() } });
        }

        const bookingDatetime = new Date(`${date}T${time}:00+08:00`);
        const bookingData = {
            page_id: pageId,
            contact_psid: psid || null,
            contact_name: contactName,
            contact_email: contactEmail || null,
            contact_phone: contactPhone || null,
            booking_date: date,
            booking_time: `${time}:00`,
            booking_datetime: bookingDatetime.toISOString(),
            form_data: customFormData || {},
            notes: notes || null,
            status: 'confirmed',
            confirmed_at: new Date().toISOString()
        };

        const { data, error } = await supabase.from('bookings').insert(bookingData).select().single();

        if (error) {
            console.error('Booking error:', error);
            // Handle specific easy errors with demo response
            if (error.code === '42P01' || error.code?.startsWith('42')) {
                return res.status(200).json({ success: true, demo: true, message: 'Demo booking (db error)' });
            }
            return res.status(500).json({ error: 'Failed to create booking', details: error.message });
        }

        // --- Side Effects (Calendar, Pipeline, Messenger) ---

        // 1. Calendar
        try {
            // Fetch slot duration
            let duration = 30;
            const { data: s } = await supabase.from('booking_settings').select('slot_duration').eq('page_id', pageId).single();
            if (s?.slot_duration) duration = s.slot_duration;

            const startTime = new Date(bookingDatetime);
            const endTime = new Date(startTime.getTime() + duration * 60000);

            let desc = `📱 Booked via booking page\n\n👤 Name: ${contactName}\n`;
            if (contactEmail) desc += `📧 Email: ${contactEmail}\n`;
            if (contactPhone) desc += `📞 Phone: ${contactPhone}\n`;
            if (notes) desc += `📝 Notes: ${notes}\n`;

            await supabase.from('calendar_events').insert({
                title: `📅 Booking: ${contactName}`,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                event_type: 'meeting',
                description: desc,
                all_day: false
            });
        } catch (e) { console.log('Calendar sync failed', e); }

        // 2. Pipeline (Clients)
        try {
            let client = null;
            if (contactPhone) {
                const { data: c } = await supabase.from('clients').select('id').ilike('contact_details', `%${contactPhone}%`).maybeSingle();
                client = c;
            }
            if (!client && contactName) {
                const { data: c } = await supabase.from('clients').select('id').ilike('client_name', contactName).maybeSingle();
                client = c;
            }
            if (!client) {
                await supabase.from('clients').insert({
                    client_name: contactName,
                    contact_details: [contactPhone, contactEmail].filter(Boolean).join(' | '),
                    phase: 'booked',
                    payment_status: 'unpaid',
                    source: 'booking',
                    created_at: new Date().toISOString()
                });
            }
        } catch (e) { console.log('Pipeline sync failed', e); }

        // 3. Messenger Confirmation
        if (psid) {
            try {
                const { data: page } = await supabase.from('facebook_pages').select('page_access_token').eq('page_id', pageId).single();
                if (page?.page_access_token) {
                    const msg = customMessage || `✅ Booking Confirmed!\n\n📅 ${date}\n🕐 ${time}\n\nSee you soon, ${contactName}!`;
                    await fetch(`${GRAPH_API_BASE}/${pageId}/messages?access_token=${page.page_access_token}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ recipient: { id: psid }, message: { text: msg } })
                    });
                }
            } catch (e) { console.log('Messenger confirmation failed', e); }
        }

        return res.status(200).json({ success: true, booking: data, message: 'Booking confirmed' });

    } catch (error) {
        console.error('Create booking fatal error:', error);
        return res.status(500).json({ error: 'Failed to create booking', details: error.message });
    }
}

// Main Handler
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE'); // Added DELETE just in case
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action } = req.query;

    // Auth bypass for creating client (Service Role)
    const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    }) : null;

    if (req.method === 'GET') {
        if (action === 'settings') return handleGetSettings(req, res, supabase);
        return handleGetAvailable(req, res, supabase); // Default GET
    }

    if (req.method === 'POST') {
        if (action === 'settings') return handlePostSettings(req, res, supabase);
        return handleCreateBooking(req, res, supabase); // Default POST
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
