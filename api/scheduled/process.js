import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import {
    rankPromptsByReplyPerformance,
    selectPromptForRealtimeStep
} from '../../src/utils/followupPromptStrategy.js';
import {
    alignToHourOnOrAfter,
    getFibonacciDelayHours,
    shouldAlignToBestTime
} from '../../src/utils/followUpCadence.js';
import {
    buildUtilityTemplateParameters,
    countTemplatePlaceholders
} from '../../src/utils/utilityTemplateParams.js';

function getFirstName(name) {
    if (!name || typeof name !== 'string') return '';
    const trimmed = name.trim();
    if (!trimmed) return '';
    const withoutTitles = trimmed.replace(/^(mr|mrs|ms|miss|sir|maam|ma'am|dr)\.?\s+/i, '');
    const commaSplit = withoutTitles.includes(',')
        ? withoutTitles.split(',').slice(1).join(' ').trim() || withoutTitles.split(',')[0].trim()
        : withoutTitles;
    const parts = commaSplit.split(/\s+/);
    return parts[0] || commaSplit;
}

function parseTimestamp(value) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function evaluateSevenDayWindow({
    lastInboundTimestamp,
    conversationLastMessageTimestamp,
    now = new Date()
} = {}) {
    const lastInbound = parseTimestamp(lastInboundTimestamp);
    const conversationLastMessage = parseTimestamp(conversationLastMessageTimestamp);
    const nowDate = parseTimestamp(now);

    if (!nowDate) {
        return {
            daysSinceLastMsg: null,
            outside7DayWindow: false,
            referenceSource: null
        };
    }

    const referenceTime = lastInbound || conversationLastMessage;
    if (!referenceTime) {
        return {
            daysSinceLastMsg: null,
            outside7DayWindow: false,
            referenceSource: null
        };
    }

    const daysSinceLastMsg = (nowDate.getTime() - referenceTime.getTime()) / (1000 * 60 * 60 * 24);

    return {
        daysSinceLastMsg,
        outside7DayWindow: daysSinceLastMsg > 7,
        referenceSource: lastInbound ? 'inbound' : 'conversation_last_message'
    };
}

export function buildFollowupCounterSummary({
    pendingTotal = 0,
    pendingDue = 0,
    pendingReadReceipt = 0,
    failedUtilityNoTemplate = 0,
    cancelledUtilityDisabled = 0,
    utilitySentInWindow = 0,
    sentRows = []
} = {}) {
    const safeRows = Array.isArray(sentRows) ? sentRows : [];
    const sentByType = safeRows.reduce((acc, row) => {
        const type = row?.follow_up_type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});

    return {
        pending: {
            total: pendingTotal || 0,
            dueNow: pendingDue || 0,
            readReceipt: pendingReadReceipt || 0
        },
        utilityFailures: {
            noApprovedTemplate: failedUtilityNoTemplate || 0,
            disabledOutsideWindow: cancelledUtilityDisabled || 0
        },
        sent: {
            total: safeRows.length,
            byType: sentByType,
            utilityTemplatesLastWindow: utilitySentInWindow || 0
        }
    };
}

export function getCounterResultCount(result, defaultValue = 0) {
    if (!result || result.error) return defaultValue;
    return Number.isFinite(result.count) ? result.count : defaultValue;
}

async function fetchFollowupCounterSummary(supabase, windowHours = 24) {
    const normalizedWindowHours = Number.isFinite(windowHours)
        ? Math.min(Math.max(Math.floor(windowHours), 1), 24 * 30)
        : 24;

    const since = new Date(Date.now() - normalizedWindowHours * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const [
        pendingTotalResult,
        pendingDueResult,
        pendingReadReceiptResult,
        failedUtilityNoTemplateResult,
        cancelledUtilityDisabledResult,
        utilitySentInWindowResult,
        sentRowsResult
    ] = await Promise.all([
        supabase
            .from('ai_followup_schedule')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
        supabase
            .from('ai_followup_schedule')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .lte('scheduled_at', nowIso),
        supabase
            .from('ai_followup_schedule')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .eq('follow_up_type', 'read_receipt'),
        supabase
            .from('ai_followup_schedule')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'failed')
            .ilike('error_message', '%No approved utility templates%'),
        supabase
            .from('ai_followup_schedule')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'cancelled')
            .ilike('error_message', '%Utility follow-ups disabled%'),
        supabase
            .from('facebook_messages')
            .select('id', { count: 'exact', head: true })
            .eq('is_from_page', true)
            .eq('sent_source', 'ai_followup_utility')
            .gte('timestamp', since),
        supabase
            .from('ai_followup_schedule')
            .select('follow_up_type, sent_at')
            .eq('status', 'sent')
            .gte('sent_at', since)
            .limit(1000)
    ]);

    const firstError = [
        pendingTotalResult.error,
        pendingDueResult.error,
        pendingReadReceiptResult.error,
        failedUtilityNoTemplateResult.error,
        cancelledUtilityDisabledResult.error,
        sentRowsResult.error
    ].find(Boolean);

    if (firstError) {
        throw new Error(firstError.message);
    }

    if (utilitySentInWindowResult.error) {
        console.log('[SCHEDULED] Utility sent counter unavailable, defaulting to 0:', utilitySentInWindowResult.error.message || 'unknown error');
    }

    return {
        windowHours: normalizedWindowHours,
        generatedAt: new Date().toISOString(),
        ...buildFollowupCounterSummary({
            pendingTotal: getCounterResultCount(pendingTotalResult, 0),
            pendingDue: getCounterResultCount(pendingDueResult, 0),
            pendingReadReceipt: getCounterResultCount(pendingReadReceiptResult, 0),
            failedUtilityNoTemplate: getCounterResultCount(failedUtilityNoTemplateResult, 0),
            cancelledUtilityDisabled: getCounterResultCount(cancelledUtilityDisabledResult, 0),
            utilitySentInWindow: getCounterResultCount(utilitySentInWindowResult, 0),
            sentRows: sentRowsResult.data
        })
    };
}

const UTILITY_WRAPPER_FALLBACKS = [
    '{{1}} — Message from {page name} support team. {{2}}'
];

function normalizeTemplateBody(body) {
    if (!body || typeof body !== 'string') return '';
    return body.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isStrictUtilityTemplateFormat(body) {
    const normalized = normalizeTemplateBody(body).replace(/—/g, '-');
    return normalized === '{{1}} - message from {page name} support team. {{2}}';
}

function hashTemplateBody(body) {
    const normalized = normalizeTemplateBody(body);
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

function sanitizeUtilityText(text, maxChars) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.replace(/\|\|\|/g, ' ');
    cleaned = cleaned.replace(/[{}]/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    if (Number.isFinite(maxChars) && maxChars > 0 && cleaned.length > maxChars) {
        cleaned = cleaned.slice(0, maxChars).trim();
    }
    return cleaned;
}

function isValidUtilityWrapper(wrapper) {
    if (!wrapper || typeof wrapper !== 'string') return false;
    const trimmed = wrapper.trim();
    const placeholderOneCount = (trimmed.match(/{{1}}/g) || []).length;
    const placeholderTwoCount = (trimmed.match(/{{2}}/g) || []).length;
    if (placeholderOneCount !== 1) return false;
    if (placeholderTwoCount > 1) return false;
    if (placeholderTwoCount === 1 && trimmed.indexOf('{{1}}') > trimmed.indexOf('{{2}}')) return false;
    if (trimmed.includes('\n')) return false;
    return true;
}

function buildUtilityTemplateName(hash) {
    return `utility_followup_${hash.slice(0, 18)}`;
}

function pickPreferredUtilityTemplate(templates) {
    if (!Array.isArray(templates) || templates.length === 0) return null;

    const strictTemplate = templates.find((template) => isStrictUtilityTemplateFormat(template.template_body));
    if (strictTemplate) return strictTemplate;

    const twoPlaceholderTemplate = templates.find((template) => countTemplatePlaceholders(template.template_body) >= 2);
    if (twoPlaceholderTemplate) return twoPlaceholderTemplate;

    return templates[0];
}

async function selectApprovedUtilityTemplate(supabase, pageId, language) {
    let query = supabase
        .from('utility_followup_templates')
        .select('id, template_id, template_name, language, template_body, status, use_count, last_used_at')
        .eq('page_id', pageId)
        .eq('status', 'APPROVED')
        .order('last_used_at', { ascending: true, nullsFirst: true })
        .limit(25);

    if (language) {
        query = query.eq('language', language);
    }

    const { data, error } = await query;
    if (error) {
        return { template: null, error: error.message };
    }

    if (data && data.length > 0) {
        return { template: pickPreferredUtilityTemplate(data), error: null };
    }

    if (language) {
        const { data: fallbackData, error: fallbackError } = await supabase
            .from('utility_followup_templates')
            .select('id, template_id, template_name, language, template_body, status, use_count, last_used_at')
            .eq('page_id', pageId)
            .eq('status', 'APPROVED')
            .order('last_used_at', { ascending: true, nullsFirst: true })
            .limit(25);

        if (fallbackError) {
            return { template: null, error: fallbackError.message };
        }

        if (fallbackData && fallbackData.length > 0) {
            return { template: pickPreferredUtilityTemplate(fallbackData), error: null };
        }
    }

    return { template: null, error: null };
}

async function markUtilityTemplateUsed(supabase, template) {
    if (!template?.id) return;
    const nextCount = (template.use_count || 0) + 1;
    await supabase
        .from('utility_followup_templates')
        .update({
            use_count: nextCount,
            last_used_at: new Date().toISOString()
        })
        .eq('id', template.id);
}

async function generateUtilityWrapper(nvidiaKey, languageLabel) {
    if (!nvidiaKey) return null;
    const prompt = `Create a one-paragraph utility follow-up wrapper in ${languageLabel || 'English'}.
Use this exact format and placeholders:
{{1}} — Message from {page name} support team. {{2}}
Do not add any extra words or line breaks.
Return ONLY the wrapper text.`;

    try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${nvidiaKey}`
            },
            body: JSON.stringify({
                model: 'meta/llama-3.1-8b-instruct',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 60
            })
        });

        if (!response.ok) return null;
        const data = await response.json();
        const wrapper = data.choices?.[0]?.message?.content?.trim()?.replace(/^"|"$/g, '');
        return wrapper || null;
    } catch {
        return null;
    }
}

async function maybeAutoCreateUtilityTemplate({
    supabase,
    pageId,
    pageAccessToken,
    language,
    messageText,
    config,
    nvidiaKey,
    wrapperLanguage
}) {
    const autoCreateEnabled = config?.auto_create !== false;
    if (!autoCreateEnabled || !pageAccessToken) return;

    const dailyCap = Number.isFinite(config?.daily_create_cap)
        ? config.daily_create_cap
        : 10;

    if (dailyCap <= 0) return;

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const { count: createdToday, error: countError } = await supabase
        .from('utility_followup_templates')
        .select('id', { count: 'exact', head: true })
        .eq('page_id', pageId)
        .eq('source', 'ai_generated')
        .gte('created_at', startOfDay.toISOString());

    if (countError) {
        console.log('[AI FOLLOWUP] Utility template count error:', countError.message);
        return;
    }

    if ((createdToday || 0) >= dailyCap) return;

    let wrapper = await generateUtilityWrapper(nvidiaKey, wrapperLanguage || config?.wrapper_language || 'English');
    if (!isValidUtilityWrapper(wrapper)) {
        wrapper = null;
    }

    if (!wrapper) {
        const fallback = UTILITY_WRAPPER_FALLBACKS[Math.floor(Math.random() * UTILITY_WRAPPER_FALLBACKS.length)];
        wrapper = fallback;
    }

    if (!isValidUtilityWrapper(wrapper)) return;

    const templateHash = hashTemplateBody(wrapper);
    const { data: existing, error: existingError } = await supabase
        .from('utility_followup_templates')
        .select('id')
        .eq('page_id', pageId)
        .eq('template_hash', templateHash)
        .limit(1);

    if (existingError) {
        console.log('[AI FOLLOWUP] Utility template lookup error:', existingError.message);
        return;
    }

    if (existing && existing.length > 0) return;

    const templateName = buildUtilityTemplateName(templateHash);
    const exampleParams = buildUtilityTemplateParameters({
        templateBody: wrapper,
        messageText: sanitizeUtilityText(messageText || 'Quick update.', 120) || 'Quick update.',
        maxBodyChars: 120,
        maxHeaderChars: 60
    });

    const payload = {
        name: templateName,
        category: 'UTILITY',
        language: language,
        components: [
            {
                type: 'BODY',
                text: wrapper,
                example: { body_text: [exampleParams] }
            }
        ]
    };

    try {
        const response = await fetch(
            `https://graph.facebook.com/v21.0/${pageId}/message_templates?access_token=${pageAccessToken}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );

        const data = await response.json();
        if (!response.ok) {
            console.log('[AI FOLLOWUP] Utility template create failed:', data.error?.message || 'Unknown error');
            return;
        }

        await supabase
            .from('utility_followup_templates')
            .insert({
                page_id: pageId,
                template_id: data.id || null,
                template_name: templateName,
                language: language,
                status: data.status || 'PENDING',
                template_body: wrapper,
                template_hash: templateHash,
                source: 'ai_generated',
                use_count: 0,
                created_at: new Date().toISOString(),
                approved_at: data.status === 'APPROVED' ? new Date().toISOString() : null,
                error_message: null
            });

        console.log(`[AI FOLLOWUP] Utility template submitted: ${templateName} (${data.status || 'PENDING'})`);
    } catch (err) {
        console.log('[AI FOLLOWUP] Utility template submit error:', err.message);
    }
}

async function sendUtilityTemplateMessage({
    pageId,
    pageAccessToken,
    recipientId,
    templateName,
    language,
    templateBody,
    bodyText
}) {
    const templateParams = buildUtilityTemplateParameters({
        templateBody,
        messageText: bodyText || 'Quick update.',
        maxBodyChars: 320,
        maxHeaderChars: 80
    });

    const response = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${pageAccessToken}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                messaging_type: 'UTILITY',
                template: {
                    name: templateName,
                    language: { code: language },
                    components: [
                        {
                            type: 'body',
                            parameters: templateParams.map((textParam) => ({
                                type: 'text',
                                text: textParam
                            }))
                        }
                    ]
                }
            })
        }
    );

    const data = await response.json();
    if (!response.ok) {
        return { ok: false, error: data.error?.message || 'Utility send failed', errorCode: data.error?.code };
    }

    return { ok: true, data };
}

