/**
 * AI Label Detector Service
 * Auto-detects conversation labels and enforces behavioral compliance
 */

import { getSupabaseClient } from './supabase';

const getSupabase = () => {
    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not initialized');
    }
    return client;
};

/**
 * Label definitions with display info, behavior rules, and detection keywords
 */
export const LABELS = {
    not_interested: {
        display: 'Not Interested',
        color: '#ef4444',
        icon: '🚫',
        stopsFollowUps: true,
        aiMode: 'none', // no outreach at all
        keywords: [
            'not interested', 'no thanks', 'no thank you', 'pass on this',
            'not for me', 'don\'t want', 'dont want', 'no need',
            'not looking', 'not right now thank you', 'hard pass'
        ]
    },
    already_bought: {
        display: 'Already Bought',
        color: '#8b5cf6',
        icon: '✅',
        stopsFollowUps: true,
        aiMode: 'faq_only',
        keywords: [
            'already bought', 'already purchased', 'already signed up',
            'already subscribed', 'already have it', 'already got it',
            'already a customer', 'already using', 'already enrolled'
        ]
    },
    do_not_message: {
        display: 'Do Not Message',
        color: '#dc2626',
        icon: '⛔',
        stopsFollowUps: true,
        aiMode: 'silent', // no AI response at all
        keywords: [
            'stop messaging', 'don\'t message', 'dont message',
            'leave me alone', 'stop contacting', 'don\'t contact',
            'dont contact', 'block', 'unsubscribe', 'stop sending',
            'remove me', 'opt out', 'stop texting'
        ]
    },
    agent_handling: {
        display: 'Agent Handling',
        color: '#f59e0b',
        icon: '👤',
        stopsFollowUps: true,
        aiMode: 'faq_only',
        keywords: [] // Set programmatically when human takeover is active
    },
    message_later: {
        display: 'Message Later',
        color: '#3b82f6',
        icon: '⏰',
        stopsFollowUps: false,
        aiMode: 'normal',
        keywords: [
            'message me later', 'call back', 'reach out later',
            'contact me next', 'message me next', 'try again later',
            'not now but later', 'maybe next week', 'maybe next month',
            'get back to me', 'follow up later', 'remind me later'
        ]
    },
    interested: {
        display: 'Interested',
        color: '#10b981',
        icon: '🔥',
        stopsFollowUps: false,
        aiMode: 'normal',
        keywords: [
            'interested', 'tell me more', 'how much', 'pricing',
            'sounds good', 'i\'m in', 'sign me up', 'let\'s do it',
            'want to know more', 'send me details', 'more info',
            'what are your packages', 'how does it work'
        ]
    },
    booked: {
        display: 'Booked',
        color: '#06b6d4',
        icon: '📅',
        stopsFollowUps: true,
        aiMode: 'faq_only',
        keywords: [
            'booked', 'meeting scheduled', 'appointment set',
            'see you then', 'confirmed the meeting', 'calendar invite'
        ]
    },
    hot_lead: {
        display: 'Hot Lead',
        color: '#f97316',
        icon: '🔥',
        stopsFollowUps: false,
        aiMode: 'normal',
        keywords: [
            'ready to start', 'when can we begin', 'ready to buy',
            'take my money', 'let\'s get started', 'ready to go',
            'how do i pay', 'where do i sign'
        ]
    },
    cold_lead: {
        display: 'Cold Lead',
        color: '#6b7280',
        icon: '❄️',
        stopsFollowUps: false,
        aiMode: 'normal',
        keywords: [] // Set programmatically based on engagement
    },
    needs_info: {
        display: 'Needs Info',
        color: '#8b5cf6',
        icon: '❓',
        stopsFollowUps: false,
        aiMode: 'normal',
        keywords: [
            'what is', 'how does', 'can you explain', 'i have a question',
            'what are the', 'tell me about', 'do you offer',
            'what\'s included', 'what services'
        ]
    },
    price_sensitive: {
        display: 'Price Sensitive',
        color: '#eab308',
        icon: '💰',
        stopsFollowUps: false,
        aiMode: 'normal',
        keywords: [
            'too expensive', 'too much', 'budget', 'cheaper',
            'discount', 'can\'t afford', 'cost less', 'lower price',
            'out of my range', 'promo', 'deal'
        ]
    },
    competitor_mention: {
        display: 'Competitor Mention',
        color: '#a855f7',
        icon: '🏢',
        stopsFollowUps: false,
        aiMode: 'normal',
        keywords: [] // Should be configured per business
    },
    follow_up_sent: {
        display: 'Follow-up Sent',
        color: '#64748b',
        icon: '📨',
        stopsFollowUps: false,
        aiMode: 'normal',
        keywords: [] // Set by system after sending follow-up
    },
    no_response: {
        display: 'No Response',
        color: '#9ca3af',
        icon: '💤',
        stopsFollowUps: false,
        aiMode: 'normal',
        keywords: [] // Set programmatically based on silence
    },
    converted: {
        display: 'Converted',
        color: '#22c55e',
        icon: '🏆',
        stopsFollowUps: true,
        aiMode: 'faq_only',
        keywords: [
            'deal closed', 'payment received', 'paid', 'completed purchase',
            'transaction complete', 'receipt', 'order confirmed'
        ]
    }
};

