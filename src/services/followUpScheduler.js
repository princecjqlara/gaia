/**
 * Follow-Up Scheduler Service
 * Intelligent follow-up scheduling with Best Time to Contact model
 * Module 2 of the Enterprise AI Chatbot System
 */

import { getSupabaseClient } from './supabase';
import { checkSafetyStatus, logSafetyEvent } from './safetyLayer';
import { getActiveGoal } from './goalController';

const getSupabase = () => {
    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not initialized');
    }
    return client;
};

/**
 * Best Time to Contact result with multiple recommended time slots
 * @typedef {Object} BestTimeResult
 * @property {Array<{dayOfWeek: number, hourOfDay: number, score: number}>} bestSlots - Top time slots
 * @property {number} confidence - Confidence in prediction (0-1)
 * @property {Date} nextBestTime - Next occurrence of best time
 * @property {boolean} usedNeighborData - Whether neighbor data was used
 */

/**
 * Calculate the best times to contact a specific conversation
 * Returns multiple time slots, uses neighbor contact data when sparse
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<BestTimeResult>}
 */
export async function calculateBestTimeToContact(conversationId) {
    try {
        const db = getSupabase();

        // Get engagement history for this contact
        const { data: engagements, error } = await db
            .from('contact_engagement')
            .select('day_of_week, hour_of_day, response_latency_seconds, engagement_score')
            .eq('conversation_id', conversationId)
            .eq('message_direction', 'inbound')
            .order('message_timestamp', { ascending: false })
            .limit(50);

        if (error) throw error;

        let dataSource = 'contact';
        let allEngagements = engagements || [];

        // If not enough data, get neighbor contact data
        if (!engagements || engagements.length < 5) {
            const neighborData = await getNeighborContactData(conversationId, db);
            if (neighborData.length > 0) {
                allEngagements = [...(engagements || []), ...neighborData];
                dataSource = 'neighbors';
            }
        }

        // Still not enough? Use defaults
        if (allEngagements.length < 3) {
            return getDefaultBestTimes(conversationId);
        }

        // Calculate weighted scores for each day/hour combination
        const timeScores = {};

        for (const eng of allEngagements) {
            const key = `${eng.day_of_week}-${eng.hour_of_day}`;

            if (!timeScores[key]) {
                timeScores[key] = {
                    dayOfWeek: eng.day_of_week,
                    hourOfDay: eng.hour_of_day,
                    count: 0,
                    totalLatency: 0,
                    totalScore: 0
                };
            }

            timeScores[key].count++;
            timeScores[key].totalLatency += eng.response_latency_seconds || 0;
            timeScores[key].totalScore += eng.engagement_score || 1;
        }

        // Score all time slots
        const rankedSlots = [];
        for (const [key, slot] of Object.entries(timeScores)) {
            const avgLatency = slot.totalLatency / slot.count;
            const avgScore = slot.totalScore / slot.count;
            const latencyFactor = Math.max(0, 1 - (avgLatency / 3600));
            const rating = (slot.count * 0.3) + (latencyFactor * 0.4) + (avgScore * 0.3);

            rankedSlots.push({
                dayOfWeek: slot.dayOfWeek,
                hourOfDay: slot.hourOfDay,
                score: rating,
                count: slot.count
            });
        }

        // Sort by score descending
        rankedSlots.sort((a, b) => b.score - a.score);

        // Get top 5 time slots (multiple best times)
        const bestSlots = rankedSlots.slice(0, 5);

        if (bestSlots.length === 0) {
            return getDefaultBestTimes(conversationId);
        }

        // Calculate confidence
        const confidence = Math.min(allEngagements.length / 20, 1) * (dataSource === 'contact' ? 1 : 0.7);

        // Get next occurrences for all slots
        const slotsWithNextTime = bestSlots.map(slot => ({
            ...slot,
            nextTime: getNextOccurrence(slot.dayOfWeek, slot.hourOfDay)
        }));

        // Find soonest next time
        slotsWithNextTime.sort((a, b) => a.nextTime - b.nextTime);

        return {
            bestSlots: bestSlots,
            confidence,
            nextBestTime: slotsWithNextTime[0].nextTime,
            allNextTimes: slotsWithNextTime.map(s => s.nextTime),
            dataPoints: allEngagements.length,
            usedNeighborData: dataSource === 'neighbors',
            // Keep legacy single return for backward compatibility
            dayOfWeek: bestSlots[0].dayOfWeek,
            hourOfDay: bestSlots[0].hourOfDay
        };

    } catch (error) {
        console.error('[SCHEDULER] Error calculating best time:', error);
        return getDefaultBestTimes(conversationId);
    }
}

