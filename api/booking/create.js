import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with fallbacks
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

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
        return res.status(500).json({ error: 'Database not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

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
            customMessage // Optional custom confirmation message
        } = req.body;

        if (!pageId || !date || !time || !contactName) {
            return res.status(400).json({ error: 'Missing required fields: pageId, date, time, contactName' });
        }

        // Create booking datetime
        const bookingDatetime = new Date(`${date}T${time}:00`);

        // Check for overlap - prevent double-booking
        try {
            const { data: existing } = await supabase
                .from('bookings')
                .select('id')
                .eq('page_id', pageId)
                .eq('booking_date', date)
                .eq('booking_time', `${time}:00`)
                .in('status', ['pending', 'confirmed'])
                .maybeSingle();

            if (existing) {
                return res.status(409).json({
                    error: 'This time slot is no longer available',
                    code: 'SLOT_TAKEN'
                });
            }
        } catch (overlapError) {
            // If bookings table doesn't exist, continue anyway
            if (!overlapError.message?.includes('does not exist')) {
                throw overlapError;
            }
        }

        // Create the booking
        let booking = null;
        try {
            const { data, error: bookingError } = await supabase
                .from('bookings')
                .insert({
                    page_id: pageId,
                    contact_psid: psid,
                    contact_name: contactName,
                    contact_email: contactEmail,
                    contact_phone: contactPhone,
                    booking_date: date,
                    booking_time: `${time}:00`,
                    booking_datetime: bookingDatetime.toISOString(),
                    form_data: customFormData || {},
                    notes,
                    status: 'confirmed',
                    confirmed_at: new Date().toISOString()
                })
                .select()
                .single();

            if (bookingError) {
                if (bookingError.code === '42P01' || bookingError.message?.includes('does not exist')) {
                    // Table doesn't exist - return success but advise to run migration
                    return res.status(200).json({
                        success: true,
                        message: 'Booking received (database pending migration)',
                        booking: {
                            contact_name: contactName,
                            booking_date: date,
                            booking_time: time
                        }
                    });
                }
                throw bookingError;
            }
            booking = data;
        } catch (insertError) {
            console.error('Insert error:', insertError);
            throw insertError;
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

        // Use custom message if provided, otherwise default
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
                // Don't fail the booking if message fails
            }
        }

        return res.status(200).json({
            success: true,
            booking,
            message: 'Booking confirmed successfully'
        });
    } catch (error) {
        console.error('Error creating booking:', error);
        return res.status(500).json({
            error: 'Failed to create booking',
            details: error.message
        });
    }
}
