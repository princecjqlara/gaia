import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with fallbacks
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Default booking settings
const DEFAULT_CONFIG = {
    working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    start_time: '09:00',
    end_time: '17:00',
    slot_duration: 60,
    buffer_time: 15
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { pageId, date } = req.query;

    if (!pageId || !date) {
        return res.status(400).json({ error: 'pageId and date are required' });
    }

    // Check if Supabase is configured
    if (!supabaseUrl || !supabaseKey) {
        console.log('Supabase not configured, generating default slots');
        return res.status(200).json({ slots: generateSlots(DEFAULT_CONFIG, date, []) });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Get settings (handle table not existing)
        let config = DEFAULT_CONFIG;
        try {
            const { data: settings, error } = await supabase
                .from('booking_settings')
                .select('*')
                .eq('page_id', pageId)
                .single();

            if (!error && settings) {
                config = settings;
            }
        } catch (e) {
            console.log('Could not fetch settings, using defaults');
        }

        // Check if date is a working day
        const dateObj = new Date(date);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = dayNames[dateObj.getDay()];

        if (!config.working_days?.includes(dayName)) {
            return res.status(200).json({ slots: [], message: 'Not a working day' });
        }

        // Get existing bookings (handle table not existing)
        let bookedTimes = [];
        try {
            const { data: existingBookings } = await supabase
                .from('bookings')
                .select('booking_time')
                .eq('page_id', pageId)
                .eq('booking_date', date)
                .in('status', ['pending', 'confirmed']);

            bookedTimes = (existingBookings || []).map(b => b.booking_time);
        } catch (e) {
            console.log('Could not fetch existing bookings');
        }

        const slots = generateSlots(config, date, bookedTimes);
        return res.status(200).json({ slots });

    } catch (error) {
        console.error('Error fetching available slots:', error);
        // Return default slots on error
        return res.status(200).json({ slots: generateSlots(DEFAULT_CONFIG, date, []) });
    }
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

    // Check if date is in the past
    const now = new Date();
    const dateObj = new Date(date);
    const isToday = dateObj.toDateString() === now.toDateString();

    while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
        const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
        const timeWithSeconds = timeStr + ':00';

        // Skip if already booked
        if (bookedTimes.includes(timeWithSeconds) || bookedTimes.includes(timeStr)) {
            currentMinute += duration;
            while (currentMinute >= 60) {
                currentMinute -= 60;
                currentHour += 1;
            }
            continue;
        }

        // Skip if time has passed (for today)
        if (isToday) {
            const slotTime = new Date(date);
            slotTime.setHours(currentHour, currentMinute, 0, 0);
            if (slotTime <= now) {
                currentMinute += duration;
                while (currentMinute >= 60) {
                    currentMinute -= 60;
                    currentHour += 1;
                }
                continue;
            }
        }

        slots.push(timeStr);

        // Add slot duration
        currentMinute += duration;
        while (currentMinute >= 60) {
            currentMinute -= 60;
            currentHour += 1;
        }
    }

    return slots;
}
