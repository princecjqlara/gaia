import { createClient } from '@supabase/supabase-js';

/**
 * Process due scheduled messages AND AI intuition follow-ups
 * This endpoint is called by cron-job.org or similar services
 * Updated: 2026-02-15 - Added A/B testing with Thompson Sampling for follow-up prompts
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
                                        tag: 'ACCOUNT_UPDATE'
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
                            .select('participant_id, participant_name, ai_enabled, lead_status, pipeline_stage, human_takeover, intuition_followup_disabled, best_time_scheduling_disabled')
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
                        if (conversation?.intuition_followup_disabled === true) {
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
                        const contactName = conversation?.participant_name || 'there';

                        if (!recipientId) {
                            console.log(`[AI FOLLOWUP] No recipient for ${followup.conversation_id}`);
                            await supabase
                                .from('ai_followup_schedule')
                                .update({ status: 'failed', error_message: 'No recipient ID' })
                                .eq('id', followup.id);
                            continue;
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

                        // ============================================
                        // A/B TESTING: Sequence-Based Thompson Sampling
                        // ============================================
                        let selectedPrompt = null;
                        let selectedPromptId = null;
                        let selectedSequenceId = null;
                        let abSequenceStep = 1;

                        try {
                            // 1. Count previous messages to determine which step we're on
                            const { count: prevSent } = await supabase
                                .from('message_ab_results')
                                .select('id', { count: 'exact', head: true })
                                .eq('conversation_id', followup.conversation_id);
                            abSequenceStep = (prevSent || 0) + 1;

                            // 2. Check if contact already has an assigned sequence
                            const { data: prevResult } = await supabase
                                .from('message_ab_results')
                                .select('sequence_id')
                                .eq('conversation_id', followup.conversation_id)
                                .not('sequence_id', 'is', null)
                                .order('sent_at', { ascending: false })
                                .limit(1)
                                .single();

                            let chosenSequenceId = prevResult?.sequence_id || null;

                            // 3. If no assigned sequence, use Thompson Sampling to pick one
                            if (!chosenSequenceId) {
                                const { data: activeSequences } = await supabase
                                    .from('message_sequences')
                                    .select('id, label, total_sent, total_replies')
                                    .eq('is_active', true);

                                if (activeSequences && activeSequences.length > 0) {
                                    const sampleGamma = (shape) => {
                                        let sum = 0;
                                        for (let i = 0; i < Math.ceil(shape); i++) {
                                            sum -= Math.log(Math.random());
                                        }
                                        return sum;
                                    };
                                    const samples = activeSequences.map(seq => {
                                        const successes = seq.total_replies || 0;
                                        const failures = Math.max(0, (seq.total_sent || 0) - successes);
                                        const x = sampleGamma(successes + 1);
                                        const y = sampleGamma(failures + 1);
                                        return { seq, sample: x / (x + y) };
                                    });
                                    samples.sort((a, b) => b.sample - a.sample);
                                    chosenSequenceId = samples[0].seq.id;
                                    console.log(`[AI FOLLOWUP] 🧪 Thompson Sampling selected sequence "${samples[0].seq.label}" (score: ${samples[0].sample.toFixed(3)}, ${activeSequences.length} sequences)`);
                                }
                            }

                            // 4. Get the prompt at the correct step for this sequence
                            if (chosenSequenceId) {
                                selectedSequenceId = chosenSequenceId;
                                const { data: stepPrompt } = await supabase
                                    .from('message_prompts')
                                    .select('id, prompt_text, label, total_sent, total_replies')
                                    .eq('sequence_id', chosenSequenceId)
                                    .eq('sequence_position', abSequenceStep)
                                    .eq('is_active', true)
                                    .single();

                                if (stepPrompt) {
                                    selectedPrompt = stepPrompt;
                                    selectedPromptId = stepPrompt.id;
                                    console.log(`[AI FOLLOWUP] 🧪 Using step ${abSequenceStep} prompt: "${stepPrompt.label || 'unlabeled'}"`);
                                } else {
                                    console.log(`[AI FOLLOWUP] 🧪 No prompt at step ${abSequenceStep} — sequence exhausted, using default`);
                                }
                            }
                        } catch (abErr) {
                            console.log(`[AI FOLLOWUP] A/B selection error, using default: ${abErr.message}`);
                        }

                        // Build follow-up instruction from selected prompt or use default
                        const followUpInstruction = selectedPrompt
                            ? selectedPrompt.prompt_text
                            : 'Generate a natural follow-up message. Reference what was discussed, keep it short, feel natural, and gently move the conversation forward.';

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
                            try {
                                const followUpPrompt = `${systemPrompt}

${knowledgeBase ? `## Knowledge Base:\n${knowledgeBase}\n` : ''}
## Language: Respond in ${language}

## Task: Generate a follow-up message for this conversation.
The customer hasn't responded in a while.

## Your Follow-up Instructions:
${followUpInstruction}

## Guidelines:
1. References what was discussed (don't repeat word-for-word)
2. Keeps it short (1-2 sentences like a real text message)
3. Feels natural, not automated
4. Gently moves the conversation forward

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
                                `Hi ${contactName}! 👋 Just checking in - any questions?`,
                                `Hey ${contactName}! 😊 Still interested? Let me know!`,
                                `Hi ${contactName}! Following up - happy to help if you need anything!`
                            ];
                            message = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
                            console.log(`[AI FOLLOWUP] Using fallback message`);
                        }

                        // === MESSAGE SPLITTING (same logic as webhook.js) ===
                        let messageParts = [];

                        if (message.includes('|||')) {
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

                            const response = await fetch(
                                `https://graph.facebook.com/v21.0/${followup.page_id}/messages?access_token=${page.page_access_token}`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        recipient: { id: recipientId },
                                        message: { text: part },
                                        messaging_type: 'MESSAGE_TAG',
                                        tag: 'ACCOUNT_UPDATE'
                                    })
                                }
                            );

                            if (!response.ok) {
                                const err = await response.json();
                                console.error(`[AI FOLLOWUP] Failed to send part ${i + 1}:`, err.error?.message);
                                allPartsSent = false;
                                break;
                            }

                            // Small delay between messages to maintain order
                            if (i < messageParts.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        }

                        if (allPartsSent) {
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
                                        variant_label: selectedPrompt?.label || 'default',
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
                                // Get last customer message time to determine appropriate interval
                                const { data: convData } = await supabase
                                    .from('facebook_conversations')
                                    .select('last_message_time, last_message_from_page')
                                    .eq('conversation_id', followup.conversation_id)
                                    .single();

                                const lastMsgTime = convData?.last_message_time ? new Date(convData.last_message_time) : null;
                                const now = new Date();
                                const hoursSinceLastMsg = lastMsgTime ? (now - lastMsgTime) / (1000 * 60 * 60) : 999;

                                // Determine next follow-up time based on graduated strategy:
                                // 0-1h: 30min, 1-4h: 1h, 4-24h: 6h, 24h+: 24h (once per day)
                                let nextIntervalHours;
                                if (hoursSinceLastMsg < 1) {
                                    nextIntervalHours = 0.5; // 30 mins
                                } else if (hoursSinceLastMsg < 4) {
                                    nextIntervalHours = 1;
                                } else if (hoursSinceLastMsg < 24) {
                                    nextIntervalHours = 6;
                                } else {
                                    nextIntervalHours = 24; // Once per day for 24h+ silent contacts
                                }

                                const nextFollowupTime = new Date(Date.now() + nextIntervalHours * 60 * 60 * 1000);
                                const { error: scheduleError } = await supabase
                                    .from('ai_followup_schedule')
                                    .insert({
                                        conversation_id: followup.conversation_id,
                                        page_id: followup.page_id,
                                        scheduled_at: nextFollowupTime.toISOString(),
                                        follow_up_type: hoursSinceLastMsg >= 24 ? 'best_time' : 'intuition',
                                        reason: `Auto-scheduled: ${nextIntervalHours}h interval (${Math.round(hoursSinceLastMsg)}h since last customer msg)`,
                                        status: 'pending'
                                    });

                                if (scheduleError) {
                                    console.log(`[AI FOLLOWUP] Could not schedule next: ${scheduleError.message}`);
                                } else {
                                    console.log(`[AI FOLLOWUP] 📅 Next follow-up in ${nextIntervalHours}h at ${nextFollowupTime.toISOString()}`);
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
