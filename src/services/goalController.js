/**
 * Goal Controller Service
 * Manages conversation goals and dynamic prompt shaping
 * Module 3 of the Enterprise AI Chatbot System
 */

import { getSupabaseClient } from './supabase';
import { logSafetyEvent } from './safetyLayer';

const getSupabase = () => {
    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not initialized');
    }
    return client;
};

/**
 * Goal types and their default behaviors
 */
export const GOAL_TYPES = {
    book_call: {
        name: 'Book a Call',
        icon: '📅',
        description: 'Schedule a call or meeting with the lead',
        successIndicators: ['meeting confirmed', 'call scheduled', 'booking confirmed', 'see you', 'confirmed for']
    },
    close_sale: {
        name: 'Close Sale',
        icon: '💰',
        description: 'Close a sale with this lead',
        successIndicators: ['payment received', 'order placed', 'deal closed', 'purchase complete', 'invoice sent']
    },
    re_engage: {
        name: 'Re-engage Lead',
        icon: '🔄',
        description: 'Re-engage a cold or inactive lead',
        successIndicators: ['responded', 'showed interest', 'asked question', 'wants to know more']
    },
    qualify_lead: {
        name: 'Qualify Lead',
        icon: '🎯',
        description: 'Qualify the lead by understanding their needs',
        successIndicators: ['budget confirmed', 'timeline known', 'decision maker', 'ready to proceed']
    },
    provide_info: {
        name: 'Provide Information',
        icon: 'ℹ️',
        description: 'Answer questions and provide helpful information',
        successIndicators: ['question answered', 'information provided', 'understood', 'makes sense']
    },
    custom: {
        name: 'Custom Goal',
        icon: '⚙️',
        description: 'User-defined custom goal',
        successIndicators: []
    }
};

/**
 * Set a conversation goal
 * @param {string} conversationId - Conversation ID
 * @param {string} goalType - Type of goal (from GOAL_TYPES)
 * @param {Object} options - Additional options
 * @param {string} options.customPrompt - Custom prompt override
 * @param {Object} options.context - Goal-specific context
 * @param {string} options.userId - User who set the goal
 */
