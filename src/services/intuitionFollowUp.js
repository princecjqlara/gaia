/**
 * Intuition-Based Follow-Up Layer
 * Proactive follow-ups based on inferred intent signals
 * Module 6 of the Enterprise AI Chatbot System
 */

import { getSupabaseClient } from './supabase';
import { checkSafetyStatus, logSafetyEvent } from './safetyLayer';
import { scheduleFollowUp } from './followUpScheduler';
import { nvidiaChat } from './aiService';

const getSupabase = () => {
    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not initialized');
    }
    return client;
};

/**
 * Intent signals that can trigger follow-ups
 */
const INTENT_SIGNALS = {
    SILENCE: 'silence',
    PARTIAL_REPLY: 'partial_reply',
    QUESTION_UNANSWERED: 'question_unanswered',
    POSITIVE_TONE: 'positive_tone',
    NEGATIVE_TONE: 'negative_tone',
    INTEREST_EXPRESSED: 'interest_expressed',
    HESITATION: 'hesitation',
    URGENCY: 'urgency'
};

/**
 * Analyze a conversation for intent signals
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Intent analysis result
 */
export async function analyzeIntentSignals(conversationId) {
    try {
        const db = getSupabase();

        // Get recent messages
        const { data: messages, error } = await db
            .from('facebook_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!messages || messages.length === 0) {
            return { signals: [], confidence: 0, shouldFollowUp: false };
        }

        const orderedMessages = messages.reverse();
        const signals = [];
        let overallConfidence = 0;

        // Analyze silence
        const silenceResult = detectSilenceDuration(orderedMessages);
        if (silenceResult.isSignificant) {
            signals.push({
                type: INTENT_SIGNALS.SILENCE,
                value: silenceResult.hoursSinceLastMessage,
                confidence: silenceResult.confidence,
                description: `No response for ${silenceResult.hoursSinceLastMessage} hours`
            });
            overallConfidence = Math.max(overallConfidence, silenceResult.confidence);
        }

        // Analyze for partial replies
        const partialResult = identifyPartialReplies(orderedMessages);
        if (partialResult.detected) {
            signals.push({
                type: INTENT_SIGNALS.PARTIAL_REPLY,
                value: partialResult.indicators,
                confidence: partialResult.confidence,
                description: 'Conversation appears incomplete'
            });
            overallConfidence = Math.max(overallConfidence, partialResult.confidence);
        }

        // Analyze tone
        const toneResult = analyzeTone(orderedMessages);
        if (toneResult.significant) {
            signals.push({
                type: toneResult.tone === 'positive' ? INTENT_SIGNALS.POSITIVE_TONE : INTENT_SIGNALS.NEGATIVE_TONE,
                value: toneResult.score,
                confidence: toneResult.confidence,
                description: `${toneResult.tone} tone detected`
            });
            overallConfidence = Math.max(overallConfidence, toneResult.confidence);
        }

        // Check for unanswered questions
        const questionResult = detectUnansweredQuestions(orderedMessages);
        if (questionResult.hasUnanswered) {
            signals.push({
                type: INTENT_SIGNALS.QUESTION_UNANSWERED,
                value: questionResult.questions,
                confidence: questionResult.confidence,
                description: 'Customer question may not be fully answered'
            });
            overallConfidence = Math.max(overallConfidence, questionResult.confidence);
        }

        // Check for interest signals
        const interestResult = detectInterestSignals(orderedMessages);
        if (interestResult.detected) {
            signals.push({
                type: INTENT_SIGNALS.INTEREST_EXPRESSED,
                value: interestResult.indicators,
                confidence: interestResult.confidence,
                description: 'Customer showing interest'
            });
            overallConfidence = Math.max(overallConfidence, interestResult.confidence);
        }

        // Check for hesitation
        const hesitationResult = detectHesitation(orderedMessages);
        if (hesitationResult.detected) {
            signals.push({
                type: INTENT_SIGNALS.HESITATION,
                value: hesitationResult.indicators,
                confidence: hesitationResult.confidence,
                description: 'Customer appears hesitant'
            });
            overallConfidence = Math.max(overallConfidence, hesitationResult.confidence);
        }

        // Determine if should trigger follow-up
        const shouldFollowUp = shouldTriggerFollowUp(signals, conversationId);

        return {
            signals,
            confidence: overallConfidence,
            shouldFollowUp: shouldFollowUp.trigger,
            followUpReason: shouldFollowUp.reason,
            suggestedDelay: shouldFollowUp.suggestedDelayHours
        };

    } catch (error) {
        console.error('[INTUITION] Error analyzing intent:', error);
        return { signals: [], confidence: 0, shouldFollowUp: false };
    }
}

