import { getSupabaseClient } from './supabase';
import { callAI } from './aiService';

const getSupabase = () => {
    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not initialized');
    }
    return client;
};

/**
 * AI Follow-up Service
 * Handles intelligent follow-up logic for bookings
 */

/**
 * Determine if a booking needs follow-up and what type
 * @param {Object} booking - The booking object
 * @returns {Object} - { needsFollowUp: boolean, type: string, message: string }
 */
export async function analyzeFollowUpNeed(booking) {
    const now = new Date();
    const bookingTime = new Date(booking.booking_datetime);
    const hoursUntil = (bookingTime - now) / (1000 * 60 * 60);

    // Skip if booking is in the past or cancelled
    if (hoursUntil <= 0 || booking.status === 'cancelled') {
        return { needsFollowUp: false };
    }

    // Already sent all follow-ups
    if (booking.reminder_sent && booking.follow_up_sent) {
        return { needsFollowUp: false };
    }

    // 24-hour reminder
    if (!booking.reminder_sent && hoursUntil <= 24 && hoursUntil > 2) {
        return {
            needsFollowUp: true,
            type: 'reminder_24h',
            urgency: 'normal'
        };
    }

    // 2-hour reminder (final)
    if (!booking.follow_up_sent && hoursUntil <= 2 && hoursUntil > 0.5) {
        return {
            needsFollowUp: true,
            type: 'reminder_2h',
            urgency: 'high'
        };
    }

    return { needsFollowUp: false };
}

/**
 * Generate a personalized follow-up message using AI
 * @param {Object} booking - The booking object
 * @param {string} followUpType - Type of follow-up
 * @returns {string} - The follow-up message
 */
export async function generateFollowUpMessage(booking, followUpType) {
    const bookingDate = new Date(booking.booking_datetime);
    const formattedDate = bookingDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });
    const hour = bookingDate.getHours();
    const minute = String(bookingDate.getMinutes()).padStart(2, '0');
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    const formattedTime = `${hour12}:${minute} ${ampm}`;

    // Default messages if AI fails
    const defaultMessages = {
        reminder_24h: `📅 Reminder: Your appointment is tomorrow!\n\n🗓 ${formattedDate}\n🕐 ${formattedTime}\n\nWe look forward to seeing you!`,
        reminder_2h: `⏰ Your appointment is coming up in 2 hours!\n\n🗓 ${formattedDate}\n🕐 ${formattedTime}\n\nSee you soon!`
    };

    try {
        const prompt = `Generate a brief, friendly reminder message for ${booking.contact_name || 'a customer'} about their upcoming appointment.

Details:
- Date: ${formattedDate}
- Time: ${formattedTime}
- Follow-up type: ${followUpType === 'reminder_24h' ? '24-hour advance reminder' : 'Final 2-hour reminder'}

Keep it short (2-3 sentences max), include the date/time, use emojis sparingly. Be warm but professional.`;

        const aiResponse = await callAI(prompt);
        return aiResponse || defaultMessages[followUpType];
    } catch (error) {
        console.error('AI message generation failed:', error);
        return defaultMessages[followUpType];
    }
}

/**
 * Send follow-up message via Facebook Messenger
 * @param {string} pageId - Facebook page ID
 * @param {string} psid - User's PSID
 * @param {string} message - Message to send
 * @param {string} accessToken - Page access token
 */
export async function sendFollowUpMessage(pageId, psid, message, accessToken) {
    const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

    const response = await fetch(
        `${GRAPH_API_BASE}/${pageId}/messages?access_token=${accessToken}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: psid },
                message: { text: message }
            })
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to send follow-up');
    }

    return true;
}

/**
 * Get bookings that may need follow-up
 */
export async function getBookingsNeedingFollowUp() {
    try {
        const now = new Date();
        const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const { data, error } = await getSupabase()
            .from('bookings')
            .select('*, page:page_id(page_access_token)')
            .in('status', ['pending', 'confirmed'])
            .gte('booking_datetime', now.toISOString())
            .lte('booking_datetime', in24Hours.toISOString())
            .or('reminder_sent.eq.false,follow_up_sent.eq.false');

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching bookings:', error);
        return [];
    }
}

/**
 * Mark a booking as having received follow-up
 */
export async function markFollowUpSent(bookingId, followUpType) {
    try {
        const updateField = followUpType === 'reminder_24h'
            ? { reminder_sent: true }
            : { follow_up_sent: true };

        const { error } = await getSupabase()
            .from('bookings')
            .update({ ...updateField, updated_at: new Date().toISOString() })
            .eq('id', bookingId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error marking follow-up sent:', error);
        return false;
    }
}

export default {
    analyzeFollowUpNeed,
    generateFollowUpMessage,
    sendFollowUpMessage,
    getBookingsNeedingFollowUp,
    markFollowUpSent
};
