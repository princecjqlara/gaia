import { createClient } from "@supabase/supabase-js";

let supabase;
function getSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        if (!url || !key) return null;
        supabase = createClient(url, key);
    }
    return supabase;
}

/**
 * Analyze contact message timestamps to find the hour they're most active.
 * Returns the best hour (0-23) in Asia/Manila timezone.
 */
function getBestContactHour(messages) {
    if (!messages || messages.length === 0) return null; // No data — caller should use neighbors

    const hourCounts = new Array(24).fill(0);

    for (const msg of messages) {
        try {
            const manilaTime = new Date(
                new Date(msg.timestamp).toLocaleString("en-US", { timeZone: "Asia/Manila" })
            );
            hourCounts[manilaTime.getHours()]++;
        } catch { /* skip bad timestamps */ }
    }

    let bestHour = null;
    let maxCount = 0;
    for (let h = 0; h < 24; h++) {
        if (hourCounts[h] > maxCount) {
            maxCount = hourCounts[h];
            bestHour = h;
        }
    }

    return bestHour;
}

/**
 * Recurring Notification Follow-up Cron
 * 
 * Runs daily. For contacts who:
 * 1. Have an active recurring notification token
 * 2. Haven't received a follow-up yet
 * 3. Have been silent for 7+ days
 * 4. Current time matches their best contact hour (±1h)
 * 
 * Sends exactly 1 personalized follow-up hook message, then marks as sent.
 */