/**
 * Detect significant silence duration
 */
export function detectSilenceDuration(messages) {
    if (!messages || messages.length === 0) {
        return { isSignificant: false, hoursSinceLastMessage: 0, confidence: 0 };
    }

    const lastMessage = messages[messages.length - 1];
    const lastTime = new Date(lastMessage.timestamp);
    const hoursSince = (Date.now() - lastTime.getTime()) / (1000 * 60 * 60);

    // Check if last message was from the page (waiting for response)
    const waitingForResponse = lastMessage.is_from_page;

    // Silence is significant if:
    // - Last message was from page AND > 24 hours
    // - OR any message and > 48 hours
    const isSignificant = (waitingForResponse && hoursSince > 24) || hoursSince > 48;

    let confidence = 0;
    if (isSignificant) {
        if (waitingForResponse) {
            // Higher confidence if we're waiting for their response
            confidence = Math.min(0.4 + (hoursSince / 72) * 0.4, 0.8);
        } else {
            confidence = Math.min(0.3 + (hoursSince / 96) * 0.3, 0.6);
        }
    }

    return {
        isSignificant,
        hoursSinceLastMessage: Math.round(hoursSince),
        waitingForResponse,
        confidence
    };
}

/**
 * Identify partial or incomplete replies
 */
export function identifyPartialReplies(messages) {
    if (!messages || messages.length < 2) {
        return { detected: false, indicators: [], confidence: 0 };
    }

    const customerMessages = messages.filter(m => !m.is_from_page);
    if (customerMessages.length === 0) {
        return { detected: false, indicators: [], confidence: 0 };
    }

    const indicators = [];
    let confidence = 0;

    // Check last few customer messages
    const recentCustomer = customerMessages.slice(-3);

    for (const msg of recentCustomer) {
        const text = (msg.message_text || '').trim().toLowerCase();

        // Very short responses might be incomplete
        if (text.length < 10 && text.length > 0) {
            indicators.push('short_response');
            confidence += 0.15;
        }

        // Ends with ellipsis or trailing off
        if (text.endsWith('...') || text.endsWith('..')) {
            indicators.push('trailing_off');
            confidence += 0.25;
        }

        // Single word affirmatives that need follow-up
        if (['ok', 'okay', 'sure', 'yes', 'maybe', 'hmm', 'idk'].includes(text)) {
            indicators.push('vague_affirmative');
            confidence += 0.2;
        }

        // Questions that got only partial answers
        if (text.includes('?') && msg !== recentCustomer[recentCustomer.length - 1]) {
            // Question was followed by another message - might need more info
            indicators.push('question_followed_up');
            confidence += 0.1;
        }
    }

    return {
        detected: indicators.length > 0,
        indicators: [...new Set(indicators)],
        confidence: Math.min(confidence, 0.7)
    };
}

/**
 * Analyze message tone
 */
export function analyzeTone(messages) {
    if (!messages || messages.length === 0) {
        return { tone: 'neutral', score: 0, confidence: 0, significant: false };
    }

    const customerMessages = messages.filter(m => !m.is_from_page);
    const recentText = customerMessages.slice(-5)
        .map(m => m.message_text || '')
        .join(' ')
        .toLowerCase();

    if (!recentText) {
        return { tone: 'neutral', score: 0, confidence: 0, significant: false };
    }

    // Positive indicators
    const positiveWords = [
        'great', 'awesome', 'perfect', 'love', 'thanks', 'thank you',
        'excellent', 'amazing', 'wonderful', 'appreciate', 'helpful',
        '😊', '👍', '❤️', '🙏', '✨'
    ];

    // Negative indicators
    const negativeWords = [
        'frustrated', 'disappointed', 'angry', 'upset', 'problem', 'issue',
        'wrong', 'bad', 'terrible', 'hate', 'annoying', 'useless',
        'waste', 'scam', 'never', 'worst', '😠', '😡', '👎'
    ];

    // Hesitation indicators
    const hesitationWords = [
        'not sure', 'maybe', 'might', 'could be', 'i guess',
        'thinking about', 'need to think', 'let me think'
    ];

    let positiveScore = 0;
    let negativeScore = 0;
    let hesitationScore = 0;

    for (const word of positiveWords) {
        if (recentText.includes(word)) positiveScore++;
    }
    for (const word of negativeWords) {
        if (recentText.includes(word)) negativeScore++;
    }
    for (const word of hesitationWords) {
        if (recentText.includes(word)) hesitationScore++;
    }

    let tone = 'neutral';
    let score = 0;
    let significant = false;
    let confidence = 0;

    if (positiveScore > negativeScore + 1) {
        tone = 'positive';
        score = positiveScore - negativeScore;
        significant = positiveScore >= 2;
        confidence = Math.min(0.3 + positiveScore * 0.15, 0.7);
    } else if (negativeScore > positiveScore + 1) {
        tone = 'negative';
        score = negativeScore - positiveScore;
        significant = negativeScore >= 2;
        confidence = Math.min(0.4 + negativeScore * 0.15, 0.8); // Higher confidence for negative
    }

    return { tone, score, confidence, significant, hesitationScore };
}