function getDefaultBestContactHour(conversationId) {
    const seed = (conversationId || '')
        .split('')
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);

    return 9 + (Math.abs(seed) % 8);
}

async function getBestContactHour(supabase, conversationId) {
    const fallbackHour = getDefaultBestContactHour(conversationId);

    try {
        const { data: engagements, error } = await supabase
            .from('contact_engagement')
            .select('hour_of_day, response_latency_seconds')
            .eq('conversation_id', conversationId)
            .eq('message_direction', 'inbound')
            .order('message_timestamp', { ascending: false })
            .limit(50);

        if (error || !engagements || engagements.length === 0) {
            return fallbackHour;
        }

        const hourStats = new Map();
        for (const engagement of engagements) {
            const hour = Number.parseInt(engagement.hour_of_day, 10);
            if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;

            const stats = hourStats.get(hour) || { count: 0, latencyTotal: 0 };
            stats.count += 1;
            stats.latencyTotal += Number.isFinite(engagement.response_latency_seconds)
                ? engagement.response_latency_seconds
                : 0;
            hourStats.set(hour, stats);
        }

        if (hourStats.size === 0) {
            return fallbackHour;
        }

        let bestHour = fallbackHour;
        let bestScore = -Infinity;
        for (const [hour, stats] of hourStats.entries()) {
            const avgLatency = stats.count > 0 ? stats.latencyTotal / stats.count : 0;
            const latencyFactor = 1 - Math.min(avgLatency / 7200, 0.8);
            const score = stats.count * latencyFactor;

            if (score > bestScore) {
                bestScore = score;
                bestHour = hour;
            }
        }

        return bestHour;
    } catch (error) {
        console.log('[AI FOLLOWUP] Best-time lookup fallback:', error.message);
        return fallbackHour;
    }
}

