/**
 * Safety Layer Service
 * Human takeover and safety controls for AI chatbot
 * Module 7 of the Enterprise AI Chatbot System
 */

import { getSupabaseClient } from './supabase';
import { getLabelBehavior } from './labelDetector';

const getSupabase = () => {
    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not initialized');
    }
    return client;
};

/**
 * Safety status for a conversation
 * @typedef {Object} SafetyStatus
 * @property {boolean} canAIRespond - Whether AI is allowed to respond
 * @property {string} blockReason - Why AI cannot respond (if blocked)
 * @property {boolean} humanTakeover - Human has taken over
 * @property {boolean} optedOut - Contact has opted out
 * @property {boolean} inCooldown - In cooldown period
 * @property {number} confidence - Current AI confidence level
 */

/**
 * Check complete safety status for a conversation
 * @param {string} conversationId - Conversation ID to check
 * @returns {Promise<SafetyStatus>}
 */
export async function checkSafetyStatus(conversationId) {
    try {
        const db = getSupabase();

        // Get conversation with AI fields
        const { data: conversation, error } = await db
            .from('facebook_conversations')
            .select('ai_enabled, human_takeover, takeover_until, opt_out, cooldown_until, ai_confidence, ai_label')
            .eq('conversation_id', conversationId)
            .single();

        if (error || !conversation) {
            return {
                canAIRespond: false,
                blockReason: 'conversation_not_found',
                humanTakeover: false,
                optedOut: false,
                inCooldown: false,
                confidence: 0
            };
        }

        const now = new Date();
        const takeoverUntil = conversation.takeover_until ? new Date(conversation.takeover_until) : null;
        const cooldownUntil = conversation.cooldown_until ? new Date(conversation.cooldown_until) : null;

        // Check if takeover has expired
        const isInTakeover = conversation.human_takeover && (!takeoverUntil || takeoverUntil > now);

        // Check if in cooldown
        const isInCooldown = cooldownUntil && cooldownUntil > now;

        // Get AI config for confidence threshold
        const { data: settings } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        const config = settings?.value || { min_confidence_threshold: 0.6 };
        const isBelowConfidence = (conversation.ai_confidence || 1.0) < config.min_confidence_threshold;

        // Check label behavior
        const labelBehavior = getLabelBehavior(conversation.ai_label);
        const labelBlocksAI = labelBehavior.aiMode === 'silent' || labelBehavior.aiMode === 'none';
        const labelFaqOnly = labelBehavior.aiMode === 'faq_only';

        // Determine if AI can respond
        let canAIRespond = true;
        let blockReason = null;

        if (!conversation.ai_enabled) {
            canAIRespond = false;
            blockReason = 'ai_disabled';
        } else if (conversation.opt_out) {
            canAIRespond = false;
            blockReason = 'opted_out';
        } else if (labelBlocksAI) {
            canAIRespond = false;
            blockReason = `label_${conversation.ai_label}`;
        } else if (isInTakeover) {
            canAIRespond = false;
            blockReason = 'human_takeover';
        } else if (isInCooldown) {
            canAIRespond = false;
            blockReason = 'cooldown';
        } else if (isBelowConfidence && config.auto_takeover_on_low_confidence) {
            canAIRespond = false;
            blockReason = 'low_confidence';
        }

        return {
            canAIRespond,
            blockReason,
            humanTakeover: isInTakeover,
            optedOut: conversation.opt_out || false,
            inCooldown: isInCooldown,
            confidence: conversation.ai_confidence || 1.0,
            cooldownEndsAt: cooldownUntil,
            takeoverEndsAt: takeoverUntil,
            aiLabel: conversation.ai_label || null,
            labelFaqOnly
        };
    } catch (error) {
        console.error('[SAFETY] Error checking safety status:', error);
        return {
            canAIRespond: false,
            blockReason: 'error',
            humanTakeover: false,
            optedOut: false,
            inCooldown: false,
            confidence: 0
        };
    }
}

