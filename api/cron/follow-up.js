import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with fallbacks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Cron job to process follow-up reminders for bookings
 * Call via: GET /api/cron/follow-up
 */
export default async function handler(req, res) {
    // Allow GET requests from cron services
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('Starting follow-up cron job...');

    // Check Supabase config
    if (!supabaseUrl || !supabaseKey) {
        console.log('Supabase not configured');
        return res.status(200).json({
            success: true,
            message: 'Supabase not configured, skipping'
        });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const now = new Date();
        const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        // Get bookings that need follow-up
        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('*')
            .in('status', ['pending', 'confirmed'])
            .gte('booking_datetime', now.toISOString())
            .lte('booking_datetime', in24Hours.toISOString())
            .not('contact_psid', 'is', null);

        // Handle table not existing gracefully
        if (error) {
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                console.log('Bookings table does not exist yet');
                return res.status(200).json({
                    success: true,
                    message: 'Bookings table not found. Run booking_migration.sql first.',
                    checked: 0,
                    sent: 0
                });
            }
            throw error;
        }

        console.log(`Found ${bookings?.length || 0} bookings to check`);

        let sentCount = 0;
        const results = [];

        for (const booking of (bookings || [])) {
            const bookingTime = new Date(booking.booking_datetime);
            const hoursUntil = (bookingTime - now) / (1000 * 60 * 60);

            let followUpType = null;

            // Determine follow-up type
            if (!booking.reminder_sent && hoursUntil <= 24 && hoursUntil > 2) {
                followUpType = 'reminder_24h';
            } else if (!booking.follow_up_sent && hoursUntil <= 2 && hoursUntil > 0.25) {
                followUpType = 'reminder_2h';
            }

            if (!followUpType) continue;

            // Get page access token
            const { data: page } = await supabase
                .from('facebook_pages')
                .select('page_access_token')
                .eq('page_id', booking.page_id)
                .single();

            if (!page?.page_access_token) {
                console.log(`No token for page ${booking.page_id}`);
                continue;
            }

            // Generate message
            const formattedDate = bookingTime.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
            });
            const hour = bookingTime.getHours();
            const minute = String(bookingTime.getMinutes()).padStart(2, '0');
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;
            const formattedTime = `${hour12}:${minute} ${ampm}`;

            const message = followUpType === 'reminder_24h'
                ? `📅 Reminder: Your appointment is tomorrow!\n\n🗓 ${formattedDate}\n🕐 ${formattedTime}\n\nWe look forward to seeing you, ${booking.contact_name || ''}!`
                : `⏰ Your appointment is coming up soon!\n\n🗓 ${formattedDate}\n🕐 ${formattedTime}\n\nSee you very soon!`;

            // Send via Messenger
            try {
                const msgResponse = await fetch(
                    `${GRAPH_API_BASE}/${booking.page_id}/messages?access_token=${page.page_access_token}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            recipient: { id: booking.contact_psid },
                            message: { text: message }
                        })
                    }
                );

                if (msgResponse.ok) {
                    // Mark as sent
                    const updateField = followUpType === 'reminder_24h'
                        ? { reminder_sent: true }
                        : { follow_up_sent: true };

                    await supabase
                        .from('bookings')
                        .update({ ...updateField, updated_at: new Date().toISOString() })
                        .eq('id', booking.id);

                    sentCount++;
                    results.push({
                        bookingId: booking.id,
                        type: followUpType,
                        status: 'sent'
                    });
                } else {
                    const err = await msgResponse.json();
                    console.error(`Failed to send to ${booking.id}:`, err);
                    results.push({
                        bookingId: booking.id,
                        type: followUpType,
                        status: 'failed',
                        error: err.error?.message
                    });
                }
            } catch (msgError) {
                console.error(`Error sending to ${booking.id}:`, msgError);
                results.push({
                    bookingId: booking.id,
                    type: followUpType,
                    status: 'error',
                    error: msgError.message
                });
            }
        }

        console.log(`Follow-up cron complete. Sent ${sentCount} messages.`);

        return res.status(200).json({
            success: true,
            checked: bookings?.length || 0,
            sent: sentCount,
            results
        });
    } catch (error) {
        console.error('Follow-up cron error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Vercel cron config
export const config = {
    maxDuration: 60
};