/**
 * Priority order for label detection (higher priority labels win)
 */
const DETECTION_PRIORITY = [
    'do_not_message',
    'not_interested',
    'already_bought',
    'converted',
    'booked',
    'hot_lead',
    'interested',
    'message_later',
    'price_sensitive',
    'needs_info'
];

/**
 * Detect a label from the most recent inbound messages
 * @param {Array} messages - Recent messages (newest first or oldest first)
 * @returns {{ label: string|null, confidence: number, matchedKeyword: string|null }}
 */
export function detectLabel(messages) {
    if (!messages || messages.length === 0) {
        return { label: null, confidence: 0, matchedKeyword: null };
    }

    // Focus on the most recent inbound messages (last 5)
    const inboundMessages = messages
        .filter(m => !m.is_from_page)
        .slice(-5);

    if (inboundMessages.length === 0) {
        return { label: null, confidence: 0, matchedKeyword: null };
    }

    // Combine recent inbound text for matching
    const combinedText = inboundMessages
        .map(m => (m.message_text || m.message || '').toLowerCase().trim())
        .join(' ');

    if (!combinedText) {
        return { label: null, confidence: 0, matchedKeyword: null };
    }

    // Check each label in priority order
    for (const labelKey of DETECTION_PRIORITY) {
        const labelDef = LABELS[labelKey];
        if (!labelDef || !labelDef.keywords || labelDef.keywords.length === 0) continue;

        for (const keyword of labelDef.keywords) {
            if (combinedText.includes(keyword.toLowerCase())) {
                return {
                    label: labelKey,
                    confidence: 0.8,
                    matchedKeyword: keyword
                };
            }
        }
    }

    return { label: null, confidence: 0, matchedKeyword: null };
}

/**
 * Apply a label to a conversation
 * @param {string} conversationId - Conversation ID
 * @param {string} label - Label key (e.g., 'not_interested')
 * @param {string} setBy - Who set it ('system', 'admin', user ID)
 * @param {string} reason - Why this label was applied
 * @returns {Promise<{ success: boolean, cancelled?: number }>}
 */