/**
 * Detect unanswered questions
 */
function detectUnansweredQuestions(messages) {
    if (!messages || messages.length < 2) {
        return { hasUnanswered: false, questions: [], confidence: 0 };
    }

    const questions = [];
    let confidence = 0;

    // Look for customer questions
    for (let i = 0; i < messages.length - 1; i++) {
        const msg = messages[i];
        if (msg.is_from_page) continue;

        const text = msg.message_text || '';
        if (text.includes('?')) {
            // Check if the next message from page adequately addressed it
            const nextPageMsg = messages.slice(i + 1).find(m => m.is_from_page);

            if (!nextPageMsg) {
                questions.push(text.substring(0, 50));
                confidence += 0.25;
            } else {
                // Simple heuristic: if response is very short, might not be adequate
                const responseText = nextPageMsg.message_text || '';
                if (responseText.length < 20) {
                    questions.push(text.substring(0, 50));
                    confidence += 0.15;
                }
            }
        }
    }

    // Check if last message is a question from customer
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg.is_from_page && (lastMsg.message_text || '').includes('?')) {
        questions.push((lastMsg.message_text || '').substring(0, 50));
        confidence += 0.35;
    }

    return {
        hasUnanswered: questions.length > 0,
        questions,
        confidence: Math.min(confidence, 0.8)
    };
}

/**
 * Detect interest signals
 */
function detectInterestSignals(messages) {
    if (!messages || messages.length === 0) {
        return { detected: false, indicators: [], confidence: 0 };
    }

    const customerText = messages
        .filter(m => !m.is_from_page)
        .slice(-5)
        .map(m => m.message_text || '')
        .join(' ')
        .toLowerCase();

    const interestIndicators = [
        { pattern: 'how much', indicator: 'price_inquiry' },
        { pattern: 'pricing', indicator: 'price_inquiry' },
        { pattern: 'cost', indicator: 'price_inquiry' },
        { pattern: 'when can', indicator: 'availability_inquiry' },
        { pattern: 'available', indicator: 'availability_inquiry' },
        { pattern: 'schedule', indicator: 'booking_intent' },
        { pattern: 'book', indicator: 'booking_intent' },
        { pattern: 'meeting', indicator: 'booking_intent' },
        { pattern: 'call', indicator: 'call_intent' },
        { pattern: 'interested', indicator: 'direct_interest' },
        { pattern: 'tell me more', indicator: 'info_request' },
        { pattern: 'more details', indicator: 'info_request' },
        { pattern: 'sounds good', indicator: 'positive_reception' },
        { pattern: 'let\'s do it', indicator: 'commitment' }
    ];

    const detected = [];
    let confidence = 0;

    for (const { pattern, indicator } of interestIndicators) {
        if (customerText.includes(pattern)) {
            detected.push(indicator);
            confidence += 0.2;
        }
    }

    return {
        detected: detected.length > 0,
        indicators: [...new Set(detected)],
        confidence: Math.min(confidence, 0.85)
    };
}

/**
 * Detect hesitation
 */