export async function setConversationGoal(conversationId, goalType, options = {}) {
    try {
        const db = getSupabase();
        const { customPrompt = null, context = {}, userId = null, priority = 1 } = options;

        // Deactivate any existing active goals
        await db
            .from('conversation_goals')
            .update({ status: 'abandoned', updated_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('status', 'active');

        // Get template prompt if not custom
        let goalPrompt = customPrompt;
        if (!goalPrompt && goalType !== 'custom') {
            const { data: template } = await db
                .from('goal_templates')
                .select('default_prompt')
                .eq('goal_type', goalType)
                .single();

            goalPrompt = template?.default_prompt || null;
        }

        // Create new goal
        const { data: newGoal, error } = await db
            .from('conversation_goals')
            .insert({
                conversation_id: conversationId,
                goal_type: goalType,
                goal_prompt: goalPrompt,
                goal_context: context,
                priority,
                status: 'active',
                progress_score: 0,
                created_by: userId
            })
            .select()
            .single();

        if (error) throw error;

        // Update conversation with active goal
        await db
            .from('facebook_conversations')
            .update({
                active_goal_id: newGoal.id,
                updated_at: new Date().toISOString()
            })
            .eq('conversation_id', conversationId);

        // Log action
        await logSafetyEvent({
            conversationId,
            actionType: 'goal_set',
            data: { goalType, goalId: newGoal.id },
            explanation: `Goal set: ${GOAL_TYPES[goalType]?.name || goalType}`,
            goalId: newGoal.id
        });

        console.log(`[GOAL] Set goal "${goalType}" for ${conversationId}`);
        return { success: true, goal: newGoal };
    } catch (error) {
        console.error('[GOAL] Error setting goal:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get the active goal for a conversation
 * @param {string} conversationId - Conversation ID
 */
export async function getActiveGoal(conversationId) {
    try {
        const db = getSupabase();

        const { data, error } = await db
            .from('conversation_goals')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('status', 'active')
            .order('priority', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // Ignore "no rows" error
            throw error;
        }

        return data || null;
    } catch (error) {
        console.error('[GOAL] Error getting active goal:', error);
        return null;
    }
}

/**
 * Get all goals for a conversation (including history)
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Query options
 */
export async function getGoalHistory(conversationId, options = {}) {
    try {
        const db = getSupabase();
        const { limit = 10, includeActive = true } = options;

        let query = db
            .from('conversation_goals')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (!includeActive) {
            query = query.neq('status', 'active');
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[GOAL] Error getting goal history:', error);
        return [];
    }
}

/**
 * Shape the AI prompt based on the active goal
 * @param {string} basePrompt - Base system prompt
 * @param {Object} goal - Active goal object
 * @param {Object} context - Additional context
 */
export function shapePromptForGoal(basePrompt, goal, context = {}) {
    if (!goal) {
        return basePrompt;
    }

    const goalInfo = GOAL_TYPES[goal.goal_type];
    let shapedPrompt = basePrompt || '';

    // Add goal directive
    shapedPrompt += `\n\n## Current Conversation Goal: ${goalInfo?.name || goal.goal_type}
${goal.goal_prompt || goalInfo?.description || ''}

Keep this goal in mind throughout the conversation. Guide the conversation toward achieving this objective while remaining natural and helpful.`;

    // Add goal-specific context
    if (goal.goal_context && Object.keys(goal.goal_context).length > 0) {
        shapedPrompt += `\n\n### Goal Context:`;
        for (const [key, value] of Object.entries(goal.goal_context)) {
            shapedPrompt += `\n- ${key}: ${value}`;
        }
    }

    // Add progress if available
    if (goal.progress_score > 0) {
        shapedPrompt += `\n\nCurrent progress toward goal: ${goal.progress_score}%`;
    }

    // Add success indicators
    if (goalInfo?.successIndicators?.length > 0) {
        shapedPrompt += `\n\nSuccess indicators to watch for: ${goalInfo.successIndicators.join(', ')}`;
    }

    return shapedPrompt;
}

/**
 * Evaluate goal progress based on conversation
 * @param {Array} messages - Recent messages
 * @param {Object} goal - Active goal
 * @returns {Object} Progress evaluation
 */
export function evaluateGoalProgress(messages, goal) {
    if (!goal || !messages || messages.length === 0) {
        return { progress: 0, completed: false, indicators: [] };
    }

    const goalInfo = GOAL_TYPES[goal.goal_type];
    const successIndicators = goalInfo?.successIndicators || [];

    // Combine all message text
    const conversationText = messages
        .map(m => m.message_text || '')
        .join(' ')
        .toLowerCase();

    // Check for success indicators
    const foundIndicators = [];
    let indicatorScore = 0;

    for (const indicator of successIndicators) {
        if (conversationText.includes(indicator.toLowerCase())) {
            foundIndicators.push(indicator);
            indicatorScore += 1;
        }
    }

    // Calculate progress
    const indicatorProgress = successIndicators.length > 0
        ? (indicatorScore / successIndicators.length) * 100
        : 0;

    // Check message count progress (more messages = more engagement)
    const messageProgress = Math.min(messages.length * 5, 30); // Max 30% from message count

    // Check for positive sentiment indicators
    const positiveWords = ['yes', 'sure', 'okay', 'sounds good', 'interested', 'tell me more', 'great'];
    let sentimentScore = 0;
    for (const word of positiveWords) {
        if (conversationText.includes(word)) {
            sentimentScore += 5;
        }
    }
    sentimentScore = Math.min(sentimentScore, 20); // Max 20% from sentiment

    const totalProgress = Math.min(indicatorProgress + messageProgress + sentimentScore, 100);
    const isCompleted = indicatorProgress >= 50 || foundIndicators.length >= 2;

    return {
        progress: Math.round(totalProgress),
        completed: isCompleted,
        indicators: foundIndicators,
        breakdown: {
            indicatorProgress: Math.round(indicatorProgress),
            messageProgress,
            sentimentScore
        }
    };
}

/**
 * Update goal progress in database
 * When goal is completed: stops proactive follow-ups but AI continues to respond to FAQs
 * @param {string} goalId - Goal ID
 * @param {number} progress - New progress score
 * @param {boolean} completed - Whether goal is completed
 */
export async function updateGoalProgress(goalId, progress, completed = false) {
    try {
        const db = getSupabase();

        const updates = {
            progress_score: progress,
            updated_at: new Date().toISOString()
        };

        if (completed) {
            updates.status = 'completed';
            updates.completed_at = new Date().toISOString();
        }

        const { error } = await db
            .from('conversation_goals')
            .update(updates)
            .eq('id', goalId);

        if (error) throw error;

        if (completed) {
            // Get goal for logging
            const { data: goal } = await db
                .from('conversation_goals')
                .select('conversation_id, goal_type')
                .eq('id', goalId)
                .single();

            if (goal) {
                await logSafetyEvent({
                    conversationId: goal.conversation_id,
                    actionType: 'goal_completed',
                    data: { goalId, goalType: goal.goal_type, progress },
                    explanation: `Goal completed: ${GOAL_TYPES[goal.goal_type]?.name || goal.goal_type}. Follow-ups stopped, AI still responds to FAQs.`,
                    goalId
                });

                // Clear active goal from conversation but KEEP AI enabled
                // AI remains on to answer FAQs, just no more proactive outreach
                await db
                    .from('facebook_conversations')
                    .update({
                        active_goal_id: null,
                        // ai_enabled stays true - bot continues to respond
                        updated_at: new Date().toISOString()
                    })
                    .eq('conversation_id', goal.conversation_id);

                // Cancel all pending follow-ups for this conversation
                // Goal achieved = no need for proactive outreach
                await db
                    .from('ai_followup_schedule')
                    .update({
                        status: 'cancelled',
                        error_message: 'Goal completed - follow-ups no longer needed',
                        updated_at: new Date().toISOString()
                    })
                    .eq('conversation_id', goal.conversation_id)
                    .eq('status', 'pending');

                console.log(`[GOAL] Goal completed for ${goal.conversation_id}. Follow-ups cancelled, AI remains active for FAQs.`);
            }
        }

        return { success: true, completed };
    } catch (error) {
        console.error('[GOAL] Error updating progress:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Abandon a goal
 * @param {string} goalId - Goal ID
 * @param {string} reason - Reason for abandonment
 */
export async function abandonGoal(goalId, reason = null) {
    try {
        const db = getSupabase();

        const { data: goal, error: fetchError } = await db
            .from('conversation_goals')
            .select('conversation_id, goal_type')
            .eq('id', goalId)
            .single();

        if (fetchError) throw fetchError;

        const { error } = await db
            .from('conversation_goals')
            .update({
                status: 'abandoned',
                updated_at: new Date().toISOString()
            })
            .eq('id', goalId);

        if (error) throw error;

        // Clear from conversation
        await db
            .from('facebook_conversations')
            .update({
                active_goal_id: null,
                updated_at: new Date().toISOString()
            })
            .eq('conversation_id', goal.conversation_id);

        await logSafetyEvent({
            conversationId: goal.conversation_id,
            actionType: 'goal_abandoned',
            data: { goalId, goalType: goal.goal_type, reason },
            explanation: reason ? `Goal abandoned: ${reason}` : 'Goal abandoned',
            goalId
        });

        return { success: true };
    } catch (error) {
        console.error('[GOAL] Error abandoning goal:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Suggest next goal based on conversation analysis
 * @param {Array} messages - Recent messages
 * @param {Object} conversation - Conversation object
 */
export function suggestNextGoal(messages, conversation) {
    if (!messages || messages.length === 0) {
        return { goalType: 'qualify_lead', reason: 'New conversation - start by qualifying the lead' };
    }

    const recentText = messages
        .slice(-10)
        .map(m => m.message_text || '')
        .join(' ')
        .toLowerCase();

    // Check for booking intent
    if (recentText.includes('meeting') || recentText.includes('call') ||
        recentText.includes('schedule') || recentText.includes('available')) {
        return { goalType: 'book_call', reason: 'Lead mentioned scheduling or meetings' };
    }

    // Check for purchase intent
    if (recentText.includes('price') || recentText.includes('cost') ||
        recentText.includes('buy') || recentText.includes('purchase') ||
        recentText.includes('package') || recentText.includes('plan')) {
        return { goalType: 'close_sale', reason: 'Lead asking about pricing or purchasing' };
    }

    // Check for information seeking
    if (recentText.includes('how') || recentText.includes('what') ||
        recentText.includes('tell me') || recentText.includes('explain')) {
        return { goalType: 'provide_info', reason: 'Lead seeking information' };
    }

    // Check for cold lead signals
    const lastMessageTime = new Date(messages[messages.length - 1]?.timestamp || 0);
    const hoursSinceLastMessage = (Date.now() - lastMessageTime.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastMessage > 48) {
        return { goalType: 're_engage', reason: 'Lead has been inactive for over 48 hours' };
    }

    // Default to qualification
    return { goalType: 'qualify_lead', reason: 'Continue qualifying the lead' };
}

/**
 * Get available goal templates
 */
export async function getGoalTemplates() {
    try {
        const db = getSupabase();

        const { data, error } = await db
            .from('goal_templates')
            .select('*')
            .order('is_system', { ascending: false })
            .order('name', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[GOAL] Error getting templates:', error);
        return [];
    }
}

export default {
    GOAL_TYPES,
    setConversationGoal,
    getActiveGoal,
    getGoalHistory,
    shapePromptForGoal,
    evaluateGoalProgress,
    updateGoalProgress,
    abandonGoal,
    suggestNextGoal,
    getGoalTemplates
};
