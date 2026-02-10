/**
 * Conversation Engine Service
 * Core AI conversation generation with intelligent message splitting
 * Module 1 of the Enterprise AI Chatbot System
 */

import { getSupabaseClient } from './supabase';
import { nvidiaChat } from './aiService';
import { shapePromptForGoal, getActiveGoal, evaluateGoalProgress, updateGoalProgress } from './goalController';
import { checkSafetyStatus, evaluateConfidence, updateConfidence, setCooldown, logSafetyEvent } from './safetyLayer';

const getSupabase = () => {
    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not initialized');
    }
    return client;
};

/**
 * Message split strategies
 */
const SPLIT_STRATEGIES = {
    length: 'length',           // Split by character count
    sentences: 'sentences',     // Split by sentence boundaries
    paragraphs: 'paragraphs',   // Split by paragraph
    pacing: 'pacing',           // Split for emotional pacing
    points: 'points'            // Split by bullet points/numbered items
};

/**
 * Generate a context-aware response for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generated response(s)
 */
export async function generateResponse(conversationId, options = {}) {
    try {
        const db = getSupabase();
        const {
            ragContext = null,
            customPrompt = null,
            maxTokens = 1024,
            temperature = 0.7
        } = options;

        // Check safety status first
        const safetyStatus = await checkSafetyStatus(conversationId);
        if (!safetyStatus.canAIRespond) {
            console.log(`[ENGINE] AI blocked for ${conversationId}: ${safetyStatus.blockReason}`);
            return {
                success: false,
                blocked: true,
                reason: safetyStatus.blockReason,
                messages: []
            };
        }

        // Get conversation and messages
        const { data: conversation, error: convError } = await db
            .from('facebook_conversations')
            .select('*, page:page_id(page_name)')
            .eq('conversation_id', conversationId)
            .single();

        if (convError || !conversation) {
            throw new Error('Conversation not found');
        }

        // Get recent messages for context
        const { data: messages } = await db
            .from('facebook_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: false })
            .limit(20);

        const recentMessages = (messages || []).reverse();

        // Get active goal
        const activeGoal = await getActiveGoal(conversationId);

        // Build the system prompt
        let systemPrompt = await buildSystemPrompt(conversation, activeGoal, ragContext);

        // Apply goal shaping
        if (activeGoal) {
            systemPrompt = shapePromptForGoal(systemPrompt, activeGoal);
        }

        // Apply custom prompt if provided
        if (customPrompt) {
            systemPrompt += `\n\n## Additional Instructions:\n${customPrompt}`;
        }

        // Format messages for AI
        const aiMessages = formatMessagesForAI(recentMessages, systemPrompt, conversation);

        // Generate response
        const response = await nvidiaChat(aiMessages, {
            temperature,
            maxTokens
        });

        if (!response) {
            throw new Error('AI failed to generate response');
        }

        // Evaluate confidence
        const confidence = evaluateConfidence(response, {
            noRagContext: !ragContext,
            hasGoal: !!activeGoal
        });

        // Update confidence in database
        await updateConfidence(conversationId, confidence);

        // Evaluate goal progress if active
        if (activeGoal) {
            const progress = evaluateGoalProgress(recentMessages, activeGoal);
            await updateGoalProgress(activeGoal.id, progress.progress, progress.completed);
        }

        // Decide if message should be split
        const splitDecision = decideMessageSplit(response, {
            conversationLength: recentMessages.length,
            hasUrgency: detectUrgency(recentMessages),
            platformNorms: 'messenger'
        });

        // Split if needed
        let finalMessages;
        if (splitDecision.shouldSplit) {
            finalMessages = splitMessage(response, splitDecision.strategy, splitDecision.options);
        } else {
            finalMessages = [response];
        }

        // Log the generation
        await logSafetyEvent({
            conversationId,
            actionType: 'message_generated',
            data: {
                messageCount: finalMessages.length,
                wasSplit: splitDecision.shouldSplit,
                splitStrategy: splitDecision.strategy,
                confidence
            },
            explanation: `Generated ${finalMessages.length} message(s) with ${(confidence * 100).toFixed(0)}% confidence`,
            confidence,
            goalId: activeGoal?.id
        });

        return {
            success: true,
            messages: finalMessages,
            confidence,
            wasSplit: splitDecision.shouldSplit,
            splitStrategy: splitDecision.strategy,
            goalProgress: activeGoal ? (await evaluateGoalProgress(recentMessages, activeGoal)) : null
        };

    } catch (error) {
        console.error('[ENGINE] Error generating response:', error);
        return {
            success: false,
            error: error.message,
            messages: []
        };
    }
}

/**
 * Get admin config from database or localStorage
 */
async function getAdminConfig() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const localConfig = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
            if (Object.keys(localConfig).length > 0) {
                return localConfig;
            }
        }

        const db = getSupabase();
        const { data, error } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        if (!error && data?.value) {
            return data.value;
        }
    } catch (e) {
        console.warn('[ENGINE] Could not read admin config:', e);
    }
    return {};
}