function detectHesitation(messages) {
    if (!messages || messages.length === 0) {
        return { detected: false, indicators: [], confidence: 0 };
    }

    const customerText = messages
        .filter(m => !m.is_from_page)
        .slice(-5)
        .map(m => m.message_text || '')
        .join(' ')
        .toLowerCase();

    const hesitationIndicators = [
        { pattern: 'not sure', indicator: 'uncertainty' },
        { pattern: 'need to think', indicator: 'deliberation' },
        { pattern: 'let me check', indicator: 'verification' },
        { pattern: 'talk to', indicator: 'consultation' },
        { pattern: 'maybe later', indicator: 'delay' },
        { pattern: 'will consider', indicator: 'consideration' },
        { pattern: 'hmm', indicator: 'pondering' },
        { pattern: 'but', indicator: 'objection' },
        { pattern: 'however', indicator: 'objection' },
        { pattern: 'concern', indicator: 'worry' },
        { pattern: 'worried', indicator: 'worry' }
    ];

    const detected = [];
    let confidence = 0;

    for (const { pattern, indicator } of hesitationIndicators) {
        if (customerText.includes(pattern)) {
            detected.push(indicator);
            confidence += 0.15;
        }
    }

    return {
        detected: detected.length > 0,
        indicators: [...new Set(detected)],
        confidence: Math.min(confidence, 0.7)
    };
}

/**
 * Determine if signals should trigger a follow-up
 */
function shouldTriggerFollowUp(signals, conversationId) {
    if (!signals || signals.length === 0) {
        return { trigger: false };
    }

    // Priority signals that definitely trigger follow-up
    const highPriorityTypes = [
        INTENT_SIGNALS.SILENCE,
        INTENT_SIGNALS.QUESTION_UNANSWERED,
        INTENT_SIGNALS.INTEREST_EXPRESSED
    ];

    // Signals that need combination
    const mediumPriorityTypes = [
        INTENT_SIGNALS.PARTIAL_REPLY,
        INTENT_SIGNALS.HESITATION
    ];

    let shouldTrigger = false;
    let reason = '';
    let suggestedDelayHours = 24;

    // Check high priority
    for (const signal of signals) {
        if (highPriorityTypes.includes(signal.type) && signal.confidence > 0.5) {
            shouldTrigger = true;
            reason = signal.description;

            if (signal.type === INTENT_SIGNALS.INTEREST_EXPRESSED) {
                suggestedDelayHours = 4; // Follow up quickly on interest
            } else if (signal.type === INTENT_SIGNALS.QUESTION_UNANSWERED) {
                suggestedDelayHours = 2; // Answer questions fast
            }
            break;
        }
    }

    // Check for medium priority combinations
    if (!shouldTrigger) {
        const mediumSignals = signals.filter(s =>
            mediumPriorityTypes.includes(s.type) && s.confidence > 0.4
        );

        if (mediumSignals.length >= 2) {
            shouldTrigger = true;
            reason = 'Multiple engagement signals detected';
            suggestedDelayHours = 12;
        }
    }

    // Negative tone requires careful handling
    const negativeTone = signals.find(s => s.type === INTENT_SIGNALS.NEGATIVE_TONE);
    if (negativeTone && negativeTone.confidence > 0.6) {
        shouldTrigger = true;
        reason = 'Customer appears frustrated - may need attention';
        suggestedDelayHours = 1; // Quick response to negative sentiment
    }

    return {
        trigger: shouldTrigger,
        reason,
        suggestedDelayHours
    };
}

/**
 * Trigger intuition-based follow-up for a conversation
 * @param {string} conversationId - Conversation ID
 */
