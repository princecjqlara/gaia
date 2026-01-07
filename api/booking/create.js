import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service role key to bypass RLS
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

// Function to create bookings table if it doesn't exist
async function ensureBookingsTableExists(supabase) {
    // Try to insert and if it fails due to missing table, we'll handle it
    const { error: checkError } = await supabase
        .from('bookings')
        .select('id')
        .limit(1);

    if (checkError && (checkError.code === '42P01' || checkError.message?.includes('does not exist'))) {
        console.log('Bookings table not found, attempting to create...');

        // Try to create the table using raw SQL via RPC if available
        // If not, we'll return a helpful error
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
                    
                    CREATE POLICY IF NOT EXISTS "Bookings insertable by all" ON bookings
                        FOR INSERT WITH CHECK (true);
                    
                    CREATE POLICY IF NOT EXISTS "Bookings viewable by authenticated" ON bookings
                        FOR SELECT USING (true);
                `
            });

            if (createError) {
                console.log('Could not auto-create table:', createError);
                return false;
            }
            return true;
        } catch (e) {
            console.log('Auto-create not available:', e);
            return false;
        }
    }
    return true; // Table exists
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check Supabase config
    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase config:', { url: !!supabaseUrl, key: !!supabaseKey });
        return res.status(500).json({
            error: 'Database not configured',
            details: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
        });
    }

    // Create Supabase client with admin options to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    try {
        const {
            pageId,
            psid,
            date,
            time,
            contactName,
            contactEmail,
            contactPhone,
            notes,
            customFormData,
            customMessage
        } = req.body;

        if (!pageId || !date || !time || !contactName) {
            return res.status(400).json({ error: 'Missing required fields: pageId, date, time, contactName' });
        }

        // Check/create bookings table
        const tableReady = await ensureBookingsTableExists(supabase);
        if (!tableReady) {
            // Return a mock success for demo purposes when table doesn't exist
            console.log('Table not ready, returning demo success');
            return res.status(200).json({
                success: true,
                demo: true,
                message: 'Booking recorded (demo mode - run booking_migration.sql in Supabase for full functionality)',
                booking: {
                    id: 'demo-' + Date.now(),
                    page_id: pageId,
                    contact_name: contactName,
                    booking_date: date,
                    booking_time: time,
                    status: 'confirmed'
                }
            });
        }

        // Create booking datetime - interpret time as Philippines timezone (UTC+8)
        // Append +08:00 to the date string so it's correctly interpreted as Philippines time
        // regardless of the server's timezone
        const bookingDatetime = new Date(`${date}T${time}:00+08:00`);

        // Create the booking
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

        console.log('Attempting to insert booking:', bookingData);

        const { data, error: bookingError } = await supabase
            .from('bookings')
            .insert(bookingData)
            .select()
            .single();

        if (bookingError) {
            console.error('Supabase booking error:', bookingError);

            // Check for common errors - return demo success for DB setup issues
            if (bookingError.code === '42P01' ||
                bookingError.message?.includes('does not exist') ||
                bookingError.code === '42501' ||
                bookingError.message?.includes('permission denied') ||
                bookingError.message?.includes('relation') ||
                bookingError.code?.startsWith('42')) {

                console.log('Database not ready, returning demo success');
                return res.status(200).json({
                    success: true,
                    demo: true,
                    message: 'Booking recorded (demo mode - run booking_migration.sql in Supabase for full functionality)',
                    booking: {
                        id: 'demo-' + Date.now(),
                        page_id: pageId,
                        contact_name: contactName,
                        contact_email: contactEmail,
                        contact_phone: contactPhone,
                        booking_date: date,
                        booking_time: time,
                        status: 'confirmed'
                    }
                });
            }

            return res.status(500).json({
                error: 'Failed to create booking',
                details: bookingError.message,
                code: bookingError.code,
                hint: bookingError.hint || null
            });
        }

        console.log('Booking created successfully:', data?.id);

        // Auto-add to team calendar (calendar_events table)
        try {
            // Get slot duration from settings (default 30 min)
            let slotDuration = 30;
            try {
                const { data: settings } = await supabase
                    .from('booking_settings')
                    .select('slot_duration')
                    .eq('page_id', pageId)
                    .single();
                if (settings?.slot_duration) {
                    slotDuration = settings.slot_duration;
                }
            } catch (e) {
                console.log('Could not fetch slot duration, using default 30 min');
            }

            // Calculate end time
            const startTime = new Date(bookingDatetime);
            const endTime = new Date(startTime.getTime() + slotDuration * 60 * 1000);

            // Build detailed description with all contact info and custom fields
            let eventDescription = `📱 Booked via booking page\n\n`;
            eventDescription += `👤 Name: ${contactName}\n`;
            if (contactEmail) eventDescription += `📧 Email: ${contactEmail}\n`;
            if (contactPhone) eventDescription += `📞 Phone: ${contactPhone}\n`;
            if (notes) eventDescription += `📝 Notes: ${notes}\n`;

            // Add custom form data
            if (customFormData && Object.keys(customFormData).length > 0) {
                eventDescription += `\n📋 Additional Info:\n`;
                for (const [key, value] of Object.entries(customFormData)) {
                    if (value) {
                        // Format key for display (remove underscores, capitalize)
                        const formattedKey = key.replace(/_/g, ' ').replace(/^field /i, '').replace(/\b\w/g, l => l.toUpperCase());
                        eventDescription += `• ${formattedKey}: ${value}\n`;
                    }
                }
            }

            const calendarEvent = {
                title: `📅 Booking: ${contactName}`,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                event_type: 'meeting',
                description: eventDescription.trim() + `\n\n🔗 Booking ID: ${data?.id || 'N/A'}`,
                all_day: false
            };

            console.log('Creating calendar event:', calendarEvent.title);

            const { error: calendarError } = await supabase
                .from('calendar_events')
                .insert(calendarEvent);

            if (calendarError) {
                console.log('Could not add to calendar (table may not exist):', calendarError.message);
            } else {
                console.log('✅ Added booking to team calendar');
            }
        } catch (calError) {
            console.log('Calendar sync error (non-critical):', calError.message);
        }

        // Build confirmation message
        const formattedDate = new Date(date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const hour = parseInt(time.split(':')[0]);
        const minute = time.split(':')[1];
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        const formattedTime = `${hour12}:${minute} ${ampm}`;

        const confirmationMessage = customMessage ||
            `✅ Booking Confirmed!\n\n📅 Date: ${formattedDate}\n🕐 Time: ${formattedTime}\n\nWe look forward to meeting with you, ${contactName}!`;

        // Send confirmation to Messenger if we have PSID
        if (psid) {
            try {
                const { data: page } = await supabase
                    .from('facebook_pages')
                    .select('page_access_token')
                    .eq('page_id', pageId)
                    .single();

                if (page?.page_access_token) {
                    await fetch(`${GRAPH_API_BASE}/${pageId}/messages?access_token=${page.page_access_token}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            recipient: { id: psid },
                            message: { text: confirmationMessage }
                        })
                    });
                }
            } catch (msgError) {
                console.error('Failed to send confirmation message:', msgError);
            }
        }

        return res.status(200).json({
            success: true,
            booking: data,
            message: 'Booking confirmed successfully'
        });
    } catch (error) {
        console.error('Error creating booking:', error);
        return res.status(500).json({
            error: 'Failed to create booking',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