/**
 * Build the system prompt for the AI
 */
async function buildSystemPrompt(conversation, activeGoal, ragContext) {
    const adminConfig = await getAdminConfig();

    // Use admin-configured system prompt or default
    const defaultPrompt = `You are a friendly and professional AI sales assistant. 
Be helpful, concise, and guide customers toward booking a consultation.
Use a conversational tone appropriate for Messenger chat.
Be enthusiastic but not pushy.`;

    let prompt = adminConfig.system_prompt || defaultPrompt;

    // Add context header
    prompt = `## Role and Personality:
${prompt}

## Context:
- Platform: Facebook Messenger
- Page: ${conversation.page?.page_name || 'Business Page'}
- Contact Name: ${conversation.participant_name || 'Unknown'}

## Booking Priority:
If the customer is not yet booked or converted, always suggest booking a meeting.

`;

    // Add admin-configured knowledge base
    if (adminConfig.knowledge_base) {
        prompt += `
## Knowledge Base (use this to answer questions):
${adminConfig.knowledge_base}
`;
    }

    // Add RAG context if available
    if (ragContext && ragContext.length > 0) {
        prompt += `
## Additional Context:
${ragContext}
`;
    }

    // Add extracted customer details if available
    if (conversation.extracted_details && Object.keys(conversation.extracted_details).length > 0) {
        prompt += `\n## Known Customer Details:`;
        const details = conversation.extracted_details;
        if (details.businessName) prompt += `\n- Business: ${details.businessName}`;
        if (details.niche) prompt += `\n- Industry: ${details.niche}`;
        if (details.phone) prompt += `\n- Phone: ${details.phone}`;
        if (details.email) prompt += `\n- Email: ${details.email}`;
        if (details.budget) prompt += `\n- Budget: ${details.budget}`;
        if (details.timeline) prompt += `\n- Timeline: ${details.timeline}`;
        prompt += '\n';
    }

    // Add conversation summary if available
    if (conversation.summary) {
        prompt += `
## Conversation Summary:
${conversation.summary}
`;
    }

    // Add active goal info
    if (activeGoal) {
        prompt += `
## Current Goal: ${activeGoal.goal_type}
${activeGoal.description || ''}
Progress: ${Math.round((activeGoal.progress || 0) * 100)}%
`;
    }

    // Add bot rules (do's)
    if (adminConfig.bot_rules_dos) {
        prompt += `
## DO's (Things you SHOULD do):
${adminConfig.bot_rules_dos}
`;
    }

    // Add bot rules (don'ts)
    if (adminConfig.bot_rules_donts) {
        prompt += `
## DON'Ts (Things you should NEVER do):
${adminConfig.bot_rules_donts}
`;
    }

    // Add escalation triggers
    if (adminConfig.escalation_triggers) {
        prompt += `
## Escalation Triggers (hand off to human when):
${adminConfig.escalation_triggers}
If any of these occur, politely say you'll have a team member follow up.
`;
    }

    // Add custom goals
    if (adminConfig.custom_goals) {
        prompt += `
## Additional Goals to achieve:
${adminConfig.custom_goals}
`;
    }

    // Add booking info - make it prominent as it's a key requirement
    if (adminConfig.booking_url) {
        prompt += `
## IMPORTANT - Booking Requirement:
You MUST always encourage customers to book a consultation, especially if they are:
- New contacts (not yet evaluated)
- Currently in evaluation stage
- Showing interest but haven't booked yet

A booking button will automatically appear with your message. Just guide them to click it.
When they click the button, they will be able to book at: ${adminConfig.booking_url}

Booking URL: ${adminConfig.booking_url}
`;
    }

    // Add pipeline stage context
    if (conversation.pipeline_stage) {
        prompt += `
## Customer Pipeline Stage: ${conversation.pipeline_stage}
${conversation.pipeline_stage === 'booked' || conversation.pipeline_stage === 'converted' 
    ? 'Customer has already booked/converted. Focus on providing excellent service.'
    : 'Customer has NOT booked yet - prioritize booking a meeting!'}
`;
    }

    // Add important notes
    prompt += `
## Important Notes:
- If the customer asks something not covered in the knowledge base, acknowledge that you'll need to check with the team.
- Refer to previous conversation context when relevant.
- Keep responses concise - this is chat, not email.
`;

    return prompt;
}