/**
 * Get engagement data from similar/neighbor contacts when current contact has sparse data
 * @param {string} conversationId - Current conversation ID
 * @param {Object} db - Supabase client
 */
async function getNeighborContactData(conversationId, db) {
    try {
        // Get the page_id for this conversation
        const { data: conv } = await db
            .from('facebook_conversations')
            .select('page_id')
            .eq('conversation_id', conversationId)
            .single();

        if (!conv) return [];

        // Get engagement data from other contacts on the same page
        // This provides "neighbor" data - contacts who interact with the same business
        const { data: neighborEngagements } = await db
            .from('contact_engagement')
            .select('day_of_week, hour_of_day, response_latency_seconds, engagement_score')
            .eq('page_id', conv.page_id)
            .neq('conversation_id', conversationId)
            .eq('message_direction', 'inbound')
            .order('message_timestamp', { ascending: false })
            .limit(100);

        console.log(`[SCHEDULER] Using neighbor data: ${neighborEngagements?.length || 0} data points`);
        return neighborEngagements || [];

    } catch (error) {
        console.error('[SCHEDULER] Error getting neighbor data:', error);
        return [];
    }
}

/**
 * Get default best times (multiple business hours slots)
 * Uses conversationId to generate consistent but varied defaults per contact
 * @param {string} conversationId - Optional conversation ID for variation
 */
function getDefaultBestTimes(conversationId = null) {
    const now = new Date();

    // Use conversationId to create variation so different contacts get different defaults
    let seedValue = 0;
    if (conversationId) {
        // Create a simple hash from the conversation ID
        for (let i = 0; i < conversationId.length; i++) {
            seedValue = ((seedValue << 5) - seedValue) + conversationId.charCodeAt(i);
            seedValue |= 0; // Convert to 32-bit integer
        }
        seedValue = Math.abs(seedValue);
    }

    // Map seed to day (1-5 for Mon-Fri) and hour (9-16 for business hours)
    const primaryDay = 1 + (seedValue % 5); // 1-5 (Mon-Fri)
    const primaryHour = 9 + ((seedValue >> 8) % 8); // 9-16 (9am-4pm)

    // Generate 5 slots based on the seed, spread across the week
    const defaultSlots = [
        { dayOfWeek: primaryDay, hourOfDay: primaryHour, score: 0.8 },
        { dayOfWeek: 1 + ((primaryDay) % 5), hourOfDay: 9 + ((primaryHour + 4) % 8), score: 0.75 },
        { dayOfWeek: 1 + ((primaryDay + 1) % 5), hourOfDay: 9 + ((primaryHour + 2) % 8), score: 0.7 },
        { dayOfWeek: 1 + ((primaryDay + 2) % 5), hourOfDay: 9 + ((primaryHour + 6) % 8), score: 0.65 },
        { dayOfWeek: 1 + ((primaryDay + 3) % 5), hourOfDay: 9 + ((primaryHour + 1) % 8), score: 0.6 }
    ];

    // Find next occurrence of the primary slot
    let nextBestTime = getNextOccurrence(primaryDay, primaryHour);

    return {
        bestSlots: defaultSlots,
        dayOfWeek: primaryDay,
        hourOfDay: primaryHour,
        confidence: 0.3,
        nextBestTime,
        allNextTimes: defaultSlots.map(s => getNextOccurrence(s.dayOfWeek, s.hourOfDay)),
        dataPoints: 0,
        usedNeighborData: false
    };
}

// Keep legacy function for backward compatibility
function getDefaultBestTime() {
    return getDefaultBestTimes();
}

/**
 * Get next occurrence of a specific day/hour
 */
function getNextOccurrence(dayOfWeek, hourOfDay) {
    const now = new Date();
    const result = new Date(now);

    // Set the hour
    result.setHours(hourOfDay, 0, 0, 0);

    // Calculate days until target day
    let daysUntil = dayOfWeek - now.getDay();
    if (daysUntil < 0 || (daysUntil === 0 && now.getHours() >= hourOfDay)) {
        daysUntil += 7;
    }

    result.setDate(result.getDate() + daysUntil);
    return result;
}