export default async function handler(req, res) {
    console.log("[RECURRING-FOLLOWUP] Starting...");

    const db = getSupabase();
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // Find active tokens where follow-up hasn't been sent
        const { data: tokens, error: tokenErr } = await db
            .from("recurring_notification_tokens")
            .select("id, conversation_id, participant_id, page_id, token, frequency")
            .eq("token_status", "active")
            .eq("followup_sent", false);

        if (tokenErr) {
            console.error("[RECURRING-FOLLOWUP] Token query error:", tokenErr.message);
            return res.status(500).json({ error: tokenErr.message });
        }

        if (!tokens || tokens.length === 0) {
            console.log("[RECURRING-FOLLOWUP] No pending follow-ups");
            return res.status(200).json({ sent: 0, message: "No pending follow-ups" });
        }

        console.log(`[RECURRING-FOLLOWUP] Found ${tokens.length} active tokens to check`);

        let sentCount = 0;
        let skippedCount = 0;
        const errors = [];

        for (const tokenRecord of tokens) {
            try {
                // Check if contact has been silent for 7+ days
                const { data: lastMsg } = await db
                    .from("facebook_messages")
                    .select("timestamp, is_from_page")
                    .eq("conversation_id", tokenRecord.conversation_id)
                    .eq("is_from_page", false)
                    .order("timestamp", { ascending: false })
                    .limit(1)
                    .single();

                if (!lastMsg || new Date(lastMsg.timestamp) > new Date(sevenDaysAgo)) {
                    // Contact messaged within the last 7 days — skip
                    skippedCount++;
                    continue;
                }

                // Also check: don't send if we already messaged them recently (within 24h)
                const { data: lastPageMsg } = await db
                    .from("facebook_messages")
                    .select("timestamp")
                    .eq("conversation_id", tokenRecord.conversation_id)
                    .eq("is_from_page", true)
                    .order("timestamp", { ascending: false })
                    .limit(1)
                    .single();

                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                if (lastPageMsg && new Date(lastPageMsg.timestamp) > oneDayAgo) {
                    skippedCount++;
                    continue;
                }

                // BEST TIME TO CONTACT: Analyze contact's message hours
                const { data: contactMsgs } = await db
                    .from("facebook_messages")
                    .select("timestamp")
                    .eq("conversation_id", tokenRecord.conversation_id)
                    .eq("is_from_page", false)
                    .order("timestamp", { ascending: false })
                    .limit(50);

                let bestHour = getBestContactHour(contactMsgs || []);

                // FALLBACK: If no message history, use neighbors (all contacts on same page)
                if (bestHour === null) {
                    const { data: neighborMsgs } = await db
                        .from("facebook_messages")
                        .select("timestamp")
                        .eq("page_id", tokenRecord.page_id)
                        .eq("is_from_page", false)
                        .order("timestamp", { ascending: false })
                        .limit(200);

                    bestHour = getBestContactHour(neighborMsgs || []);
                    if (bestHour !== null) {
                        console.log(`[RECURRING-FOLLOWUP] Using neighbor best hour: ${bestHour}:00`);
                    } else {
                        bestHour = 10; // Last resort fallback
                    }
                }
                const nowManila = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
                const currentHour = nowManila.getHours();

                // Only send if we're within ±1 hour of their best contact time
                const hourDiff = Math.abs(currentHour - bestHour);
                const withinWindow = hourDiff <= 1 || hourDiff >= 23; // handle wrap-around (e.g. 23 vs 0)

                if (!withinWindow) {
                    console.log(`[RECURRING-FOLLOWUP] ⏰ Skipping ${tokenRecord.conversation_id} - best hour: ${bestHour}:00, current: ${currentHour}:00`);
                    skippedCount++;
                    continue;
                }

                console.log(`[RECURRING-FOLLOWUP] ⏰ Best time match! Sending to ${tokenRecord.conversation_id} at ${currentHour}:00 (best: ${bestHour}:00)`);

                // Get conversation details for personalization
                const { data: conv } = await db
                    .from("facebook_conversations")
                    .select("participant_name, extracted_details, ai_analysis, pipeline_stage")
                    .eq("conversation_id", tokenRecord.conversation_id)
                    .single();

                const name = conv?.participant_name || "po";
                const details = conv?.extracted_details || {};
                const analysis = conv?.ai_analysis || {};

                // Build personalized follow-up hook
                let followUpMessage = "";
                const budget = details.budget || analysis.budget;
                const location = details.location || analysis.location;

                if (budget && location) {
                    followUpMessage = `Hi ${name}! 😊 May bago po kaming listing around ${location} na within your ₱${budget} budget! Gusto mo po ba i-check? 🏠`;
                } else if (location) {
                    followUpMessage = `Hi ${name}! 😊 May bagong property po kami sa ${location} area! Interested ka pa po ba? Let me send you the details! 🏠`;
                } else if (budget) {
                    followUpMessage = `Hi ${name}! 😊 Nakakita po kami ng magandang property na pasok sa budget mo! Want me to share it? 🏠`;
                } else {
                    followUpMessage = `Hi ${name}! 😊 Kumusta na po? May mga bagong listings po kami na baka magustuhan mo! Gusto mo po ba i-check? 🏠`;
                }

                // Send using the notification token
                const sendBody = {
                    recipient: {
                        notification_messages_token: tokenRecord.token,
                    },
                    message: {
                        text: followUpMessage,
                    },
                    messaging_type: "MESSAGE_TAG",
                    tag: "CONFIRMED_EVENT_UPDATE",
                };

                const sendResp = await fetch(
                    `https://graph.facebook.com/v21.0/me/messages`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(sendBody),
                    }
                );

                const sendResult = await sendResp.json();

                if (sendResult.error) {
                    console.error(`[RECURRING-FOLLOWUP] Failed for ${tokenRecord.conversation_id}:`, sendResult.error.message);
                    errors.push({ conversation: tokenRecord.conversation_id, error: sendResult.error.message });

                    // If token is invalid/expired, mark it
                    if (sendResult.error.code === 551 || sendResult.error.code === 10) {
                        await db.from("recurring_notification_tokens").update({
                            token_status: "expired",
                        }).eq("id", tokenRecord.id);
                    }
                    continue;
                }

                // Mark follow-up as sent
                await db.from("recurring_notification_tokens").update({
                    followup_sent: true,
                    last_used_at: new Date().toISOString(),
                }).eq("id", tokenRecord.id);

                // Save the follow-up message to the messages table
                if (sendResult.message_id) {
                    await db.from("facebook_messages").insert({
                        message_id: sendResult.message_id,
                        conversation_id: tokenRecord.conversation_id,
                        page_id: tokenRecord.page_id,
                        sender_id: tokenRecord.page_id,
                        message_text: followUpMessage,
                        timestamp: new Date().toISOString(),
                        is_from_page: true,
                        sent_source: "recurring_followup",
                    });
                }

                console.log(`[RECURRING-FOLLOWUP] ✅ Sent to ${name} (${tokenRecord.conversation_id})`);
                sentCount++;

                // Small delay between sends to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (innerErr) {
                console.error(`[RECURRING-FOLLOWUP] Error for ${tokenRecord.conversation_id}:`, innerErr.message);
                errors.push({ conversation: tokenRecord.conversation_id, error: innerErr.message });
            }
        }

        const summary = {
            checked: tokens.length,
            sent: sentCount,
            skipped: skippedCount,
            errors: errors.length,
            errorDetails: errors.slice(0, 5),
        };

        console.log("[RECURRING-FOLLOWUP] Done:", JSON.stringify(summary));
        return res.status(200).json(summary);
    } catch (error) {
        console.error("[RECURRING-FOLLOWUP] Fatal error:", error.message);
        return res.status(500).json({ error: error.message });
    }
}