/**
 * Format messages for AI chat format
 */
function formatMessagesForAI(messages, systemPrompt, conversation) {
    const aiMessages = [
        { role: 'system', content: systemPrompt }
    ];

    for (const msg of messages) {
        const role = msg.is_from_page ? 'assistant' : 'user';
        const content = msg.message_text || '[No text - possibly attachment]';

        aiMessages.push({ role, content });
    }

    return aiMessages;
}

/**
 * Decide if a message should be split and how
 * @param {string} message - The message to potentially split
 * @param {Object} context - Context for decision
 */
export function decideMessageSplit(message, context = {}) {
    const {
        conversationLength = 0,
        hasUrgency = false,
        platformNorms = 'messenger',
        lengthThreshold = 500
    } = context;

    const wordCount = message.split(/\s+/).length;
    const charCount = message.length;
    const sentenceCount = (message.match(/[.!?]+/g) || []).length;
    const paragraphCount = (message.match(/\n\n+/g) || []).length + 1;
    const hasBulletPoints = /^[\s]*[-•*]\s/m.test(message) || /^\d+\./m.test(message);
    const hasMultipleTopics = paragraphCount > 2 || sentenceCount > 5;

    // Default: don't split
    let shouldSplit = false;
    let strategy = null;
    let options = {};

    // Split for length (Messenger best practices: < 500 chars per message)
    if (charCount > lengthThreshold) {
        shouldSplit = true;

        if (hasBulletPoints) {
            strategy = SPLIT_STRATEGIES.points;
        } else if (paragraphCount > 1) {
            strategy = SPLIT_STRATEGIES.paragraphs;
        } else {
            strategy = SPLIT_STRATEGIES.sentences;
            options.maxCharsPerMessage = lengthThreshold;
        }
    }

    // Split for emotional pacing (new conversations, urgent situations)
    if (!shouldSplit && conversationLength < 3 && wordCount > 50) {
        shouldSplit = true;
        strategy = SPLIT_STRATEGIES.pacing;
        options.pacingDelay = 1000; // 1 second between messages
    }

    // Don't split urgent messages (get info out fast)
    if (hasUrgency && charCount < 800) {
        shouldSplit = false;
        strategy = null;
    }

    return {
        shouldSplit,
        strategy,
        options,
        analysis: {
            wordCount,
            charCount,
            sentenceCount,
            paragraphCount,
            hasBulletPoints
        }
    };
}

/**
 * Split a message according to strategy
 * @param {string} message - Message to split
 * @param {string} strategy - Split strategy
 * @param {Object} options - Strategy options
 */
export function splitMessage(message, strategy, options = {}) {
    switch (strategy) {
        case SPLIT_STRATEGIES.paragraphs:
            return splitByParagraphs(message);

        case SPLIT_STRATEGIES.sentences:
            return splitBySentences(message, options.maxCharsPerMessage || 500);

        case SPLIT_STRATEGIES.points:
            return splitByPoints(message);

        case SPLIT_STRATEGIES.pacing:
            return splitForPacing(message);

        case SPLIT_STRATEGIES.length:
        default:
            return splitByLength(message, options.maxCharsPerMessage || 500);
    }
}

/**
 * Split by paragraph breaks
 */
function splitByParagraphs(message) {
    const paragraphs = message.split(/\n\n+/).filter(p => p.trim());

    if (paragraphs.length === 1) {
        return [message];
    }

    // Group very short paragraphs together
    const result = [];
    let current = '';

    for (const para of paragraphs) {
        if (current.length + para.length < 400) {
            current += (current ? '\n\n' : '') + para;
        } else {
            if (current) result.push(current);
            current = para;
        }
    }

    if (current) result.push(current);
    return result;
}

/**
 * Split by sentence boundaries
 */
function splitBySentences(message, maxChars) {
    const sentences = message.match(/[^.!?]+[.!?]+/g) || [message];
    const result = [];
    let current = '';

    for (const sentence of sentences) {
        if (current.length + sentence.length > maxChars && current) {
            result.push(current.trim());
            current = sentence;
        } else {
            current += sentence;
        }
    }

    if (current.trim()) {
        result.push(current.trim());
    }

    return result.length > 0 ? result : [message];
}

