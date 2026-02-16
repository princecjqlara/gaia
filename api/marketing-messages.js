import { createClient } from "@supabase/supabase-js";

let supabase = null;
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
 * Marketing Messages API
 * 
 * POST /api/marketing-messages
 *   action: "send_to_contact"  — Send a marketing message to a single opted-in contact
 *   action: "send_to_all"      — Send a marketing message to all opted-in contacts
 *   action: "list_subscribers"  — List all active opt-in subscribers
 *   action: "check_status"     — Check opt-in status for a specific contact
 */
export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    const db = getSupabase();
    if (!db) return res.status(500).json({ error: "Database not configured" });

    // GET — list subscribers
    if (req.method === "GET") {
        try {
            const { page_id } = req.query;

            let query = db
                .from("recurring_notification_tokens")
                .select(`
          id,
          conversation_id,
          participant_id,
          page_id,
          token_status,
          frequency,
          opted_in_at,
          last_used_at,
          expires_at,
          followup_sent
        `)
                .eq("token_status", "active")
                .order("opted_in_at", { ascending: false });

            if (page_id) query = query.eq("page_id", page_id);

            const { data: tokens, error } = await query;
            if (error) throw error;

            // Enrich with contact names
            const enriched = [];
            for (const token of (tokens || [])) {
                const { data: conv } = await db
                    .from("facebook_conversations")
                    .select("participant_name, last_message_time, ai_label, pipeline_stage")
                    .eq("conversation_id", token.conversation_id)
                    .single();

                enriched.push({
                    ...token,
                    participant_name: conv?.participant_name || "Unknown",
                    last_message_time: conv?.last_message_time,
                    ai_label: conv?.ai_label,
                    pipeline_stage: conv?.pipeline_stage,
                });
            }

            return res.status(200).json({
                subscribers: enriched,
                total: enriched.length,
            });
        } catch (error) {
            console.error("[MARKETING] List error:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    // POST — send messages or check status
    if (req.method === "POST") {
        const { action, page_id, conversation_id, participant_id, message_text, message_template } = req.body;

        try {
            // Get active page access token
            const pageFilter = page_id
                ? db.from("facebook_pages").select("page_id, page_access_token, page_name").eq("page_id", page_id).eq("is_active", true).single()
                : db.from("facebook_pages").select("page_id, page_access_token, page_name").eq("is_active", true).single();

            const { data: page, error: pageErr } = await pageFilter;
            if (pageErr || !page) {
                return res.status(400).json({ error: "No active Facebook page found" });
            }

            // ─── CHECK STATUS ───────────────────────────────────────────────
            if (action === "check_status") {
                if (!conversation_id && !participant_id) {
                    return res.status(400).json({ error: "conversation_id or participant_id required" });
                }

                let tokenQuery = db.from("recurring_notification_tokens").select("*").eq("page_id", page.page_id);
                if (conversation_id) tokenQuery = tokenQuery.eq("conversation_id", conversation_id);
                if (participant_id) tokenQuery = tokenQuery.eq("participant_id", participant_id);
                tokenQuery = tokenQuery.eq("token_status", "active").single();

                const { data: token } = await tokenQuery;
                const isExpired = token?.expires_at && new Date(token.expires_at) < new Date();
                const cooldownEnd = token?.last_used_at ? new Date(new Date(token.last_used_at).getTime() + 48 * 60 * 60 * 1000) : null;
                const isInCooldown = cooldownEnd && cooldownEnd > new Date();

                return res.status(200).json({
                    opted_in: !!token && !isExpired,
                    token_status: token?.token_status || "none",
                    frequency: token?.frequency,
                    opted_in_at: token?.opted_in_at,
                    expires_at: token?.expires_at,
                    is_expired: isExpired,
                    is_in_cooldown: isInCooldown,
                    cooldown_ends: cooldownEnd?.toISOString() || null,
                    last_used_at: token?.last_used_at,
                });
            }

            // ─── SEND TO SINGLE CONTACT ─────────────────────────────────────
            if (action === "send_to_contact") {
                if (!conversation_id && !participant_id) {
                    return res.status(400).json({ error: "conversation_id or participant_id required" });
                }
                if (!message_text && !message_template) {
                    return res.status(400).json({ error: "message_text or message_template required" });
                }

                // Find active token
                let tokenQuery = db.from("recurring_notification_tokens").select("*").eq("page_id", page.page_id).eq("token_status", "active");
                if (conversation_id) tokenQuery = tokenQuery.eq("conversation_id", conversation_id);
                if (participant_id) tokenQuery = tokenQuery.eq("participant_id", participant_id);
                const { data: token } = await tokenQuery.single();

                if (!token) {
                    return res.status(400).json({ error: "Contact has not opted in to marketing messages" });
                }

                // Check expiry
                if (token.expires_at && new Date(token.expires_at) < new Date()) {
                    await db.from("recurring_notification_tokens").update({ token_status: "expired" }).eq("id", token.id);
                    return res.status(400).json({ error: "Opt-in token has expired. Contact needs to re-subscribe." });
                }

                // Check 48h cooldown
                if (token.last_used_at) {
                    const cooldownMs = 48 * 60 * 60 * 1000;
                    const timeSinceLastUse = Date.now() - new Date(token.last_used_at).getTime();
                    if (timeSinceLastUse < cooldownMs) {
                        const hoursLeft = Math.ceil((cooldownMs - timeSinceLastUse) / (60 * 60 * 1000));
                        return res.status(429).json({
                            error: `Cooldown active. Can send again in ~${hoursLeft} hours.`,
                            cooldown_ends: new Date(new Date(token.last_used_at).getTime() + cooldownMs).toISOString(),
                        });
                    }
                }

                // Send the message using the token
                const result = await sendMarketingMessage(page, token, message_text, message_template);

                if (result.success) {
                    // Update last_used_at
                    await db.from("recurring_notification_tokens").update({
                        last_used_at: new Date().toISOString(),
                        followup_sent: true,
                    }).eq("id", token.id);

                    return res.status(200).json({ success: true, message_id: result.message_id });
                } else {
                    // If token is invalid, mark as revoked
                    if (result.error?.includes("token") || result.error_code === 551) {
                        await db.from("recurring_notification_tokens").update({ token_status: "revoked" }).eq("id", token.id);
                    }
                    return res.status(400).json({ error: result.error, details: result.details });
                }
            }

            // ─── SEND TO ALL OPTED-IN ───────────────────────────────────────
            if (action === "send_to_all") {
                if (!message_text && !message_template) {
                    return res.status(400).json({ error: "message_text or message_template required" });
                }

                const { data: tokens } = await db
                    .from("recurring_notification_tokens")
                    .select("*")
                    .eq("page_id", page.page_id)
                    .eq("token_status", "active");

                if (!tokens || tokens.length === 0) {
                    return res.status(200).json({ success: true, sent: 0, skipped: 0, message: "No opted-in subscribers" });
                }

                const now = Date.now();
                const cooldownMs = 48 * 60 * 60 * 1000;
                let sent = 0;
                let skipped = 0;
                let failed = 0;
                const errors = [];

                for (const token of tokens) {
                    // Check expiry
                    if (token.expires_at && new Date(token.expires_at) < new Date()) {
                        await db.from("recurring_notification_tokens").update({ token_status: "expired" }).eq("id", token.id);
                        skipped++;
                        continue;
                    }

                    // Check 48h cooldown
                    if (token.last_used_at && (now - new Date(token.last_used_at).getTime()) < cooldownMs) {
                        skipped++;
                        continue;
                    }

                    try {
                        const result = await sendMarketingMessage(page, token, message_text, message_template);
                        if (result.success) {
                            await db.from("recurring_notification_tokens").update({
                                last_used_at: new Date().toISOString(),
                                followup_sent: true,
                            }).eq("id", token.id);
                            sent++;
                        } else {
                            failed++;
                            errors.push({ participant_id: token.participant_id, error: result.error });
                            if (result.error?.includes("token") || result.error_code === 551) {
                                await db.from("recurring_notification_tokens").update({ token_status: "revoked" }).eq("id", token.id);
                            }
                        }
                    } catch (sendErr) {
                        failed++;
                        errors.push({ participant_id: token.participant_id, error: sendErr.message });
                    }

                    // Rate limit: 200ms between sends
                    await new Promise(r => setTimeout(r, 200));
                }

                return res.status(200).json({
                    success: true,
                    total: tokens.length,
                    sent,
                    skipped,
                    failed,
                    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
                });
            }

            return res.status(400).json({ error: "Invalid action. Use: check_status, send_to_contact, send_to_all" });
        } catch (error) {
            console.error("[MARKETING] Error:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: "Method not allowed" });
}

/**
 * Send a marketing message using a notification token
 */
async function sendMarketingMessage(page, token, text, template) {
    const body = {
        recipient: {
            notification_messages_token: token.token,
        },
    };

    if (template) {
        // Template message (e.g., property card, button, etc.)
        body.message = {
            attachment: {
                type: "template",
                payload: template,
            },
        };
    } else {
        // Plain text message
        body.message = { text };
    }

    try {
        const resp = await fetch(
            `https://graph.facebook.com/v21.0/${page.page_id}/messages?access_token=${page.page_access_token}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }
        );

        const data = await resp.json();

        if (resp.ok) {
            console.log(`[MARKETING] ✅ Sent to ${token.participant_id}: ${data.message_id}`);
            return { success: true, message_id: data.message_id };
        } else {
            console.log(`[MARKETING] ❌ Failed for ${token.participant_id}:`, data.error?.message);
            return {
                success: false,
                error: data.error?.message || "Unknown error",
                error_code: data.error?.code,
                details: data.error,
            };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
}

export const config = {
    api: {
        bodyParser: true,
    },
    maxDuration: 60,
};