export async function applyLabel(conversationId, label, setBy = 'system', reason = null) {
    try {
        const db = getSupabase();

        // Get current label
        const { data: conv } = await db
            .from('facebook_conversations')
            .select('ai_label')
            .eq('conversation_id', conversationId)
            .single();

        const previousLabel = conv?.ai_label || null;

        // Don't re-apply same label
        if (previousLabel === label) {
            return { success: true, unchanged: true };
        }

        // Don't auto-downgrade critical labels (system can't override manual blocks)
        const criticalLabels = ['do_not_message', 'not_interested', 'already_bought'];
        if (setBy === 'system' && criticalLabels.includes(previousLabel) && !criticalLabels.includes(label)) {
            console.log(`[LABEL] Skipping auto-downgrade from ${previousLabel} to ${label} for ${conversationId}`);
            return { success: true, unchanged: true, reason: 'critical_label_preserved' };
        }

        // Update conversation
        const { error: updateError } = await db
            .from('facebook_conversations')
            .update({
                ai_label: label,
                ai_label_set_at: new Date().toISOString(),
                ai_label_set_by: setBy,
                updated_at: new Date().toISOString()
            })
            .eq('conversation_id', conversationId);

        if (updateError) throw updateError;

        // Log to history
        await db.from('ai_label_history').insert({
            conversation_id: conversationId,
            label,
            previous_label: previousLabel,
            set_by: setBy,
            reason: reason || `Auto-detected label: ${label}`
        });

        // If this label stops follow-ups, cancel all pending ones
        let cancelledCount = 0;
        const labelDef = LABELS[label];
        if (labelDef && labelDef.stopsFollowUps) {
            const { data: pending } = await db
                .from('ai_followup_schedule')
                .select('id')
                .eq('conversation_id', conversationId)
                .eq('status', 'pending');

            if (pending && pending.length > 0) {
                const { error: cancelError } = await db
                    .from('ai_followup_schedule')
                    .update({
                        status: 'cancelled',
                        error_message: `Cancelled: label changed to "${label}"`,
                        updated_at: new Date().toISOString()
                    })
                    .eq('conversation_id', conversationId)
                    .eq('status', 'pending');

                if (!cancelError) {
                    cancelledCount = pending.length;
                }
            }
        }

        console.log(`[LABEL] Applied "${label}" to ${conversationId} (was: ${previousLabel || 'none'}, cancelled: ${cancelledCount} follow-ups)`);

        return { success: true, previousLabel, cancelled: cancelledCount };
    } catch (error) {
        console.error('[LABEL] Error applying label:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get behavioral rules for a label
 * @param {string} label - Label key
 * @returns {{ stopsFollowUps: boolean, aiMode: string, display: string }}
 */
export function getLabelBehavior(label) {
    if (!label || !LABELS[label]) {
        return { stopsFollowUps: false, aiMode: 'normal', display: null };
    }
    const def = LABELS[label];
    return {
        stopsFollowUps: def.stopsFollowUps,
        aiMode: def.aiMode,
        display: def.display,
        color: def.color,
        icon: def.icon
    };
}

/**
 * Check if a conversation's label blocks follow-ups
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<{ blocked: boolean, label: string|null, reason: string|null }>}
 */
export async function shouldBlockFollowUp(conversationId) {
    try {
        const db = getSupabase();
        const { data } = await db
            .from('facebook_conversations')
            .select('ai_label')
            .eq('conversation_id', conversationId)
            .single();

        const label = data?.ai_label;
        if (!label) return { blocked: false, label: null, reason: null };

        const behavior = getLabelBehavior(label);
        if (behavior.stopsFollowUps) {
            return {
                blocked: true,
                label,
                reason: `Label "${behavior.display}" blocks follow-ups`
            };
        }

        return { blocked: false, label, reason: null };
    } catch (error) {
        console.error('[LABEL] Error checking follow-up block:', error);
        return { blocked: false, label: null, reason: null };
    }
}

/**
 * Check if a conversation's label blocks AI responses
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<{ blocked: boolean, faqOnly: boolean, label: string|null }>}
 */
export async function shouldBlockAIResponse(conversationId) {
    try {
        const db = getSupabase();
        const { data } = await db
            .from('facebook_conversations')
            .select('ai_label')
            .eq('conversation_id', conversationId)
            .single();

        const label = data?.ai_label;
        if (!label) return { blocked: false, faqOnly: false, label: null };

        const behavior = getLabelBehavior(label);
        return {
            blocked: behavior.aiMode === 'silent' || behavior.aiMode === 'none',
            faqOnly: behavior.aiMode === 'faq_only',
            label,
            display: behavior.display
        };
    } catch (error) {
        console.error('[LABEL] Error checking AI block:', error);
        return { blocked: false, faqOnly: false, label: null };
    }
}

/**
 * Get label history for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {number} limit - Max records
 * @returns {Promise<Array>}
 */
export async function getLabelHistory(conversationId, limit = 10) {
    try {
        const db = getSupabase();
        const { data, error } = await db
            .from('ai_label_history')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[LABEL] Error getting label history:', error);
        return [];
    }
}

/**
 * Get the system prompt addition for a given label
 * @param {string} label - Label key
 * @returns {string} Prompt text to inject
 */
export function getLabelPromptContext(label) {
    if (!label) return '';

    const prompts = {
        not_interested: `## CRITICAL LABEL: NOT INTERESTED
The customer has indicated they are NOT interested. Do NOT try to sell, pitch, or schedule follow-ups.
If they message you, respond politely but briefly. Do not push any products or services.`,

        already_bought: `## LABEL: ALREADY BOUGHT
The customer has already purchased/signed up. Do NOT try to sell them the same thing.
Only answer their questions (FAQ mode). Be helpful and supportive.`,

        do_not_message: `## CRITICAL LABEL: DO NOT MESSAGE
The customer has requested to stop receiving messages. Do NOT send any outreach.
Only respond if they directly ask a question, and keep it minimal.`,

        agent_handling: `## LABEL: AGENT HANDLING
A human agent is handling this conversation. Only answer direct FAQ questions.
Do NOT schedule follow-ups or attempt to close sales. Defer to the human agent.`,

        message_later: `## LABEL: MESSAGE LATER
The customer asked to be contacted later. Be respectful of their timing.
When following up, acknowledge that they asked to be contacted later.`,

        interested: `## LABEL: INTERESTED
The customer has shown interest! Be enthusiastic but not pushy.
Guide them toward booking a meeting or next steps.`,

        booked: `## LABEL: BOOKED
The customer has a meeting/appointment booked. Do NOT try to book another one.
Answer any questions they have about the upcoming meeting. Be supportive.`,

        hot_lead: `## LABEL: HOT LEAD
This is a hot lead showing strong buying signals. Prioritize this conversation.
Be responsive, helpful, and guide them toward conversion quickly.`,

        cold_lead: `## LABEL: COLD LEAD
This lead has low engagement. Keep messages short and high-value.
Don't overwhelm them with long messages.`,

        needs_info: `## LABEL: NEEDS INFO
The customer needs information. Focus on answering their questions clearly and thoroughly.
Use the knowledge base to provide accurate answers.`,

        price_sensitive: `## LABEL: PRICE SENSITIVE
The customer is concerned about pricing. Emphasize value and ROI.
Mention any discounts, payment plans, or lower-tier options if available.`,

        converted: `## LABEL: CONVERTED
The customer has converted/paid. Focus on onboarding and support.
Do NOT try to sell them anything else unless they ask.`
    };

    return prompts[label] || '';
}

export default {
    LABELS,
    detectLabel,
    applyLabel,
    getLabelBehavior,
    shouldBlockFollowUp,
    shouldBlockAIResponse,
    getLabelHistory,
    getLabelPromptContext
};