/**
 * Split by bullet points or numbered items
 */
function splitByPoints(message) {
    // Check if starts with intro text
    const introMatch = message.match(/^(.+?)(?=\n\s*[-•*\d])/s);
    const intro = introMatch ? introMatch[1].trim() : null;

    // Extract bullet points
    const pointsMatch = message.match(/^[\s]*[-•*]\s.+$|^\d+\..+$/gm);

    if (!pointsMatch || pointsMatch.length === 0) {
        return [message];
    }

    const result = [];

    // Add intro as first message if exists
    if (intro && intro.length > 10) {
        result.push(intro);
    }

    // Group points (2-3 per message)
    let currentGroup = [];
    for (const point of pointsMatch) {
        currentGroup.push(point.trim());
        if (currentGroup.length >= 3) {
            result.push(currentGroup.join('\n'));
            currentGroup = [];
        }
    }

    if (currentGroup.length > 0) {
        result.push(currentGroup.join('\n'));
    }

    return result;
}

/**
 * Split for emotional pacing (short, punchy intro)
 */
function splitForPacing(message) {
    const sentences = message.match(/[^.!?]+[.!?]+/g) || [message];

    if (sentences.length <= 2) {
        return [message];
    }

    // First message: greeting/opener (1-2 sentences)
    const opener = sentences.slice(0, Math.min(2, sentences.length)).join('').trim();

    // Rest of the message
    const rest = sentences.slice(2).join('').trim();

    const result = [opener];
    if (rest) {
        result.push(rest);
    }

    return result;
}

/**
 * Split by raw character count
 */
function splitByLength(message, maxChars) {
    if (message.length <= maxChars) {
        return [message];
    }

    const result = [];
    let remaining = message;

    while (remaining.length > maxChars) {
        // Find a good break point (space, punctuation)
        let breakPoint = remaining.lastIndexOf(' ', maxChars);
        if (breakPoint < maxChars * 0.5) {
            breakPoint = maxChars; // Force break if no good point
        }

        result.push(remaining.substring(0, breakPoint).trim());
        remaining = remaining.substring(breakPoint).trim();
    }

    if (remaining) {
        result.push(remaining);
    }

    return result;
}

/**
 * Detect urgency in recent messages
 */
function detectUrgency(messages) {
    if (!messages || messages.length === 0) return false;

    const lastFew = messages.slice(-3);
    const recentText = lastFew.map(m => m.message_text || '').join(' ').toLowerCase();

    const urgencyIndicators = [
        'urgent', 'asap', 'emergency', 'immediately', 'now',
        'deadline', 'today', 'quick', 'fast', 'hurry'
    ];

    return urgencyIndicators.some(word => recentText.includes(word));
}

/**
 * Assess emotional tone of a message
 * @param {string} message - Message to analyze
 */
export function assessEmotionalTone(message) {
    if (!message) return { tone: 'neutral', score: 0 };

    const messageLower = message.toLowerCase();

    // Positive indicators
    const positiveWords = ['thanks', 'great', 'awesome', 'love', 'perfect', 'excellent', 'happy', 'excited', '😊', '👍', '❤️'];
    let positiveScore = positiveWords.filter(w => messageLower.includes(w)).length;

    // Negative indicators
    const negativeWords = ['disappointed', 'frustrated', 'angry', 'upset', 'problem', 'issue', 'wrong', 'bad', 'terrible', '😠', '😡'];
    let negativeScore = negativeWords.filter(w => messageLower.includes(w)).length;

    // Determine tone
    if (positiveScore > negativeScore + 1) {
        return { tone: 'positive', score: positiveScore - negativeScore };
    } else if (negativeScore > positiveScore + 1) {
        return { tone: 'negative', score: negativeScore - positiveScore };
    }

    return { tone: 'neutral', score: 0 };
}

/**
 * Send a message through the conversation engine
 * This handles the full send flow including safety checks and logging
 */