/**
 * Auto-create prompts from conversation history when none exist.
 * Analyzes recent conversations that received customer replies and
 * uses AI to generate 3 diverse follow-up prompt variants.
 */
async function autoCreatePromptsFromHistory(supabase) {
    const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
    if (!NVIDIA_API_KEY) {
        console.log('[AUTO-SEQUENCE] No NVIDIA API key, skipping auto-creation');
        return [];
    }

    try {
        // 1. Find recent outbound messages that received replies
        const { data: repliedConvos, error: convError } = await supabase
            .from('facebook_conversations')
            .select('conversation_id')
            .not('last_message_time', 'is', null)
            .order('last_message_time', { ascending: false })
            .limit(20);

        if (convError || !repliedConvos?.length) {
            console.log('[AUTO-SEQUENCE] No conversations found for analysis');
            return [];
        }

        // 2. Gather successful follow-up patterns (outbound msgs that got replies)
        const successfulPatterns = [];
        for (const conv of repliedConvos.slice(0, 10)) {
            const { data: msgs } = await supabase
                .from('facebook_messages')
                .select('message_text, is_from_page, timestamp')
                .eq('conversation_id', conv.conversation_id)
                .order('timestamp', { ascending: true })
                .limit(20);

            if (!msgs || msgs.length < 2) continue;

            // Find AI messages that were followed by customer replies
            for (let i = 0; i < msgs.length - 1; i++) {
                if (msgs[i].is_from_page && !msgs[i + 1].is_from_page && msgs[i].message_text) {
                    successfulPatterns.push(msgs[i].message_text.substring(0, 200));
                    if (successfulPatterns.length >= 5) break;
                }
            }
            if (successfulPatterns.length >= 5) break;
        }

        if (successfulPatterns.length === 0) {
            console.log('[AUTO-SEQUENCE] No successful reply patterns found, using defaults');
            // Use default prompts if no history available
            return await insertDefaultPrompts(supabase);
        }

        // 3. Use AI to generate 3 diverse prompt variants
        const analysisPrompt = `Analyze these follow-up messages that successfully got customer replies:

${successfulPatterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Based on these patterns, generate exactly 3 SHORT follow-up prompt INSTRUCTIONS (not the messages themselves).
Each instruction tells an AI how to write a follow-up message using a different angle:
1. Empathetic/friendly approach
2. Value/benefit-driven approach
3. Urgency/scarcity approach

Respond in valid JSON: [{"label": "...", "prompt": "..."}]
Keep each prompt under 100 words. Return ONLY the JSON array.`;

        const aiResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NVIDIA_API_KEY}`
            },
            body: JSON.stringify({
                model: 'meta/llama-3.1-8b-instruct',
                messages: [{ role: 'user', content: analysisPrompt }],
                temperature: 0.7,
                max_tokens: 600
            })
        });

        if (!aiResponse.ok) {
            console.log('[AUTO-SEQUENCE] AI generation failed, using defaults');
            return await insertDefaultPrompts(supabase);
        }

        const aiData = await aiResponse.json();
        const rawText = aiData.choices?.[0]?.message?.content?.trim();
        if (!rawText) return await insertDefaultPrompts(supabase);

        // Parse AI response
        let variants;
        try {
            const jsonMatch = rawText.match(/\[.*\]/s);
            variants = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
        } catch {
            console.log('[AUTO-SEQUENCE] Could not parse AI response, using defaults');
            return await insertDefaultPrompts(supabase);
        }

        if (!Array.isArray(variants) || variants.length === 0) {
            return await insertDefaultPrompts(supabase);
        }

        // 4. Create a default sequence
        const { data: seq, error: seqErr } = await supabase
            .from('message_sequences')
            .insert({
                name: 'Auto-Generated Sequence',
                is_active: true,
                total_sent: 0,
                total_replies: 0
            })
            .select()
            .single();

        if (seqErr) {
            console.log('[AUTO-SEQUENCE] Sequence creation failed:', seqErr.message);
            return [];
        }

        // 5. Insert prompt variants
        const createdPrompts = [];
        for (let i = 0; i < Math.min(variants.length, 3); i++) {
            const v = variants[i];
            const { data: prompt, error: promptErr } = await supabase
                .from('message_prompts')
                .insert({
                    prompt_text: v.prompt || v.instruction || `Generate a natural follow-up message using approach ${i + 1}`,
                    label: v.label || `Auto Variant ${i + 1}`,
                    sequence_id: seq.id,
                    sequence_position: i + 1,
                    is_active: true,
                    total_sent: 0,
                    total_replies: 0
                })
                .select()
                .single();

            if (!promptErr && prompt) {
                createdPrompts.push(prompt);
            }
        }

        console.log(`[AUTO-SEQUENCE] ✅ Created sequence "${seq.name}" with ${createdPrompts.length} prompts from conversation history`);
        return createdPrompts;
    } catch (err) {
        console.log('[AUTO-SEQUENCE] Error:', err.message);
        return [];
    }
}

async function insertDefaultPrompts(supabase) {
    const defaults = [
        { label: 'Friendly Check-in', prompt: 'Write a warm, friendly follow-up. Ask how they are doing and gently remind them about the conversation topic. Keep it casual like texting a friend.' },
        { label: 'Value Highlight', prompt: 'Write a follow-up that highlights a specific benefit or value related to what was discussed. Include one concrete detail that makes the offer compelling.' },
        { label: 'Gentle Urgency', prompt: 'Write a follow-up with gentle urgency. Mention limited availability or time sensitivity without being pushy. Keep the tone helpful and caring.' }
    ];

    try {
        const { data: seq } = await supabase
            .from('message_sequences')
            .insert({ name: 'Default Sequence', is_active: true, total_sent: 0, total_replies: 0 })
            .select()
            .single();

        if (!seq) return [];

        const created = [];
        for (let i = 0; i < defaults.length; i++) {
            const { data: p } = await supabase
                .from('message_prompts')
                .insert({
                    prompt_text: defaults[i].prompt,
                    label: defaults[i].label,
                    sequence_id: seq.id,
                    sequence_position: i + 1,
                    is_active: true,
                    total_sent: 0,
                    total_replies: 0
                })
                .select()
                .single();
            if (p) created.push(p);
        }
        console.log(`[AUTO-SEQUENCE] ✅ Created default sequence with ${created.length} prompts`);
        return created;
    } catch (err) {
        console.log('[AUTO-SEQUENCE] Default prompt insertion failed:', err.message);
        return [];
    }
}

/**
 * Process due scheduled messages AND AI intuition follow-ups
 * This endpoint is called by cron-job.org or similar services
 * Updated: 2026-02-22 - Thompson sampling + auto-sequence creation
 */
export default async function handler(req, res) {
    // Disable caching for this API route
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Allow both GET and POST for cron job compatibility
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('[SCHEDULED] Processing started at', new Date().toISOString());

    try {
        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(200).json({
                success: true,
                message: 'Supabase not configured - skipping',
                processed: 0
            });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        if (req.method === 'GET' && req.query?.action === 'counters') {
            const requestedWindow = Number.parseInt(req.query?.window_hours, 10);
            const summary = await fetchFollowupCounterSummary(supabase, requestedWindow);
            return res.status(200).json({
                success: true,
                counters: summary
            });
        }

        // Get all pending scheduled messages that are due
        const now = new Date().toISOString();
        const { data: pendingMessages, error: fetchError } = await supabase
            .from('scheduled_messages')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_for', now)
            .order('scheduled_for', { ascending: true })
            .limit(10);

        if (fetchError) {
            // Table might not exist yet - that's okay, return success
            console.log('[SCHEDULED] Table error (might not exist):', fetchError.code);
            return res.status(200).json({
                success: true,
                message: 'No scheduled_messages table or empty - this is normal if not using scheduled broadcasts',
                processed: 0
            });
        }

        // Initialize counters
        let processed = 0;
        let failed = 0;

        if (!pendingMessages || pendingMessages.length === 0) {
            console.log('[SCHEDULED] No pending scheduled_messages');
            // Don't return early - continue to AI follow-ups
        } else {
            // Process scheduled_messages
            for (const scheduledMsg of pendingMessages) {
                try {
                    // Mark as sending
                    await supabase
                        .from('scheduled_messages')
                        .update({ status: 'sending' })
                        .eq('id', scheduledMsg.id);

                    // Get page access token
                    const { data: page, error: pageError } = await supabase
                        .from('facebook_pages')
                        .select('page_access_token')
                        .eq('page_id', scheduledMsg.page_id)
                        .single();

                    if (pageError || !page) {
                        throw new Error('Page not found');
                    }

                    // Get recipients based on filter or selected list
                    let recipients = [];

                    if (scheduledMsg.recipient_ids && scheduledMsg.recipient_ids.length > 0) {
                        recipients = scheduledMsg.recipient_ids.map(id => ({ participant_id: id }));
                    } else {
                        // Get recipients based on filter type
                        let query = supabase
                            .from('facebook_conversations')
                            .select('participant_id')
                            .eq('page_id', scheduledMsg.page_id)
                            .or('is_archived.is.null,is_archived.eq.false');

                        switch (scheduledMsg.filter_type) {
                            case 'unbooked':
                            case 'not_booked':
                                query = query.is('linked_client_id', null);
                                break;
                            case 'not_pipeline':
                            case 'not_in_pipeline':
                                query = query.is('linked_client_id', null);
                                break;
                            case 'pipeline':
                            case 'in_pipeline':
                            case 'booked':
                                query = query.not('linked_client_id', 'is', null);
                                break;
                            case 'no_reply':
                                query = query.neq('last_reply_from', 'page');
                                break;
                            case 'tag':
                                if (scheduledMsg.filter_tag_id) {
                                    const { data: tagged } = await supabase
                                        .from('conversation_tag_assignments')
                                        .select('conversation_id')
                                        .eq('tag_id', scheduledMsg.filter_tag_id);

                                    if (tagged && tagged.length > 0) {
                                        const convIds = tagged.map(t => t.conversation_id);
                                        const { data: convs } = await supabase
                                            .from('facebook_conversations')
                                            .select('participant_id')
                                            .in('conversation_id', convIds);
                                        recipients = (convs || []).map(c => ({ participant_id: c.participant_id }));
                                    }
                                }
                                break;
                        }

                        if (scheduledMsg.filter_type !== 'tag' || recipients.length === 0) {
                            const { data: convs } = await query.limit(500);
                            recipients = (convs || []).map(c => ({ participant_id: c.participant_id }));
                        }
                    }

                    let sentCount = 0;
                    let failedCount = 0;

                    for (const recipient of recipients) {
                        try {
                            const response = await fetch(
                                `https://graph.facebook.com/v21.0/${scheduledMsg.page_id}/messages?access_token=${page.page_access_token}`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        recipient: { id: recipient.participant_id },
                                        message: { text: scheduledMsg.message_text },
                                        messaging_type: 'MESSAGE_TAG',
                                        tag: 'HUMAN_AGENT'
                                    })
                                }
                            );

                            if (response.ok) {
                                sentCount++;
                            } else {
                                failedCount++;
                            }

                            // Delay to avoid rate limiting
                            await new Promise(resolve => setTimeout(resolve, 200));
                        } catch (err) {
                            failedCount++;
                        }
                    }

                    // Update scheduled message status
                    await supabase
                        .from('scheduled_messages')
                        .update({
                            status: 'completed',
                            success_count: sentCount,
                            fail_count: failedCount,
                            processed_at: new Date().toISOString()
                        })
                        .eq('id', scheduledMsg.id);

                    processed++;
                } catch (err) {
                    console.error(`Error processing scheduled message ${scheduledMsg.id}:`, err);

                    // Mark as failed
                    await supabase
                        .from('scheduled_messages')
                        .update({
                            status: 'failed',
                            error_message: err.message,
                            processed_at: new Date().toISOString()
                        })
                        .eq('id', scheduledMsg.id);

                    failed++;
                }
            }
        } // End of if-else for scheduled_messages

        // ===== ALSO PROCESS AI INTUITION FOLLOW-UPS =====
        let aiFollowupsSent = 0;
        let aiFollowupsFailed = 0;

        try {
            // Check global bot enabled setting
            const { data: botSettings } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'ai_chatbot_config')
                .single();

            const botConfig = botSettings?.value || {};
            const silenceFollowupsEnabled = botConfig.enable_silence_followups !== false;
            const intuitionFollowupsEnabled = botConfig.enable_intuition_followups !== false;
            if (botConfig.global_bot_enabled === false) {
                console.log('[AI FOLLOWUP] ⛔ Global bot is DISABLED - cancelling all pending follow-ups');

                // Cancel ALL pending follow-ups so they don't get sent later
                const { data: cancelledCount, error: cancelError } = await supabase
                    .from('ai_followup_schedule')
                    .update({
                        status: 'cancelled',
                        error_message: 'Bot was globally disabled'
                    })
                    .eq('status', 'pending')
                    .select('id');

                if (cancelError) {
                    console.error('[AI FOLLOWUP] Error cancelling follow-ups:', cancelError.message);
                } else {
                    console.log(`[AI FOLLOWUP] ✅ Cancelled ${cancelledCount?.length || 0} pending follow-ups`);
                }

                return res.status(200).json({
                    success: true,
                    message: 'Bot is globally disabled - cancelled all pending follow-ups',
                    disabled: true,
                    processed,
                    failed,
                    aiFollowupsSent: 0,
                    aiFollowupsCancelled: cancelledCount?.length || 0
                });
            }

            // DEBUG: First, let's see ALL pending follow-ups to understand what's in the table
            const { data: allPendingFollowups, error: debugError } = await supabase
                .from('ai_followup_schedule')
                .select('id, conversation_id, scheduled_at, status, created_at, follow_up_type')
                .eq('status', 'pending')
                .order('scheduled_at', { ascending: true })
                .limit(10);

            console.log(`[AI FOLLOWUP] DEBUG - Pending follow-ups: ${allPendingFollowups?.length || 0}, error: ${debugError?.message || 'none'}`);
            if (allPendingFollowups && allPendingFollowups.length > 0) {
                const first = allPendingFollowups[0];
                const scheduledTime = new Date(first.scheduled_at);
                const nowTime = new Date(now);
                const minutesUntilDue = Math.round((scheduledTime - nowTime) / (1000 * 60));
                console.log(`[AI FOLLOWUP] DEBUG - First pending:`);
                console.log(`[AI FOLLOWUP]   scheduled_at: ${first.scheduled_at}`);
                console.log(`[AI FOLLOWUP]   created_at: ${first.created_at}`);
                console.log(`[AI FOLLOWUP]   follow_up_type: ${first.follow_up_type}`);
                console.log(`[AI FOLLOWUP]   current time: ${now}`);
                console.log(`[AI FOLLOWUP]   minutes until due: ${minutesUntilDue} (negative = overdue)`);
            }

            // Fallback: if no pending follow-ups exist, schedule silence-based ones
            if (silenceFollowupsEnabled && intuitionFollowupsEnabled && (!allPendingFollowups || allPendingFollowups.length === 0)) {
                const silenceHours = botConfig.intuition_silence_hours || 0.5;
                const cutoffTime = new Date(Date.now() - (silenceHours * 60 * 60 * 1000));

                const { data: silentConversations, error: silentError } = await supabase
                    .from('facebook_conversations')
                    .select(`
                        conversation_id,
                        page_id,
                        participant_name,
                        last_message_time,
                        ai_enabled,
                        human_takeover,
                        lead_status,
                        pipeline_stage,
                        intuition_followup_disabled,
                        best_time_scheduling_disabled,
                        meeting_scheduled
                    `)
                    .neq('ai_enabled', false)
                    .neq('human_takeover', true)
                    .neq('intuition_followup_disabled', true)
                    .neq('best_time_scheduling_disabled', true)
                    .neq('meeting_scheduled', true)
                    .not('lead_status', 'in', '(appointment_booked,converted)')
                    .neq('pipeline_stage', 'booked')
                    .lt('last_message_time', cutoffTime.toISOString())
                    .order('last_message_time', { ascending: true })
                    .limit(25);

                if (silentError) {
                    console.error('[AI FOLLOWUP] Fallback schedule error:', silentError.message);
                } else if (silentConversations && silentConversations.length > 0) {
                    console.log(`[AI FOLLOWUP] Fallback scheduling for ${silentConversations.length} silent conversations`);
                    const nowTime = new Date();

                    for (const conv of silentConversations) {
                        const lastTime = conv.last_message_time ? new Date(conv.last_message_time) : null;
                        if (!lastTime) {
                            continue;
                        }

                        const minutesSince = Math.floor((nowTime - lastTime) / (1000 * 60));
                        const hoursSince = Math.floor(minutesSince / 60);
                        const daysSince = Math.floor(hoursSince / 24);

                        let waitMinutes;
                        let reason;
                        let followUpType = 'intuition';

                        if (hoursSince < 1) {
                            waitMinutes = 30;
                            reason = `Hot lead! ${minutesSince} mins silent - quick follow-up`;
                        } else if (hoursSince < 4) {
                            waitMinutes = 60;
                            reason = `Warm lead, ${hoursSince}h silent - hourly follow-up`;
                        } else if (hoursSince < 24) {
                            waitMinutes = 360;
                            reason = `${hoursSince}h silent - gentle check-in every 6h`;
                        } else {
                            waitMinutes = 24 * 60;
                            reason = `${daysSince} day(s) silent - daily follow-up`;
                            followUpType = 'best_time';
                        }

                        const scheduledAt = new Date(nowTime.getTime() + waitMinutes * 60 * 1000);
                        const { error: scheduleError } = await supabase
                            .from('ai_followup_schedule')
                            .insert({
                                conversation_id: conv.conversation_id,
                                page_id: conv.page_id,
                                scheduled_at: scheduledAt.toISOString(),
                                follow_up_type: followUpType,
                                reason: reason,
                                status: 'pending'
                            });

                        if (scheduleError) {
                            console.error('[AI FOLLOWUP] Fallback schedule failed:', scheduleError.message);
                        }
                    }
                }
            }

            // Get pending AI follow-ups that are due
            const { data: aiFollowups, error: aiError } = await supabase
                .from('ai_followup_schedule')
                .select('*')
                .eq('status', 'pending')
                .lte('scheduled_at', now)
                .order('scheduled_at', { ascending: true })
                .limit(50);

            console.log(`[AI FOLLOWUP] Query result: ${aiFollowups?.length || 0} follow-ups, error: ${aiError?.message || 'none'}`);

            if (aiError) {
                console.error('[AI FOLLOWUP] Query error:', aiError);
            }

            if (!aiError && aiFollowups && aiFollowups.length > 0) {
                console.log(`[AI FOLLOWUP] Found ${aiFollowups.length} due follow-ups to send`);

                for (const followup of aiFollowups) {
                    try {
                        // Get page access token
                        const { data: page } = await supabase
                            .from('facebook_pages')
                            .select('page_access_token')
                            .eq('page_id', followup.page_id)
                            .single();

                        if (!page?.page_access_token) {
                            console.log(`[AI FOLLOWUP] No token for page ${followup.page_id}`);
                            await supabase
                                .from('ai_followup_schedule')
                                .update({ status: 'failed', error_message: 'No page token' })
                                .eq('id', followup.id);
                            aiFollowupsFailed++;
                            continue;
                        }

                        // Get conversation details and check if AI is enabled
                        const { data: conversation } = await supabase
                            .from('facebook_conversations')
                            .select('participant_id, participant_name, ai_enabled, lead_status, pipeline_stage, human_takeover, intuition_followup_disabled, best_time_scheduling_disabled, last_message_time')
                            .eq('conversation_id', followup.conversation_id)
                            .single();

                        // Check if AI is disabled or human takeover is active
                        if (conversation?.ai_enabled === false || conversation?.human_takeover === true) {
                            console.log(`[AI FOLLOWUP] AI disabled/human takeover for ${followup.conversation_id} - cancelling`);
                            await supabase
                                .from('ai_followup_schedule')
                                .update({ status: 'cancelled', error_message: 'AI disabled or human takeover active' })
                                .eq('id', followup.id);
                            continue;
                        }

                        // Check if intuition follow-ups are specifically disabled (bot still responds to messages)
                        // Read receipt follow-ups are exempt — they should work even if intuition is disabled
                        const isReadReceipt = followup.follow_up_type === 'read_receipt'
                            || (typeof followup.reason === 'string' && followup.reason.startsWith('read_receipt:'));
                        if (conversation?.intuition_followup_disabled === true && !isReadReceipt) {
                            console.log(`[AI FOLLOWUP] Intuition follow-ups disabled for ${followup.conversation_id} - cancelling`);
                            await supabase
                                .from('ai_followup_schedule')
                                .update({ status: 'cancelled', error_message: 'Intuition follow-ups disabled by user' })
                                .eq('id', followup.id);
                            continue;
                        }

                        // Check if best time scheduling is disabled (for best_time type follow-ups)
                        if (followup.follow_up_type === 'best_time' && conversation?.best_time_scheduling_disabled === true) {
                            console.log(`[AI FOLLOWUP] Best time scheduling disabled for ${followup.conversation_id} - cancelling`);
                            await supabase
                                .from('ai_followup_schedule')
                                .update({ status: 'cancelled', error_message: 'Best time scheduling disabled by user' })
                                .eq('id', followup.id);
                            continue;
                        }

                        // Check if customer is already booked/converted - skip follow-ups
                        // Check BOTH lead_status AND pipeline_stage (booking sets pipeline_stage to 'booked')
                        if (conversation?.lead_status === 'appointment_booked' ||
                            conversation?.lead_status === 'converted' ||
                            conversation?.pipeline_stage === 'booked') {
                            console.log(`[AI FOLLOWUP] Customer is booked/converted (lead_status=${conversation.lead_status}, pipeline=${conversation.pipeline_stage}) - cancelling follow-up for ${followup.conversation_id}`);
                            await supabase
                                .from('ai_followup_schedule')
                                .update({ status: 'cancelled', error_message: `Customer already booked (pipeline_stage: ${conversation.pipeline_stage || 'N/A'}, lead_status: ${conversation.lead_status || 'N/A'})` })
                                .eq('id', followup.id);
                            continue;
                        }

                        const recipientId = conversation?.participant_id;
                        const contactName = getFirstName(conversation?.participant_name) || conversation?.participant_name || 'there';

                        if (!recipientId) {
                            console.log(`[AI FOLLOWUP] No recipient for ${followup.conversation_id}`);
                            await supabase
                                .from('ai_followup_schedule')
                                .update({ status: 'failed', error_message: 'No recipient ID' })
                                .eq('id', followup.id);
                            continue;
                        }

                        // Check 7-day window - HUMAN_AGENT tag only works within 7 days of last customer message
                        let daysSinceLastMsg = null;
                        let outside7DayWindow = false;

                        const { data: lastCustomerMsg } = await supabase
                            .from('facebook_messages')
                            .select('timestamp')
                            .eq('conversation_id', followup.conversation_id)
                            .eq('is_from_page', false)
                            .order('timestamp', { ascending: false })
                            .limit(1)
                            .single();

                        const windowStatus = evaluateSevenDayWindow({
                            lastInboundTimestamp: lastCustomerMsg?.timestamp,
                            conversationLastMessageTimestamp: conversation?.last_message_time,
                            now: new Date(now)
                        });

                        daysSinceLastMsg = windowStatus.daysSinceLastMsg;
                        outside7DayWindow = windowStatus.outside7DayWindow;

                        if (outside7DayWindow) {
                            const dayLabel = Number.isFinite(daysSinceLastMsg)
                                ? `${daysSinceLastMsg.toFixed(1)} days`
                                : 'unknown duration';
                            console.log(`[AI FOLLOWUP] Outside 7-day window (${dayLabel}) for ${followup.conversation_id} - switching to utility template (${windowStatus.referenceSource || 'unknown source'})`);
                        }

                        // Generate AI-powered contextual follow-up
                        // Load admin AI config for prompt and settings
                        const { data: aiSettings } = await supabase
                            .from('settings')
                            .select('value')
                            .eq('key', 'ai_chatbot_config')
                            .single();

                        const aiConfig = aiSettings?.value || {};
                        const systemPrompt = aiConfig.system_prompt || 'You are a friendly AI assistant.';
                        const knowledgeBase = aiConfig.knowledge_base || '';
                        const language = aiConfig.language || 'Taglish';
                        const utilityConfig = aiConfig.utility_followup_templates || {};
                        const utilityLanguage = utilityConfig.language || 'en_US';
                        const utilityMaxBodyChars = Number.isFinite(utilityConfig.max_body_chars)
                            ? utilityConfig.max_body_chars
                            : 320;
                        const utilityFollowupsEnabled = utilityConfig.enabled !== false;

                        if (outside7DayWindow && !utilityFollowupsEnabled) {
                            await supabase
                                .from('ai_followup_schedule')
                                .update({ status: 'cancelled', error_message: 'Utility follow-ups disabled for contacts outside 7-day window' })
                                .eq('id', followup.id);
                            continue;
                        }

                        // ============================================
                        // A/B TESTING: Real-time prompt ranking
                        // ============================================
                        let selectedPrompt = null;
                        let selectedPromptId = null;
                        let selectedSequenceId = null;
                        let selectedVariantLabel = 'default';
                        let abSequenceStep = 1;
                        let followUpInstruction = 'Generate a natural follow-up message. Reference what was discussed, keep it short, feel natural, and gently move the conversation forward.';

                        try {
                            // Count previous sends to determine current step
                            const { count: prevSent } = await supabase
                                .from('message_ab_results')
                                .select('id', { count: 'exact', head: true })
                                .eq('conversation_id', followup.conversation_id);
                            abSequenceStep = (prevSent || 0) + 1;

                            // Pull all active prompt instructions and rank by live performance
                            const { data: activePrompts, error: promptError } = await supabase
                                .from('message_prompts')
                                .select('id, sequence_id, prompt_text, label, total_sent, total_replies, created_at')
                                .eq('is_active', true);

                            if (promptError) {
                                throw promptError;
                            }

                            const rankedPrompts = rankPromptsByReplyPerformance(activePrompts || []);
                            const promptPlan = selectPromptForRealtimeStep(rankedPrompts, abSequenceStep);

                            if (promptPlan?.selectedPrompt) {
                                selectedPrompt = promptPlan.selectedPrompt;
                                selectedPromptId = selectedPrompt.id;
                                selectedSequenceId = selectedPrompt.sequence_id || null;
                                selectedVariantLabel = promptPlan.variantLabel || selectedPrompt.label || 'live-ranked';
                                followUpInstruction = promptPlan.followUpInstruction || selectedPrompt.prompt_text;

                                console.log(
                                    `[AI FOLLOWUP] ⚡ Live prompt selection: step=${abSequenceStep}, mode=${promptPlan.selectionMode}, prompt="${selectedPrompt.label || 'unlabeled'}", score=${(selectedPrompt.replyRate * 100).toFixed(1)}%`
                                );
                            } else {
                                // Auto-create prompts from conversation history
                                console.log('[AI FOLLOWUP] ⚡ No active prompts found — auto-creating from history...');
                                const autoCreated = await autoCreatePromptsFromHistory(supabase);
                                if (autoCreated.length > 0) {
                                    const reRanked = rankPromptsByReplyPerformance(autoCreated);
                                    const rePlan = selectPromptForRealtimeStep(reRanked, abSequenceStep);
                                    if (rePlan?.selectedPrompt) {
                                        selectedPrompt = rePlan.selectedPrompt;
                                        selectedPromptId = selectedPrompt.id;
                                        selectedSequenceId = selectedPrompt.sequence_id || null;
                                        selectedVariantLabel = rePlan.variantLabel || selectedPrompt.label || 'auto-created';
                                        followUpInstruction = rePlan.followUpInstruction || selectedPrompt.prompt_text;
                                        console.log(`[AI FOLLOWUP] ⚡ Using auto-created prompt: "${selectedPrompt.label}"`);
                                    }
                                } else {
                                    console.log('[AI FOLLOWUP] ⚡ Auto-creation returned no prompts, using default instruction');
                                }
                            }
                        } catch (abErr) {
                            console.log(`[AI FOLLOWUP] Live prompt selection error, using default: ${abErr.message}`);
                        }

                        // Get ALL conversation messages for context (no limit)
                        const { data: recentMessages } = await supabase
                            .from('facebook_messages')
                            .select('message_text, is_from_page, timestamp')
                            .eq('conversation_id', followup.conversation_id)
                            .order('timestamp', { ascending: false });

                        // Build conversation context
                        const conversationContext = (recentMessages || [])
                            .reverse()
                            .map(m => `${m.is_from_page ? 'AI' : 'Customer'}: ${m.message_text || '[attachment]'}`)
                            .join('\n');

                        // Generate contextual follow-up using AI
                        let message;
                        const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;

                        if (NVIDIA_API_KEY && conversationContext) {
                            // Determine if this is a read-receipt triggered follow-up
                            const isReadTriggered = followup.follow_up_type === 'read_receipt'
                                || (typeof followup.reason === 'string' && followup.reason.startsWith('read_receipt:'));
                            const readReceiptContext = isReadTriggered
                                ? `\n## IMPORTANT CONTEXT: The customer just opened and READ your last message moments ago but hasn't replied yet. They are likely active on their phone RIGHT NOW. This is a perfect time to gently nudge them. Do NOT say "I saw you read my message" — just follow up naturally as if you're catching them at a good time.\n`
                                : '';

                            try {
                                const followUpPrompt = `${systemPrompt}

${knowledgeBase ? `## Knowledge Base:\n${knowledgeBase}\n` : ''}
## Language: Respond in ${language}
${language.toLowerCase().includes('taglish') ? `- IMPORTANT: Use Taglish (mix Filipino and English naturally in sentences). Example: "Hi! Kamusta ka na? Just checking in about yung property na tinitignan mo."
- NEVER respond in pure English only - always mix Filipino words like po, na, yung, naman, din, ba, etc.` : ''}

## Task: Generate a follow-up message for this conversation.
${isReadTriggered ? 'The customer just saw your message and is likely active right now.' : 'The customer hasn\'t responded in a while.'}
${readReceiptContext}
## Your Follow-up Instructions:
${followUpInstruction}

## Guidelines:
1. References what was discussed (don't repeat word-for-word)
2. Keeps it short (1-2 sentences like a real text message)
3. Feels natural, not automated
4. Gently moves the conversation forward
${isReadTriggered ? '5. Since they just saw your message, be timely and conversational — like texting a friend who just came online' : ''}

## Recent Conversation:
${conversationContext}

## Customer Name: ${contactName}

Generate ONLY the follow-up message, nothing else:`;

                                const aiResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${NVIDIA_API_KEY}`
                                    },
                                    body: JSON.stringify({
                                        model: 'meta/llama-3.1-8b-instruct',
                                        messages: [{ role: 'user', content: followUpPrompt }],
                                        temperature: 0.8,
                                        max_tokens: 150
                                    })
                                });

                                if (aiResponse.ok) {
                                    const aiData = await aiResponse.json();
                                    const generatedMessage = aiData.choices?.[0]?.message?.content?.trim();
                                    if (generatedMessage && generatedMessage.length > 5) {
                                        message = generatedMessage;
                                        console.log(`[AI FOLLOWUP] Generated contextual message: ${message.substring(0, 50)}...`);
                                    }
                                }
                            } catch (aiErr) {
                                console.log(`[AI FOLLOWUP] AI generation failed, using fallback: ${aiErr.message}`);
                            }
                        }

                        // Fallback to simple messages if AI fails
                        if (!message) {
                            const fallbackMessages = [
                                `Hi ${contactName}! 👋 Kamusta? May tanong ka pa ba?`,
                                `Hey ${contactName}! 😊 Interested ka pa? Let me know lang!`,
                                `Hi ${contactName}! Follow up lang po — happy to help if you need anything!`
                            ];
                            message = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
                            console.log(`[AI FOLLOWUP] Using fallback message`);
                        }

                        const useUtilityTemplate = utilityFollowupsEnabled && outside7DayWindow;
                        let utilityTemplate = null;
                        let utilityText = null;

                        if (useUtilityTemplate) {
                            utilityText = sanitizeUtilityText(message, utilityMaxBodyChars);
                            if (!utilityText) {
                                await supabase
                                    .from('ai_followup_schedule')
                                    .update({ status: 'failed', error_message: 'Utility message was empty after sanitization' })
                                    .eq('id', followup.id);
                                aiFollowupsFailed++;
                                continue;
                            }

                            const { template, error: templateError } = await selectApprovedUtilityTemplate(
                                supabase,
                                followup.page_id,
                                utilityLanguage
                            );

                            if (templateError) {
                                console.log(`[AI FOLLOWUP] Utility template query error: ${templateError}`);
                            }

                            if (!template) {
                                await maybeAutoCreateUtilityTemplate({
                                    supabase,
                                    pageId: followup.page_id,
                                    pageAccessToken: page.page_access_token,
                                    language: utilityLanguage,
                                    messageText: message,
                                    config: utilityConfig,
                                    nvidiaKey: NVIDIA_API_KEY,
                                    wrapperLanguage: language
                                });

                                await supabase
                                    .from('ai_followup_schedule')
                                    .update({ status: 'failed', error_message: 'No approved utility templates available' })
                                    .eq('id', followup.id);
                                aiFollowupsFailed++;
                                continue;
                            }

                            utilityTemplate = template;
                        }

                        // === MESSAGE SPLITTING (same logic as webhook.js) ===
                        let messageParts = [];

                        if (useUtilityTemplate) {
                            messageParts = [utilityText];
                        } else if (message.includes('|||')) {
                            // AI decided to split the message using ||| delimiter
                            messageParts = message.split('|||').map(p => p.trim()).filter(p => p.length > 0);
                            console.log(`[AI FOLLOWUP] AI split into ${messageParts.length} parts using |||`);
                        } else {
                            // FALLBACK: Force split by sentences if response is long
                            const sentences = message.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);

                            if (sentences.length <= 2) {
                                // Short enough, send as one message
                                messageParts.push(message);
                            } else {
                                // Group sentences into parts (2-3 sentences each)
                                let currentPart = '';
                                let sentenceCount = 0;

                                for (const sentence of sentences) {
                                    currentPart += (currentPart ? ' ' : '') + sentence;
                                    sentenceCount++;

                                    if (sentenceCount >= 2) {
                                        messageParts.push(currentPart.trim());
                                        currentPart = '';
                                        sentenceCount = 0;
                                    }
                                }

                                // Add remaining sentences
                                if (currentPart.trim()) {
                                    messageParts.push(currentPart.trim());
                                }

                                console.log(`[AI FOLLOWUP] Force split into ${messageParts.length} parts by sentences`);
                            }
                        }

                        console.log(`[AI FOLLOWUP] Sending ${messageParts.length} message part(s) to ${contactName}`);

                        // Send each message part with delays for natural chat feel
                        let allPartsSent = true;
                        for (let i = 0; i < messageParts.length; i++) {
                            const part = messageParts[i];

                            // Add delay between messages for natural chat feel
                            if (i > 0) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }

                            console.log(`[AI FOLLOWUP] Sending part ${i + 1}/${messageParts.length}: "${part.substring(0, 50)}..."`);

                            if (useUtilityTemplate) {
                                const sendResult = await sendUtilityTemplateMessage({
                                    pageId: followup.page_id,
                                    pageAccessToken: page.page_access_token,
                                    recipientId,
                                    templateName: utilityTemplate.template_name,
                                    language: utilityTemplate.language || utilityLanguage,
                                    templateBody: utilityTemplate.template_body,
                                    bodyText: part
                                });

                                if (!sendResult.ok) {
                                    console.error(`[AI FOLLOWUP] Utility send failed for ${followup.conversation_id}:`, sendResult.error);
                                    allPartsSent = false;
                                    break;
                                }

                                // Save sent utility message so read-receipt triggers can find latest outbound
                                try {
                                    if (sendResult.data?.message_id) {
                                        await supabase.from('facebook_messages').insert({
                                            message_id: sendResult.data.message_id,
                                            conversation_id: followup.conversation_id,
                                            sender_id: followup.page_id,
                                            message_text: part,
                                            timestamp: new Date().toISOString(),
                                            is_from_page: true,
                                            is_read: true,
                                            sent_source: 'ai_followup_utility'
                                        });
                                    }
                                } catch (saveErr) {
                                    console.log('[AI FOLLOWUP] Utility message save failed (non-fatal):', saveErr.message);
                                }
                            } else {
                                const response = await fetch(
                                    `https://graph.facebook.com/v21.0/${followup.page_id}/messages?access_token=${page.page_access_token}`,
                                    {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            recipient: { id: recipientId },
                                            message: { text: part },
                                            messaging_type: 'MESSAGE_TAG',
                                            tag: 'HUMAN_AGENT'
                                        })
                                    }
                                );

                                if (!response.ok) {
                                    const err = await response.json();
                                    console.error(`[AI FOLLOWUP] Failed to send part ${i + 1}:`, err.error?.message);
                                    allPartsSent = false;
                                    break;
                                }

                                // Save sent message to facebook_messages so read receipts can find it
                                try {
                                    const sendResult = await response.json();
                                    if (sendResult.message_id) {
                                        await supabase.from('facebook_messages').insert({
                                            message_id: sendResult.message_id,
                                            conversation_id: followup.conversation_id,
                                            sender_id: followup.page_id,
                                            message_text: part,
                                            timestamp: new Date().toISOString(),
                                            is_from_page: true,
                                            is_read: true,
                                            sent_source: 'ai_followup',
                                        });
                                    }
                                } catch (saveErr) {
                                    console.log('[AI FOLLOWUP] Message save failed (non-fatal):', saveErr.message);
                                }
                            }

                            // Small delay between messages to maintain order
                            if (i < messageParts.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        }

                        if (allPartsSent) {
                            if (useUtilityTemplate) {
                                await markUtilityTemplateUsed(supabase, utilityTemplate);
                                await maybeAutoCreateUtilityTemplate({
                                    supabase,
                                    pageId: followup.page_id,
                                    pageAccessToken: page.page_access_token,
                                    language: utilityLanguage,
                                    messageText: message,
                                    config: utilityConfig,
                                    nvidiaKey: NVIDIA_API_KEY,
                                    wrapperLanguage: language
                                });
                            }

                            // Mark as sent
                            await supabase
                                .from('ai_followup_schedule')
                                .update({
                                    status: 'sent',
                                    sent_at: new Date().toISOString()
                                })
                                .eq('id', followup.id);

                            console.log(`[AI FOLLOWUP] ✅ Sent ${messageParts.length} part(s) to ${contactName}`);
                            aiFollowupsSent++;

                            // ============================================
                            // A/B TESTING: Record result (sequence + prompt)
                            // ============================================
                            if (selectedPromptId || selectedSequenceId) {
                                try {
                                    // Record A/B test result with sequence context
                                    await supabase.from('message_ab_results').insert({
                                        prompt_id: selectedPromptId,
                                        sequence_id: selectedSequenceId,
                                        conversation_id: followup.conversation_id,
                                        variant_label: selectedVariantLabel,
                                        message_sent: message,
                                        sent_at: new Date().toISOString(),
                                        sequence_step: abSequenceStep
                                    });
                                    // Increment total_sent on prompt
                                    if (selectedPromptId) {
                                        const newSent = (selectedPrompt?.total_sent || 0) + 1;
                                        await supabase.from('message_prompts')
                                            .update({ total_sent: newSent })
                                            .eq('id', selectedPromptId);
                                    }
                                    // Increment total_sent on sequence
                                    if (selectedSequenceId) {
                                        const { data: seqData } = await supabase.from('message_sequences')
                                            .select('total_sent')
                                            .eq('id', selectedSequenceId)
                                            .single();
                                        await supabase.from('message_sequences')
                                            .update({ total_sent: (seqData?.total_sent || 0) + 1 })
                                            .eq('id', selectedSequenceId);
                                    }
                                    console.log(`[AI FOLLOWUP] 📊 A/B result recorded: seq=${selectedSequenceId?.substring(0, 8)}, step=${abSequenceStep}, prompt=${selectedPrompt?.label || 'default'}`);
                                } catch (abRecordErr) {
                                    console.log(`[AI FOLLOWUP] A/B record error (non-fatal): ${abRecordErr.message}`);
                                }
                            }

                            // Check if there's already a pending follow-up before scheduling another
                            const { data: existingPending } = await supabase
                                .from('ai_followup_schedule')
                                .select('id')
                                .eq('conversation_id', followup.conversation_id)
                                .eq('status', 'pending')
                                .limit(1);

                            // Only schedule the NEXT follow-up if no pending one exists
                            if (!existingPending || existingPending.length === 0) {
                                const { data: lastInbound } = await supabase
                                    .from('facebook_messages')
                                    .select('timestamp')
                                    .eq('conversation_id', followup.conversation_id)
                                    .eq('is_from_page', false)
                                    .order('timestamp', { ascending: false })
                                    .limit(1)
                                    .single();

                                let sentCountQuery = supabase
                                    .from('ai_followup_schedule')
                                    .select('id', { count: 'exact', head: true })
                                    .eq('conversation_id', followup.conversation_id)
                                    .eq('status', 'sent');

                                if (lastInbound?.timestamp) {
                                    sentCountQuery = sentCountQuery.gte('sent_at', new Date(lastInbound.timestamp).toISOString());
                                }

                                const { count: sentCountSinceLastInbound } = await sentCountQuery;
                                const nextStep = (sentCountSinceLastInbound || 0) + 1;
                                const aggressivenessShift = Number.isFinite(aiConfig.intuition_fibonacci_shift)
                                    ? aiConfig.intuition_fibonacci_shift
                                    : 0;
                                const fibonacciHours = getFibonacciDelayHours(nextStep, aggressivenessShift);

                                let nextFollowupTime = new Date(Date.now() + fibonacciHours * 60 * 60 * 1000);
                                let nextFollowupType = 'intuition';
                                let scheduleReason = `Auto-scheduled Fibonacci step ${nextStep} (${fibonacciHours}h delay)`;

                                if (shouldAlignToBestTime(fibonacciHours) && conversation?.best_time_scheduling_disabled !== true) {
                                    const bestHour = await getBestContactHour(supabase, followup.conversation_id);
                                    nextFollowupTime = alignToHourOnOrAfter(nextFollowupTime, bestHour);
                                    nextFollowupType = 'best_time';
                                    scheduleReason += ` aligned to best hour ${bestHour}:00`;
                                }

                                const { error: scheduleError } = await supabase
                                    .from('ai_followup_schedule')
                                    .insert({
                                        conversation_id: followup.conversation_id,
                                        page_id: followup.page_id,
                                        scheduled_at: nextFollowupTime.toISOString(),
                                        follow_up_type: nextFollowupType,
                                        reason: scheduleReason,
                                        status: 'pending'
                                    });

                                if (scheduleError) {
                                    console.log(`[AI FOLLOWUP] Could not schedule next: ${scheduleError.message}`);
                                } else {
                                    console.log(`[AI FOLLOWUP] 📅 Next follow-up (step ${nextStep}) in ${fibonacciHours}h at ${nextFollowupTime.toISOString()}`);
                                }
                            } else {
                                console.log(`[AI FOLLOWUP] ⏭️ Pending follow-up already exists for ${followup.conversation_id} - skipping reschedule`);
                            }
                        } else {
                            // Some message parts failed to send
                            console.error(`[AI FOLLOWUP] Failed to send all message parts`);

                            await supabase
                                .from('ai_followup_schedule')
                                .update({
                                    status: 'failed',
                                    error_message: 'Failed to send all message parts'
                                })
                                .eq('id', followup.id);

                            aiFollowupsFailed++;
                        }
                    } catch (err) {
                        console.error(`[AI FOLLOWUP] Error:`, err.message);
                        aiFollowupsFailed++;
                    }
                }
            }
        } catch (aiProcessError) {
            console.log('[AI FOLLOWUP] Error processing:', aiProcessError.message);
        }

        return res.status(200).json({
            success: true,
            message: 'Scheduled messages processed',
            processed,
            failed,
            aiFollowupsSent,
            aiFollowupsFailed
        });
    } catch (error) {
        console.error('Error processing scheduled messages:', error);
        return res.status(200).json({
            success: false,
            error: error.message,
            processed: 0
        });
    }
}