/**
 * Schedule a follow-up for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Scheduling options
 */
export async function scheduleFollowUp(conversationId, options = {}) {
    try {
        const db = getSupabase();

        const {
            type = 'manual',
            scheduledAt = null,
            message = null,
            reason = null,
            goalId = null,
            useBestTime = false,
            delayHours = null,
            userId = null
        } = options;

        // Check safety status
        const safety = await checkSafetyStatus(conversationId);
        if (safety.optedOut) {
            return {
                success: false,
                error: 'Contact has opted out',
                reason: 'opted_out'
            };
        }

        // Get conversation for page_id
        const { data: conv } = await db
            .from('facebook_conversations')
            .select('page_id, cooldown_until')
            .eq('conversation_id', conversationId)
            .single();

        if (!conv) {
            throw new Error('Conversation not found');
        }

        // Determine scheduled time
        let targetTime;
        if (scheduledAt) {
            targetTime = new Date(scheduledAt);
        } else if (useBestTime) {
            const bestTime = await calculateBestTimeToContact(conversationId);
            targetTime = bestTime.nextBestTime;
        } else if (delayHours) {
            targetTime = new Date();
            targetTime.setHours(targetTime.getHours() + delayHours);
        } else {
            // Default: 4 hours from now
            targetTime = new Date();
            targetTime.setHours(targetTime.getHours() + 4);
        }

        // Ensure scheduled time respects cooldown
        if (conv.cooldown_until) {
            const cooldownEnd = new Date(conv.cooldown_until);
            if (targetTime < cooldownEnd) {
                targetTime = cooldownEnd;
            }
        }

        // Check for existing pending follow-ups
        const { data: existing } = await db
            .from('ai_followup_schedule')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('status', 'pending');

        // Cancel existing if scheduling new
        if (existing && existing.length > 0) {
            await db
                .from('ai_followup_schedule')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('conversation_id', conversationId)
                .eq('status', 'pending');
        }

        // Create new follow-up
        const { data: followUp, error } = await db
            .from('ai_followup_schedule')
            .insert({
                conversation_id: conversationId,
                page_id: conv.page_id,
                scheduled_at: targetTime.toISOString(),
                follow_up_type: type,
                reason,
                message_template: message,
                goal_id: goalId,
                status: 'pending',
                cooldown_until: conv.cooldown_until,
                created_by: userId
            })
            .select()
            .single();

        if (error) throw error;

        // Log action
        await logSafetyEvent({
            conversationId,
            pageId: conv.page_id,
            actionType: 'followup_scheduled',
            data: {
                followUpId: followUp.id,
                scheduledAt: targetTime.toISOString(),
                type,
                reason
            },
            explanation: `Follow-up scheduled for ${targetTime.toLocaleString()}`,
            goalId
        });

        console.log(`[SCHEDULER] Scheduled ${type} follow-up for ${conversationId} at ${targetTime}`);

        return {
            success: true,
            followUp,
            scheduledAt: targetTime
        };

    } catch (error) {
        console.error('[SCHEDULER] Error scheduling follow-up:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get scheduled follow-ups for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Query options
 */
export async function getScheduledFollowUps(conversationId, options = {}) {
    try {
        const db = getSupabase();
        const { includeAll = false, limit = 10 } = options;

        let query = db
            .from('ai_followup_schedule')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('scheduled_for', { ascending: true })
            .limit(limit);

        if (!includeAll) {
            query = query.eq('status', 'pending');
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];

    } catch (error) {
        console.error('[SCHEDULER] Error getting follow-ups:', error);
        return [];
    }
}

/**
 * Get all pending follow-ups (for cron processing)
 * @param {Date} beforeTime - Get follow-ups scheduled before this time
 */
export async function getPendingFollowUps(beforeTime = null) {
    try {
        const db = getSupabase();
        const targetTime = beforeTime || new Date();

        const { data, error } = await db
            .from('ai_followup_schedule')
            .select(`
                *,
                conversation:conversation_id(
                    participant_id,
                    participant_name,
                    human_takeover,
                    opt_out,
                    cooldown_until
                ),
                page:page_id(
                    page_access_token,
                    page_name
                ),
                goal:goal_id(
                    goal_type,
                    goal_prompt
                )
            `)
            .eq('status', 'pending')
            .lte('scheduled_for', targetTime.toISOString())
            .order('scheduled_for', { ascending: true })
            .limit(50);

        if (error) throw error;
        return data || [];

    } catch (error) {
        console.error('[SCHEDULER] Error getting pending follow-ups:', error);
        return [];
    }
}

/**
 * Cancel a scheduled follow-up
 * @param {string} followUpId - Follow-up ID
 * @param {string} reason - Cancellation reason
 */
export async function cancelFollowUp(followUpId, reason = null) {
    try {
        const db = getSupabase();

        const { data: followUp, error: fetchError } = await db
            .from('ai_followup_schedule')
            .select('conversation_id, follow_up_type')
            .eq('id', followUpId)
            .single();

        if (fetchError) throw fetchError;

        const { error } = await db
            .from('ai_followup_schedule')
            .update({
                status: 'cancelled',
                error_message: reason,
                updated_at: new Date().toISOString()
            })
            .eq('id', followUpId);

        if (error) throw error;

        await logSafetyEvent({
            conversationId: followUp.conversation_id,
            actionType: 'followup_cancelled',
            data: { followUpId, reason },
            explanation: reason ? `Follow-up cancelled: ${reason}` : 'Follow-up cancelled'
        });

        return { success: true };

    } catch (error) {
        console.error('[SCHEDULER] Error cancelling follow-up:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Mark a follow-up as sent
 * @param {string} followUpId - Follow-up ID
 * @param {string} messageId - Sent message ID
 */
export async function markFollowUpSent(followUpId, messageId = null) {
    try {
        const db = getSupabase();

        const { error } = await db
            .from('ai_followup_schedule')
            .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                sent_message_id: messageId,
                updated_at: new Date().toISOString()
            })
            .eq('id', followUpId);

        if (error) throw error;
        return { success: true };

    } catch (error) {
        console.error('[SCHEDULER] Error marking follow-up sent:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Mark a follow-up as failed
 * @param {string} followUpId - Follow-up ID
 * @param {string} errorMessage - Error message
 */
export async function markFollowUpFailed(followUpId, errorMessage) {
    try {
        const db = getSupabase();

        const { data: followUp } = await db
            .from('ai_followup_schedule')
            .select('retry_count, max_retries')
            .eq('id', followUpId)
            .single();

        const newRetryCount = (followUp?.retry_count || 0) + 1;
        const shouldRetry = newRetryCount < (followUp?.max_retries || 3);

        const { error } = await db
            .from('ai_followup_schedule')
            .update({
                status: shouldRetry ? 'pending' : 'failed',
                retry_count: newRetryCount,
                error_message: errorMessage,
                // If retrying, delay by 1 hour
                scheduled_at: shouldRetry
                    ? new Date(Date.now() + 3600000).toISOString()
                    : undefined,
                updated_at: new Date().toISOString()
            })
            .eq('id', followUpId);

        if (error) throw error;

        return {
            success: true,
            willRetry: shouldRetry,
            retryCount: newRetryCount
        };

    } catch (error) {
        console.error('[SCHEDULER] Error marking follow-up failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Record engagement data for Best Time calculation
 * @param {Object} data - Engagement data
 */
export async function recordEngagement(data) {
    try {
        const db = getSupabase();

        const {
            conversationId,
            participantId,
            pageId,
            messageTimestamp,
            direction,
            responseLatency = null
        } = data;

        const timestamp = new Date(messageTimestamp);

        const { error } = await db
            .from('contact_engagement')
            .insert({
                conversation_id: conversationId,
                participant_id: participantId,
                page_id: pageId,
                message_timestamp: timestamp.toISOString(),
                message_direction: direction,
                response_latency_seconds: responseLatency,
                day_of_week: timestamp.getDay(),
                hour_of_day: timestamp.getHours(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            });

        if (error) throw error;
        return { success: true };

    } catch (error) {
        console.error('[SCHEDULER] Error recording engagement:', error);
        return { success: false };
    }
}

/**
 * Get engagement analytics for a contact
 * @param {string} conversationId - Conversation ID
 */
export async function getEngagementAnalytics(conversationId) {
    try {
        const db = getSupabase();

        const { data, error } = await db
            .from('contact_engagement')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('message_timestamp', { ascending: false })
            .limit(100);

        if (error) throw error;

        if (!data || data.length === 0) {
            return { hasData: false };
        }

        // Calculate analytics
        const inbound = data.filter(e => e.message_direction === 'inbound');
        const avgLatency = inbound.reduce((sum, e) => sum + (e.response_latency_seconds || 0), 0) / inbound.length;

        // Most active hours
        const hourCounts = {};
        for (const e of inbound) {
            hourCounts[e.hour_of_day] = (hourCounts[e.hour_of_day] || 0) + 1;
        }
        const topHours = Object.entries(hourCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([hour, count]) => ({ hour: parseInt(hour), count }));

        // Most active days
        const dayCounts = {};
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        for (const e of inbound) {
            dayCounts[e.day_of_week] = (dayCounts[e.day_of_week] || 0) + 1;
        }
        const topDays = Object.entries(dayCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([day, count]) => ({ day: dayNames[parseInt(day)], count }));

        return {
            hasData: true,
            totalMessages: data.length,
            inboundMessages: inbound.length,
            avgResponseLatencySeconds: Math.round(avgLatency),
            avgResponseLatencyMinutes: Math.round(avgLatency / 60),
            topHours,
            topDays,
            timezone: data[0]?.timezone || 'Unknown'
        };

    } catch (error) {
        console.error('[SCHEDULER] Error getting analytics:', error);
        return { hasData: false, error: error.message };
    }
}

/**
 * Detect when customer mentions their availability (e.g., "I'm free at 3pm", "available tomorrow")
 * @param {string} messageText - Message text to analyze
 * @returns {Object|null} Parsed availability information
 */
export function detectAvailabilityMention(messageText) {
    if (!messageText) return null;

    const text = messageText.toLowerCase();
    const now = new Date();

    // Patterns for detecting availability
    const patterns = [
        // "I'm free at 3pm", "available at 2:30"
        /(?:i'?m |i am |i'll be |i will be )?(?:free|available|open|can talk|can meet|can chat)(?: at| around| by)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
        // "call me at 5", "message me at 3pm"
        /(?:call|text|message|reach|contact) (?:me |us )?(?:at|around|by)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
        // "after 6pm", "before noon"
        /(?:free |available )?(?:after|before|around)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|noon|midnight)?/i,
        // "tomorrow at 2", "today at 5pm"
        /(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:at|around)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
        // "in 2 hours", "in 30 minutes"
        /(?:free |available )?in\s*(\d+)\s*(hour|minute|min|hr)s?/i,
        // "5 minutes from now"
        /(\d+)\s*(hour|minute|min|hr)s?\s*(?:from now|from here)/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            let targetTime = new Date(now);

            // Handle relative time (in X hours/minutes)
            if (match[0].includes('in ') || match[0].includes('from now')) {
                const amount = parseInt(match[1]);
                const unit = match[2]?.toLowerCase();

                if (unit?.startsWith('hour') || unit === 'hr') {
                    targetTime.setHours(targetTime.getHours() + amount);
                } else if (unit?.startsWith('min')) {
                    targetTime.setMinutes(targetTime.getMinutes() + amount);
                }

                return {
                    detected: true,
                    targetTime,
                    rawMatch: match[0],
                    isRelative: true,
                    delayMinutes: unit?.startsWith('hour') ? amount * 60 : amount
                };
            }

            // Handle day mentions
            const dayMention = match[0].match(/(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
            if (dayMention) {
                const day = dayMention[1].toLowerCase();
                if (day === 'tomorrow') {
                    targetTime.setDate(targetTime.getDate() + 1);
                } else if (day !== 'today') {
                    // Find next occurrence of that day
                    const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(day);
                    let daysUntil = dayIndex - now.getDay();
                    if (daysUntil <= 0) daysUntil += 7;
                    targetTime.setDate(targetTime.getDate() + daysUntil);
                }
            }

            // Parse time
            const hourMatch = match[0].match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
            if (hourMatch) {
                let hour = parseInt(hourMatch[1]);
                const minutes = parseInt(hourMatch[2]) || 0;
                const meridiem = hourMatch[3]?.toLowerCase();

                if (meridiem === 'pm' && hour < 12) hour += 12;
                if (meridiem === 'am' && hour === 12) hour = 0;

                // If no am/pm specified: assume PM for hours 1-7, AM for 8-11
                if (!meridiem && hour >= 1 && hour <= 7) hour += 12;

                targetTime.setHours(hour, minutes, 0, 0);
            }

            // If target time is in the past, add a day
            if (targetTime < now) {
                targetTime.setDate(targetTime.getDate() + 1);
            }

            return {
                detected: true,
                targetTime,
                rawMatch: match[0],
                isRelative: false,
                delayMinutes: Math.round((targetTime - now) / (1000 * 60))
            };
        }
    }

    return null;
}

/**
 * Schedule a quick intuition-based follow-up (within minutes/hours, not days)
 * Used for keeping leads warm with rapid responses
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Quick follow-up options
 */
export async function scheduleQuickFollowUp(conversationId, options = {}) {
    const {
        delayMinutes = 5,
        reason = 'Quick intuition-based follow-up',
        type = 'intuition_quick',
        message = null,
        ignoreExisting = false // Allow multiple per day
    } = options;

    try {
        const db = getSupabase();

        // Check safety
        const safety = await checkSafetyStatus(conversationId);
        if (safety.optedOut || safety.humanTakeover) {
            return { success: false, error: safety.optedOut ? 'opted_out' : 'human_takeover' };
        }

        // Get conversation
        const { data: conv } = await db
            .from('facebook_conversations')
            .select('page_id, cooldown_until, last_ai_message_at')
            .eq('conversation_id', conversationId)
            .single();

        if (!conv) {
            return { success: false, error: 'conversation_not_found' };
        }

        // Check cooldown (but allow shorter cooldown for quick follow-ups)
        const now = new Date();
        if (conv.cooldown_until) {
            const cooldown = new Date(conv.cooldown_until);
            // For quick follow-ups, use a 30-minute minimum cooldown instead of hours
            const quickCooldownEnd = conv.last_ai_message_at
                ? new Date(new Date(conv.last_ai_message_at).getTime() + 30 * 60 * 1000)
                : new Date(0);

            if (now < quickCooldownEnd && !ignoreExisting) {
                const waitMinutes = Math.ceil((quickCooldownEnd - now) / (60 * 1000));
                return { success: false, error: `quick_cooldown`, waitMinutes };
            }
        }

        // Don't cancel existing follow-ups for quick ones - allow stacking
        if (!ignoreExisting) {
            const { data: existing } = await db
                .from('ai_followup_schedule')
                .select('id, scheduled_at')
                .eq('conversation_id', conversationId)
                .eq('status', 'pending')
                .limit(5);

            // Allow max 3 pending follow-ups per conversation
            if (existing && existing.length >= 3) {
                return { success: false, error: 'too_many_pending', count: existing.length };
            }
        }

        // Schedule the quick follow-up
        const targetTime = new Date(now.getTime() + delayMinutes * 60 * 1000);

        const { data: followUp, error } = await db
            .from('ai_followup_schedule')
            .insert({
                conversation_id: conversationId,
                page_id: conv.page_id,
                scheduled_at: targetTime.toISOString(),
                follow_up_type: type,
                reason,
                message_template: message,
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;

        console.log(`[SCHEDULER] Quick follow-up scheduled for ${conversationId} in ${delayMinutes} minutes`);

        return {
            success: true,
            followUp,
            scheduledAt: targetTime,
            delayMinutes
        };

    } catch (error) {
        console.error('[SCHEDULER] Error scheduling quick follow-up:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Schedule follow-up based on customer's mentioned availability
 * @param {string} conversationId - Conversation ID
 * @param {string} messageText - Message containing availability mention
 */
export async function scheduleBasedOnAvailability(conversationId, messageText) {
    const availability = detectAvailabilityMention(messageText);

    if (!availability?.detected) {
        return { success: false, detected: false };
    }

    const result = await scheduleFollowUp(conversationId, {
        scheduledAt: availability.targetTime,
        type: 'customer_availability',
        reason: `Customer mentioned availability: "${availability.rawMatch}"`,
        useBestTime: false
    });

    return {
        ...result,
        detected: true,
        availability
    };
}

export default {
    calculateBestTimeToContact,
    scheduleFollowUp,
    getScheduledFollowUps,
    getPendingFollowUps,
    cancelFollowUp,
    markFollowUpSent,
    markFollowUpFailed,
    recordEngagement,
    getEngagementAnalytics,
    // New exports
    detectAvailabilityMention,
    scheduleQuickFollowUp,
    scheduleBasedOnAvailability
};