export async function sendAIMessage(conversationId, pageId, options = {}) {
    try {
        const db = getSupabase();

        // Generate response
        const result = await generateResponse(conversationId, options);

        if (!result.success) {
            return result;
        }

        // Get page access token
        const { data: page } = await db
            .from('facebook_pages')
            .select('page_access_token')
            .eq('page_id', pageId)
            .single();

        if (!page?.page_access_token) {
            throw new Error('Page access token not found');
        }

        // Get conversation for participant ID and pipeline stage
        const { data: conv } = await db
            .from('facebook_conversations')
            .select('participant_id, pipeline_stage')
            .eq('conversation_id', conversationId)
            .single();

        if (!conv?.participant_id) {
            throw new Error('Participant ID not found');
        }

        // Get booking URL from config
        const { data: settings } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        const config = settings?.value || {};
        const bookingUrl = config.booking_url;

        // Determine if we should add booking quick reply
        const shouldAddBookingButton = bookingUrl && 
            conv.pipeline_stage !== 'booked' && 
            conv.pipeline_stage !== 'converted';

        const sentMessages = [];

        // Send each message with delays for split messages
        for (let i = 0; i < result.messages.length; i++) {
            const message = result.messages[i];
            const isLastMessage = i === result.messages.length - 1;

            // Add delay between split messages for natural pacing
            if (i > 0 && result.wasSplit) {
                await new Promise(resolve => setTimeout(resolve, 1200)); // 1.2 second delay
            }

            // Send via Facebook API with quick replies on last message (if applicable)
            if (isLastMessage && shouldAddBookingButton) {
                const quickReplies = [
                    {
                        content_type: 'text',
                        title: '📅 Book a Meeting',
                        payload: 'BOOK_MEETING'
                    }
                ];

                const sendResult = await sendFacebookMessageWithQuickReplies(
                    pageId,
                    conv.participant_id,
                    message,
                    quickReplies,
                    page.page_access_token
                );

                if (sendResult.success) {
                    sentMessages.push({
                        text: message,
                        messageId: sendResult.messageId,
                        hasBookingButton: true
                    });
                }
            } else {
                const sendResult = await sendFacebookMessage(
                    pageId,
                    conv.participant_id,
                    message,
                    page.page_access_token
                );

                if (sendResult.success) {
                    sentMessages.push({
                        text: message,
                        messageId: sendResult.messageId
                    });
                }
            }
        }

        // Set cooldown after sending
        const cooldownHours = config.default_cooldown_hours || 4;
        await setCooldown(conversationId, cooldownHours);

        // Log sent messages
        await logSafetyEvent({
            conversationId,
            pageId,
            actionType: 'message_sent',
            data: {
                messageCount: sentMessages.length,
                wasSplit: result.wasSplit,
                confidence: result.confidence,
                hadBookingButton: shouldAddBookingButton
            },
            explanation: `Sent ${sentMessages.length} AI message(s)${shouldAddBookingButton ? ' with booking button' : ''}`,
            confidence: result.confidence
        });

        return {
            success: true,
            sentMessages,
            confidence: result.confidence,
            goalProgress: result.goalProgress
        };

    } catch (error) {
        console.error('[ENGINE] Error sending AI message:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send a message via Facebook Messenger API with quick replies
 */
async function sendFacebookMessageWithQuickReplies(pageId, recipientId, text, quickReplies, accessToken) {
    try {
        const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

        const response = await fetch(
            `${GRAPH_API_BASE}/${pageId}/messages?access_token=${accessToken}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: recipientId },
                    message: {
                        text,
                        quick_replies: quickReplies
                    },
                    messaging_type: 'RESPONSE'
                })
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Failed to send message with quick replies');
        }

        const result = await response.json();
        return { success: true, messageId: result.message_id };
    } catch (error) {
        console.error('[ENGINE] Facebook send with quick replies error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send a message via Facebook Messenger API
 */
async function sendFacebookMessage(pageId, recipientId, text, accessToken) {
    try {
        const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

        const response = await fetch(
            `${GRAPH_API_BASE}/${pageId}/messages?access_token=${accessToken}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: recipientId },
                    message: { text },
                    messaging_type: 'RESPONSE'
                })
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Failed to send message');
        }

        const result = await response.json();
        return { success: true, messageId: result.message_id };
    } catch (error) {
        console.error('[ENGINE] Facebook send error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get AI chatbot configuration
 */
export async function getAIConfig() {
    try {
        const db = getSupabase();

        const { data, error } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        if (error) throw error;

        return data?.value || {
            default_cooldown_hours: 4,
            min_confidence_threshold: 0.6,
            max_messages_per_day: 5,
            auto_takeover_on_low_confidence: true,
            default_message_split_threshold: 500,
            intuition_silence_hours: 24,
            best_time_lookback_days: 30
        };
    } catch (error) {
        console.error('[ENGINE] Error getting config:', error);
        return {};
    }
}

export default {
    generateResponse,
    decideMessageSplit,
    splitMessage,
    assessEmotionalTone,
    sendAIMessage,
    getAIConfig,
    SPLIT_STRATEGIES
};