export async function triggerIntuitionFollowUp(conversationId) {
    try {
        // Check safety first
        const safety = await checkSafetyStatus(conversationId);
        if (!safety.canAIRespond) {
            return {
                success: false,
                reason: safety.blockReason,
                scheduled: false
            };
        }

        // Analyze intent
        const analysis = await analyzeIntentSignals(conversationId);

        if (!analysis.shouldFollowUp) {
            return {
                success: true,
                triggered: false,
                reason: 'No significant signals detected',
                signals: analysis.signals
            };
        }

        const db = getSupabase();

        const { data: settings } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        const config = settings?.value || {};
        const aggressivenessShift = Number.isFinite(config.intuition_fibonacci_shift)
            ? config.intuition_fibonacci_shift
            : 0;
        const fibIndexShift = -aggressivenessShift;

        const { data: conversation } = await db
            .from('facebook_conversations')
            .select('last_message_time')
            .eq('conversation_id', conversationId)
            .single();

        const { data: recentInboundMessage } = await db
            .from('facebook_messages')
            .select('timestamp')
            .eq('conversation_id', conversationId)
            .eq('is_from_page', false)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        const conversationTime = conversation?.last_message_time
            ? new Date(conversation.last_message_time)
            : null;
        const recentInboundTime = recentInboundMessage?.timestamp
            ? new Date(recentInboundMessage.timestamp)
            : null;

        const hasConversationTime = conversationTime && !Number.isNaN(conversationTime.getTime());
        const hasRecentInboundTime = recentInboundTime && !Number.isNaN(recentInboundTime.getTime());

        let lastMessageTime = hasRecentInboundTime
            ? recentInboundTime
            : hasConversationTime
                ? conversationTime
                : null;

        if (!lastMessageTime) {
            lastMessageTime = new Date();
        }

        const fibonacci = (n) => {
            if (n <= 1) return 1;
            let a = 1;
            let b = 2;
            for (let i = 2; i < n; i++) {
                const next = a + b;
                a = b;
                b = next;
            }
            return b;
        };

        let followUpCount = 0;
        try {
            let followUpCountQuery = db
                .from('ai_followup_schedule')
                .select('id', { count: 'exact', head: true })
                .eq('conversation_id', conversationId)
                .eq('follow_up_type', 'intuition')
                .neq('status', 'cancelled');

            if (lastMessageTime) {
                followUpCountQuery = followUpCountQuery.gte('scheduled_at', lastMessageTime.toISOString());
            }

            const { count } = await followUpCountQuery;
            followUpCount = count || 0;
        } catch (err) {
            console.log('[INTUITION] Could not load follow-up count:', err.message);
        }

        const getStepDuration = (fibIndex) => {
            const fibHours = fibonacci(fibIndex);
            const durationMs = fibHours >= 24
                ? Math.ceil(fibHours / 24) * 24 * 60 * 60 * 1000
                : fibHours * 60 * 60 * 1000;
            return { fibHours, durationMs };
        };

        const nextStep = followUpCount + 1;
        let cumulativeMs = 0;
        for (let step = 1; step <= nextStep; step++) {
            const fibIndex = Math.max(1, step + fibIndexShift);
            const { durationMs } = getStepDuration(fibIndex);
            cumulativeMs += durationMs;
        }

        const scheduledAt = new Date(lastMessageTime.getTime() + cumulativeMs);

        // Schedule the follow-up
        const result = await scheduleFollowUp(conversationId, {
            type: 'intuition',
            reason: analysis.followUpReason,
            scheduledAt
        });

        if (result.success) {
            await logSafetyEvent({
                conversationId,
                actionType: 'intent_detected',
                data: {
                    signals: analysis.signals,
                    confidence: analysis.confidence,
                    followUpScheduled: true
                },
                explanation: `Intent detected: ${analysis.followUpReason}. Follow-up scheduled.`,
                confidence: analysis.confidence
            });
        }

        return {
            success: result.success,
            triggered: true,
            reason: analysis.followUpReason,
            signals: analysis.signals,
            scheduledAt: result.scheduledAt
        };

    } catch (error) {
        console.error('[INTUITION] Error triggering follow-up:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generate AI-powered intuition analysis
 * Uses AI to analyze conversation for deeper insights
 */
export async function deepAnalyzeConversation(messages) {
    if (!messages || messages.length < 3) {
        return null;
    }

    const conversationText = messages
        .slice(-15)
        .map(m => `${m.is_from_page ? 'Agent' : 'Customer'}: ${m.message_text || '[no text]'}`)
        .join('\n');

    const prompt = `Analyze this customer conversation and identify:
1. Customer's intent (buying, inquiring, complaining, etc.)
2. Confidence level (how confident are they?)
3. Any objections or concerns
4. Recommended next action

Conversation:
${conversationText}

Respond in JSON format: {"intent": "", "confidence": "", "objections": [], "nextAction": "", "urgency": "low/medium/high"}`;

    try {
        const response = await nvidiaChat([
            { role: 'system', content: 'You are a sales conversation analyst. Analyze customer intent and recommend actions.' },
            { role: 'user', content: prompt }
        ], { temperature: 0.3, maxTokens: 256 });

        if (!response) return null;

        // Parse JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('[INTUITION] Deep analysis error:', error);
    }

    return null;
}

export default {
    INTENT_SIGNALS,
    analyzeIntentSignals,
    detectSilenceDuration,
    identifyPartialReplies,
    analyzeTone,
    triggerIntuitionFollowUp,
    deepAnalyzeConversation
};
