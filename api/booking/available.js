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

    const { pageId, date, start_time, end_time, slot_duration, min_advance_hours } = req.query;

    if (!pageId || !date) {
        return res.status(400).json({ error: 'pageId and date are required' });
    }

    // Check if Supabase is configured
    if (!supabaseUrl || !supabaseKey) {
        console.log('Supabase not configured, generating default slots');
        // Use query params if provided
        const configFromParams = {
            ...DEFAULT_CONFIG,
            start_time: start_time || DEFAULT_CONFIG.start_time,
            end_time: end_time || DEFAULT_CONFIG.end_time,
            slot_duration: parseInt(slot_duration) || DEFAULT_CONFIG.slot_duration,
            min_advance_hours: parseInt(min_advance_hours) || 1
        };
        return res.status(200).json({ slots: generateSlots(configFromParams, date, []) });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Start with default config, then override with query params (from frontend localStorage)
        let config = {
            ...DEFAULT_CONFIG,
            start_time: start_time || DEFAULT_CONFIG.start_time,
            end_time: end_time || DEFAULT_CONFIG.end_time,
            slot_duration: parseInt(slot_duration) || DEFAULT_CONFIG.slot_duration,
            min_advance_hours: parseInt(min_advance_hours) || 1
        };

        // Try to get settings from database (lowest priority - query params override)
        try {
            const { data: settings, error } = await supabase
                .from('booking_settings')
                .select('*')
                .eq('page_id', pageId)
                .single();

            if (!error && settings) {
                // Only use DB values if query params weren't provided
                if (!start_time) config.start_time = settings.start_time || config.start_time;
                if (!end_time) config.end_time = settings.end_time || config.end_time;
                if (!slot_duration) config.slot_duration = settings.slot_duration || config.slot_duration;
                if (!min_advance_hours) config.min_advance_hours = settings.min_advance_hours || config.min_advance_hours;
                config.available_days = settings.available_days;
                config.working_days = settings.working_days;
            }
        } catch (e) {
            console.log('Could not fetch settings from DB, using params/defaults');
        }

        // Check if date is a working day - support both available_days (numeric) and working_days (string)
        const dateObj = new Date(date);
        const dayOfWeek = dateObj.getDay(); // 0=Sun, 6=Sat
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = dayNames[dayOfWeek];

        let isWorkingDay = true;
        if (config.available_days && Array.isArray(config.available_days)) {
            isWorkingDay = config.available_days.includes(dayOfWeek);
        } else if (config.working_days && Array.isArray(config.working_days)) {
            isWorkingDay = config.working_days.includes(dayName);
        }

        if (!isWorkingDay) {
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

        // Also check calendar_events for conflicts
        try {
            const dateStart = new Date(date);
            dateStart.setHours(0, 0, 0, 0);
            const dateEnd = new Date(date);
            dateEnd.setHours(23, 59, 59, 999);

            const { data: calendarEvents } = await supabase
                .from('calendar_events')
                .select('start_time')
                .gte('start_time', dateStart.toISOString())
                .lte('start_time', dateEnd.toISOString());

            if (calendarEvents && calendarEvents.length > 0) {
                calendarEvents.forEach(event => {
                    const eventTime = new Date(event.start_time);
                    const timeStr = `${String(eventTime.getHours()).padStart(2, '0')}:${String(eventTime.getMinutes()).padStart(2, '0')}:00`;
                    if (!bookedTimes.includes(timeStr)) {
                        bookedTimes.push(timeStr);
                    }
                });
            }
        } catch (e) {
            console.log('Could not fetch calendar events for availability check');
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

    // Only filter past times for today - no advance booking restrictions
    const now = new Date();
    const dateObj = new Date(date);
    const isToday = dateObj.toDateString() === now.toDateString();

    // Same-day buffer: if admin sets 5 hours, contacts can only book slots 5+ hours from now
    const sameDayBuffer = config.same_day_buffer || 0; // Default: no buffer, just past times
    const minBookingTime = isToday
        ? new Date(now.getTime() + (sameDayBuffer * 60 * 60 * 1000))
        : null;

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

        // For today: skip if slot is before minBookingTime (now + buffer hours)
        if (isToday) {
            const slotDateTime = new Date(date);
            slotDateTime.setHours(currentHour, currentMinute, 0, 0);
            if (slotDateTime <= (minBookingTime || now)) {
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

    console.log(`[SLOTS] Generated ${slots.length} available slots for ${date}`);
    return slots;
}