/**
 * Activate human takeover for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {string} reason - Reason for takeover
 * @param {Object} options - Additional options
 * @param {string} options.triggeredBy - Who triggered ('system', 'user', 'admin', 'contact')
 * @param {string} options.userId - User ID if triggered by user/admin
 * @param {number} options.durationHours - How long takeover lasts (default: 24)
 * @param {string} options.messageContext - Recent messages for context
 */
export async function activateHumanTakeover(conversationId, reason, options = {}) {
    try {
        const db = getSupabase();
        const {
            triggeredBy = 'system',
            userId = null,
            durationHours = 24,
            messageContext = null,
            confidence = null
        } = options;

        const takeoverUntil = new Date();
        takeoverUntil.setHours(takeoverUntil.getHours() + durationHours);

        // Update conversation
        const { error: updateError } = await db
            .from('facebook_conversations')
            .update({
                human_takeover: true,
                takeover_until: takeoverUntil.toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('conversation_id', conversationId);

        if (updateError) throw updateError;

        // Log the takeover event
        const { error: logError } = await db
            .from('ai_takeover_log')
            .insert({
                conversation_id: conversationId,
                reason,
                reason_detail: options.reasonDetail || null,
                triggered_by: triggeredBy,
                triggered_by_user_id: userId,
                ai_confidence: confidence,
                message_context: messageContext,
                takeover_duration_hours: durationHours
            });

        if (logError) {
            console.error('[SAFETY] Error logging takeover:', logError);
        }

        // Also log as action
        await logSafetyEvent({
            conversationId,
            actionType: 'takeover_activated',
            data: { reason, triggeredBy, durationHours },
            explanation: `Human takeover activated: ${reason}. AI will not respond for ${durationHours} hours.`
        });

        console.log(`[SAFETY] Human takeover activated for ${conversationId}: ${reason}`);
        return { success: true, takeoverUntil };
    } catch (error) {
        console.error('[SAFETY] Error activating takeover:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Deactivate human takeover and resume AI
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID who deactivated
 */
export async function deactivateTakeover(conversationId, userId = null) {
    try {
        const db = getSupabase();

        // Update conversation
        const { error: updateError } = await db
            .from('facebook_conversations')
            .update({
                human_takeover: false,
                takeover_until: null,
                ai_confidence: 1.0, // Reset confidence
                updated_at: new Date().toISOString()
            })
            .eq('conversation_id', conversationId);

        if (updateError) throw updateError;

        // Mark the takeover log as resolved
        const { error: logError } = await db
            .from('ai_takeover_log')
            .update({
                resolved_at: new Date().toISOString(),
                resolved_by: userId
            })
            .eq('conversation_id', conversationId)
            .is('resolved_at', null);

        if (logError) {
            console.error('[SAFETY] Error resolving takeover log:', logError);
        }

        // Log action
        await logSafetyEvent({
            conversationId,
            actionType: 'takeover_deactivated',
            data: { userId },
            explanation: 'Human takeover deactivated. AI can now respond.'
        });

        console.log(`[SAFETY] Takeover deactivated for ${conversationId}`);
        return { success: true };
    } catch (error) {
        console.error('[SAFETY] Error deactivating takeover:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Detect opt-out phrases in a message
 * @param {string} message - Message text to check
 * @returns {Promise<{isOptOut: boolean, matchedPhrase: string|null}>}
 */
export async function detectOptOut(message) {
    if (!message || typeof message !== 'string') {
        return { isOptOut: false, matchedPhrase: null };
    }

    try {
        const db = getSupabase();

        // Get active opt-out phrases
        const { data: phrases, error } = await db
            .from('opt_out_phrases')
            .select('phrase, is_regex')
            .eq('is_active', true);

        if (error || !phrases) {
            console.error('[SAFETY] Error fetching opt-out phrases:', error);
            // Fall back to hardcoded defaults
            return checkDefaultOptOut(message);
        }

        const messageLower = message.toLowerCase().trim();

        for (const { phrase, is_regex } of phrases) {
            if (is_regex) {
                try {
                    const regex = new RegExp(phrase, 'i');
                    if (regex.test(message)) {
                        return { isOptOut: true, matchedPhrase: phrase };
                    }
                } catch (e) {
                    console.warn('[SAFETY] Invalid regex:', phrase);
                }
            } else {
                if (messageLower.includes(phrase.toLowerCase())) {
                    return { isOptOut: true, matchedPhrase: phrase };
                }
            }
        }

        return { isOptOut: false, matchedPhrase: null };
    } catch (error) {
        console.error('[SAFETY] Error detecting opt-out:', error);
        return checkDefaultOptOut(message);
    }
}

/**
 * Fallback opt-out detection with hardcoded phrases
 */
function checkDefaultOptOut(message) {
    const defaults = [
        'stop messaging', 'stop texting', 'unsubscribe',
        'stop sending', 'leave me alone', 'do not contact',
        'remove me', 'opt out'
    ];

    const messageLower = message.toLowerCase();
    for (const phrase of defaults) {
        if (messageLower.includes(phrase)) {
            return { isOptOut: true, matchedPhrase: phrase };
        }
    }

    // Check for exact "STOP"
    if (message.trim() === 'STOP' || message.trim().toLowerCase() === 'stop') {
        return { isOptOut: true, matchedPhrase: 'stop' };
    }

    return { isOptOut: false, matchedPhrase: null };
}

/**
 * Mark a contact as opted out
 * @param {string} conversationId - Conversation ID
 * @param {string} matchedPhrase - The phrase that triggered opt-out
 */
export async function markOptedOut(conversationId, matchedPhrase) {
    try {
        const db = getSupabase();

        const { error } = await db
            .from('facebook_conversations')
            .update({
                opt_out: true,
                opt_out_at: new Date().toISOString(),
                ai_enabled: false,
                updated_at: new Date().toISOString()
            })
            .eq('conversation_id', conversationId);

        if (error) throw error;

        // Log takeover
        await db.from('ai_takeover_log').insert({
            conversation_id: conversationId,
            reason: 'opt_out',
            reason_detail: `Matched phrase: "${matchedPhrase}"`,
            triggered_by: 'contact'
        });

        // Log action
        await logSafetyEvent({
            conversationId,
            actionType: 'opt_out_detected',
            data: { matchedPhrase },
            explanation: `Contact opted out. Matched phrase: "${matchedPhrase}". AI messaging stopped.`
        });

        console.log(`[SAFETY] Contact opted out: ${conversationId}`);
        return { success: true };
    } catch (error) {
        console.error('[SAFETY] Error marking opted out:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Evaluate AI confidence for a response
 * @param {string} response - AI generated response
 * @param {Object} context - Context used for generation
 * @returns {number} Confidence score 0-1
 */
export function evaluateConfidence(response, context = {}) {
    if (!response) return 0;

    let confidence = 1.0;
    const responseLower = response.toLowerCase();

    // Reduce confidence for uncertainty phrases
    const uncertaintyPhrases = [
        "i'm not sure", "i don't know", "i'm unsure",
        "i cannot help", "i can't help", "unable to",
        "please contact", "reach out to", "speak to someone",
        "i apologize", "sorry, i", "unfortunately"
    ];

    for (const phrase of uncertaintyPhrases) {
        if (responseLower.includes(phrase)) {
            confidence -= 0.15;
        }
    }

    // Reduce confidence if no RAG context was available
    if (context.noRagContext) {
        confidence -= 0.2;
    }

    // Reduce confidence for very short or very long responses
    const wordCount = response.split(/\s+/).length;
    if (wordCount < 5) {
        confidence -= 0.3;
    } else if (wordCount > 500) {
        confidence -= 0.1;
    }

    // Reduce confidence if response seems generic
    const genericPhrases = [
        "how can i help you today",
        "is there anything else",
        "thank you for reaching out"
    ];

    for (const phrase of genericPhrases) {
        if (responseLower.includes(phrase)) {
            confidence -= 0.1;
        }
    }

    // Clamp to 0-1
    return Math.max(0, Math.min(1, confidence));
}

/**
 * Update AI confidence for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {number} confidence - New confidence score
 */
export async function updateConfidence(conversationId, confidence) {
    try {
        const db = getSupabase();

        const { error } = await db
            .from('facebook_conversations')
            .update({
                ai_confidence: confidence,
                updated_at: new Date().toISOString()
            })
            .eq('conversation_id', conversationId);

        if (error) throw error;

        // Check if should auto-takeover
        const { data: settings } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        const config = settings?.value || {};

        if (config.auto_takeover_on_low_confidence &&
            confidence < (config.min_confidence_threshold || 0.6)) {
            await activateHumanTakeover(conversationId, 'low_confidence', {
                triggeredBy: 'system',
                confidence,
                reasonDetail: `AI confidence dropped to ${(confidence * 100).toFixed(0)}%`
            });

            await logSafetyEvent({
                conversationId,
                actionType: 'confidence_low',
                data: { confidence },
                explanation: `AI confidence is ${(confidence * 100).toFixed(0)}%, below threshold. Human takeover activated.`
            });
        }

        return { success: true };
    } catch (error) {
        console.error('[SAFETY] Error updating confidence:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Set cooldown for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {number} hours - Hours until AI can message again
 */
export async function setCooldown(conversationId, hours = 4) {
    try {
        const db = getSupabase();

        const cooldownUntil = new Date();
        cooldownUntil.setHours(cooldownUntil.getHours() + hours);

        const { error } = await db
            .from('facebook_conversations')
            .update({
                cooldown_until: cooldownUntil.toISOString(),
                last_ai_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('conversation_id', conversationId);

        if (error) throw error;

        return { success: true, cooldownUntil };
    } catch (error) {
        console.error('[SAFETY] Error setting cooldown:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Log a safety-related event to the action log
 * @param {Object} event - Event details
 */
export async function logSafetyEvent(event) {
    try {
        const db = getSupabase();

        const { error } = await db
            .from('ai_action_log')
            .insert({
                conversation_id: event.conversationId,
                page_id: event.pageId || null,
                action_type: event.actionType,
                action_data: event.data || {},
                explanation: event.explanation || null,
                confidence_score: event.confidence || null,
                goal_id: event.goalId || null,
                flow_id: event.flowId || null
            });

        if (error) {
            console.error('[SAFETY] Error logging event:', error);
        }
    } catch (error) {
        console.error('[SAFETY] Exception logging event:', error);
    }
}

/**
 * Get takeover history for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {number} limit - Max records to return
 */
export async function getTakeoverHistory(conversationId, limit = 10) {
    try {
        const db = getSupabase();

        const { data, error } = await db
            .from('ai_takeover_log')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[SAFETY] Error getting takeover history:', error);
        return [];
    }
}

/**
 * Toggle AI enabled/disabled for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {boolean} enabled - Whether AI should be enabled
 */
export async function toggleAI(conversationId, enabled) {
    try {
        const db = getSupabase();

        const { error } = await db
            .from('facebook_conversations')
            .update({
                ai_enabled: enabled,
                updated_at: new Date().toISOString()
            })
            .eq('conversation_id', conversationId);

        if (error) throw error;

        await logSafetyEvent({
            conversationId,
            actionType: enabled ? 'takeover_deactivated' : 'takeover_activated',
            data: { ai_enabled: enabled },
            explanation: enabled ? 'AI enabled for this conversation' : 'AI disabled for this conversation'
        });

        return { success: true };
    } catch (error) {
        console.error('[SAFETY] Error toggling AI:', error);
        return { success: false, error: error.message };
    }
}

export default {
    checkSafetyStatus,
    activateHumanTakeover,
    deactivateTakeover,
    detectOptOut,
    markOptedOut,
    evaluateConfidence,
    updateConfidence,
    setCooldown,
    logSafetyEvent,
    getTakeoverHistory,
    toggleAI
};
