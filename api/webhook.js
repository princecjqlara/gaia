import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import {
  DEFAULT_WELCOME_BUTTON_LABEL,
  buildWelcomeFallbackMessage,
  buildWelcomeGenerationPrompt,
  parseWelcomeGenerationOutput,
  sanitizeWelcomeButtonLabel,
} from "../src/utils/welcomeMessagePrompt.js";
import {
  getDisplayContactName,
  needsParticipantNameLookup,
  resolveParticipantName,
} from "../src/utils/contactNameUtils.js";
import {
  getEvaluationQuestionPlan,
  mergeAnsweredQuestionNumbers,
  parseAiAnsweredQuestionNumbers,
  promoteLastAskedQuestionAsAnswered,
} from "../src/utils/evaluationQuestionFlow.js";
import {
  applyScopeToPropertyQuery,
  buildScopedPropertyUrl,
} from "../src/utils/propertyScope.js";
import {
  buildNotificationOptinMessage,
  buildOptinFallbackText,
  isUnsupportedNotificationOptinError,
} from "../src/utils/messengerOptin.js";
import { buildAiFollowupSchedulePayload } from "../src/utils/followUpSchedulePayload.js";

// Lazy-load Supabase client
let supabase = null;
function getSupabase() {
  if (!supabase) {
    const url =
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.error("[WEBHOOK] Supabase not configured:", {
        url: !!url,
        key: !!key,
      });
      return null;
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

/**
 * Extract name from message text using common patterns
 * Examples: "I'm John", "My name is Maria", "This is Pedro here"
 */
function extractNameFromText(text) {
  if (!text || text.length < 3) return null;

  const patterns = [
    /(?:i'?m|im|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:my name is|my name's|name is|name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:this is|it's|its)\s+([A-Z][a-z]+)(?:\s+here|\s+speaking)?/i,
    /(?:hey|hi|hello),?\s+(?:this is\s+)?([A-Z][a-z]+)\s+here/i,
    /^([A-Z][a-z]+)\s+here[.!]?$/i,
    /(?:call me|you can call me)\s+([A-Z][a-z]+)/i,
    /(?:ako si|ako po si|si)\s+([A-Z][a-z]+)/i, // Filipino: "Ako si [Name]"
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Validate: 2-25 chars, letters/spaces only, no common words (English + Filipino)
      const invalidNames = [
        // English common words
        "interested",
        "here",
        "yes",
        "no",
        "ok",
        "okay",
        "thanks",
        "thank",
        "hello",
        "hi",
        "hey",
        "good",
        "great",
        "nice",
        "sure",
        "fine",
        "well",
        "please",
        "help",
        "want",
        "need",
        // Filipino common words that might match patterns
        "gusto",
        "ako",
        "ikaw",
        "siya",
        "kami",
        "kayo",
        "sila",
        "tayo",
        "namin",
        "nila",
        "ito",
        "yan",
        "yun",
        "dito",
        "dyan",
        "doon",
        "sino",
        "ano",
        "saan",
        "kailan",
        "paano",
        "bakit",
        "oo",
        "hindi",
        "wala",
        "meron",
        "may",
        "mga",
        "lang",
        "din",
        "rin",
        "nga",
        "naman",
        "pala",
        "daw",
        "raw",
        "kasi",
        "pero",
        "at",
        "o",
        "pwede",
        "puwede",
        "kaya",
        "talaga",
        "sobra",
        "grabe",
        "nako",
        "hala",
        "sige",
        "salamat",
        "maraming",
        "pasensya",
        "sorry",
        "kuya",
        "ate",
        "boss",
        "sir",
        "maam",
      ];
      if (
        name.length >= 2 &&
        name.length <= 25 &&
        /^[A-Za-z\s]+$/.test(name) &&
        !invalidNames.includes(name.toLowerCase())
      ) {
        return name;
      }
    }
  }
  return null;
}

function getFirstName(name) {
  if (!name || typeof name !== "string") return "";
  const trimmed = name.trim();
  if (!trimmed) return "";
  const withoutTitles = trimmed.replace(/^(mr|mrs|ms|miss|sir|maam|ma'am|dr)\.?\s+/i, "");
  const commaSplit = withoutTitles.includes(",")
    ? withoutTitles.split(",").slice(1).join(" ").trim() || withoutTitles.split(",")[0].trim()
    : withoutTitles;
  const parts = commaSplit.split(/\s+/);
  return parts[0] || commaSplit;
}

/**
 * Extract a phone number from message text
 * Keeps common PH formats (09xxxxxxxxx, 0xxxxxxxxxx, +63xxxxxxxxxx)
 */
function extractPhoneFromText(text) {
  if (!text) return null;

  const cleaned = text.replace(/[^\d+]/g, "");
  const match = cleaned.match(/\+63\d{10}|09\d{9}|0\d{10}/);
  if (match) {
    return match[0];
  }

  const generic = cleaned.match(/\d{10,15}/);
  return generic ? generic[0] : null;
}

/**
 * Fetch Facebook user profile name using Graph API
 * Note: Facebook restricts profile access - the user must have messaged the page
 * and your app needs appropriate permissions (pages_messaging)
 */
async function fetchFacebookUserName(userId, pageId) {
  const db = getSupabase();
  if (!db) {
    console.log("[WEBHOOK] No database connection for name lookup");
    return null;
  }

  try {
    // Get page access token from database
    const { data: page, error: pageError } = await db
      .from("facebook_pages")
      .select("page_access_token")
      .eq("page_id", pageId)
      .single();

    if (pageError) {
      console.error("[WEBHOOK] Error fetching page token:", pageError.message);
      return null;
    }

    if (!page?.page_access_token) {
      console.log(
        "[WEBHOOK] No page access token available for user name lookup",
      );
      return null;
    }

    // Try Method 1: Direct PSID lookup
    const url = `https://graph.facebook.com/v21.0/${userId}?fields=name,first_name,last_name&access_token=${page.page_access_token}`;
    console.log(`[WEBHOOK] Fetching user profile for PSID: ${userId}`);

    const response = await fetch(url);
    const responseText = await response.text();

    console.log(`[WEBHOOK] Facebook API response status: ${response.status}`);
    console.log(
      `[WEBHOOK] Facebook API response: ${responseText.substring(0, 200)}`,
    );

    if (!response.ok) {
      // Log privacy errors - this helps debugging
      try {
        const errorData = JSON.parse(responseText);
        console.log(
          `[WEBHOOK] Facebook API error code: ${errorData.error?.code}, message: ${errorData.error?.message?.substring(0, 100)}`,
        );
        if (errorData.error?.code === 100) {
          console.log(
            "[WEBHOOK] Privacy restriction - user profile not accessible",
          );
        } else if (errorData.error?.code === 190) {
          console.error("[WEBHOOK] Page access token may be expired");
        }
      } catch (e) {
        // Ignore parse errors
      }
      return null;
    }

    try {
      const profile = JSON.parse(responseText);
      const userName =
        profile.name ||
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim();

      if (userName) {
        console.log(`[WEBHOOK] ✅ Successfully fetched user name: ${userName}`);
        return userName;
      } else {
        console.log("[WEBHOOK] Profile returned but no name fields available");
        return null;
      }
    } catch (parseError) {
      console.error(
        "[WEBHOOK] Error parsing profile response:",
        parseError.message,
      );
      return null;
    }
  } catch (err) {
    console.error("[WEBHOOK] Exception fetching user name:", err.message);
    return null;
  }
}

/**
 * Alternative: Fetch name from conversation participants API
 * This is how sync gets names successfully
 */
async function fetchNameFromConversation(
  conversationId,
  participantId,
  pageId,
) {
  const db = getSupabase();
  if (!db) return null;

  try {
    const { data: page } = await db
      .from("facebook_pages")
      .select("page_access_token")
      .eq("page_id", pageId)
      .single();

    if (!page?.page_access_token) return null;

    // Fetch conversation with participants (this is how sync gets names!)
    const url = `https://graph.facebook.com/v21.0/${conversationId}?fields=participants{id,name},messages.limit(5){from{id,name}}&access_token=${page.page_access_token}`;
    console.log(`[WEBHOOK] Trying conversation API for name...`);

    const response = await fetch(url);
    if (!response.ok) {
      console.log("[WEBHOOK] Conversation API failed:", response.status);
      return null;
    }

    const data = await response.json();

    // Source 1: Check participants
    const participant = data.participants?.data?.find(
      (p) => p.id === participantId,
    );
    if (participant?.name) {
      console.log(
        `[WEBHOOK] ✅ Got name from conversation participants: ${participant.name}`,
      );
      return participant.name;
    }

    // Source 2: Check message sender (from field)
    const customerMsg = data.messages?.data?.find(
      (m) => m.from?.id === participantId && m.from?.name,
    );
    if (customerMsg?.from?.name) {
      console.log(
        `[WEBHOOK] ✅ Got name from message sender: ${customerMsg.from.name}`,
      );
      return customerMsg.from.name;
    }

    console.log("[WEBHOOK] Conversation API returned no name");
    return null;
  } catch (err) {
    console.log("[WEBHOOK] Conversation API error:", err.message);
    return null;
  }
}

/**
 * Fetch the real Facebook conversation ID for a participant
 * This queries Facebook's Conversations API to find the thread ID
 * Returns both conversation ID and participant name if found
 */
async function fetchRealConversationId(participantId, pageId) {
  const db = getSupabase();
  if (!db) return { conversationId: null, name: null };

  try {
    // Get page access token
    const { data: page } = await db
      .from("facebook_pages")
      .select("page_access_token")
      .eq("page_id", pageId)
      .single();

    if (!page?.page_access_token || page.page_access_token === "pending") {
      console.log(
        "[WEBHOOK] No valid page access token for conversation lookup",
      );
      return { conversationId: null, name: null };
    }

    // Query Facebook's conversations endpoint - include participant NAME for efficiency
    const url = `https://graph.facebook.com/v21.0/${pageId}/conversations?fields=id,participants{id,name}&access_token=${page.page_access_token}`;
    console.log(
      `[WEBHOOK] Fetching conversations to find thread for participant: ${participantId}`,
    );

    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        "[WEBHOOK] Failed to fetch conversations from Facebook:",
        response.status,
      );
      return { conversationId: null, name: null };
    }

    const data = await response.json();

    // Find the conversation that includes this participant
    for (const conv of data.data || []) {
      const participants = conv.participants?.data || [];
      const participant = participants.find((p) => p.id === participantId);
      if (participant) {
        console.log(
          `[WEBHOOK] Found real conversation ID: ${conv.id}, name: ${participant.name || "not available"}`,
        );
        return {
          conversationId: conv.id,
          name: participant.name || null,
        };
      }
    }

    console.log(
      `[WEBHOOK] Conversation not found for participant ${participantId} in first page of results`,
    );
    return { conversationId: null, name: null };
  } catch (err) {
    console.error(
      "[WEBHOOK] Error fetching real conversation ID:",
      err.message,
    );
    return { conversationId: null, name: null };
  }
}

/**
 * Handle Facebook comment on post
 * - Analyze if commenter is interested
 * - Auto-reply to comment
 * - Send DM to interested commenters
 */
async function handleCommentEvent(pageId, commentData) {
  const db = getSupabase();
  if (!db) return;

  try {
    const commentId = commentData.comment_id;
    const postId = commentData.post_id;
    const senderId = commentData.from?.id;
    const senderName = commentData.from?.name || "Unknown";
    const commentText = commentData.message || "";
    const verb = commentData.verb; // 'add', 'edit', 'remove'

    // Only process new comments
    if (verb !== "add" || !commentText || !senderId) {
      console.log(
        "[WEBHOOK] Skipping comment - not a new comment or missing data",
      );
      return;
    }

    // Skip comments from the page itself
    if (senderId === pageId) {
      console.log("[WEBHOOK] Skipping comment from page itself");
      return;
    }

    console.log(
      `[WEBHOOK] Processing comment from ${senderName}: "${commentText.substring(0, 50)}..."`,
    );

    // Get AI settings
    const { data: settings } = await db
      .from("settings")
      .select("value")
      .eq("key", "ai_chatbot_config")
      .single();

    const config = settings?.value || {};

    // Check if comment auto-reply is enabled
    if (config.comment_auto_reply_enabled === false) {
      console.log("[WEBHOOK] Comment auto-reply disabled");
      return;
    }

    // Check global bot enabled
    if (config.global_bot_enabled === false) {
      console.log("[WEBHOOK] Global bot disabled, skipping comment");
      return;
    }

    // Get page access token
    const { data: page } = await db
      .from("facebook_pages")
      .select("page_access_token")
      .eq("page_id", pageId)
      .single();

    if (!page?.page_access_token) {
      console.error("[WEBHOOK] No page access token for comment reply");
      return;
    }

    // Interest keywords - use configured or defaults
    const interestKeywords = (
      config.comment_interest_keywords ||
      "interested,how much,price,magkano,pls,please,dm,pm,info,avail"
    )
      .toLowerCase()
      .split(",")
      .map((k) => k.trim());

    // Check if comment shows interest
    const lowerComment = commentText.toLowerCase();
    const isInterested = interestKeywords.some((kw) =>
      lowerComment.includes(kw),
    );

    console.log(
      `[WEBHOOK] Comment interest check: ${isInterested ? "INTERESTED" : "not interested"}`,
    );

    // Generate AI reply for the comment
    const commentReplyPrompt =
      config.comment_reply_prompt ||
      "Thank the user briefly and invite them to check their DM for more info.";

    // Build simple AI prompt for comment reply
    const NVIDIA_API_KEY =
      process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
    if (!NVIDIA_API_KEY) {
      console.log("[WEBHOOK] No NVIDIA API key for AI comment reply");
      return;
    }

    let replyText = "";
    try {
      const aiResponse = await fetch(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NVIDIA_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "meta/llama-3.1-8b-instruct",
            messages: [
              {
                role: "system",
                content: `You are replying to a Facebook comment on a business post.
Keep replies SHORT (1-2 sentences max).
Use Taglish (Tagalog + English mix) if the comment is in Tagalog.
Be friendly and professional.
${commentReplyPrompt}
${isInterested ? "This person seems interested - thank them and say you sent them a DM." : "Just respond helpfully."}`,
              },
              {
                role: "user",
                content: `Comment from ${senderName}: "${commentText}"`,
              },
            ],
            temperature: 0.7,
            max_tokens: 100,
          }),
        },
      );

      const aiResult = await aiResponse.json();
      replyText = aiResult.choices?.[0]?.message?.content || "";
    } catch (aiErr) {
      console.log("[WEBHOOK] AI error for comment reply:", aiErr.message);
      replyText = isInterested
        ? `Hi ${senderName}! Thank you for your interest! 😊 Check your DM po!`
        : `Hi ${senderName}! Thank you for your comment! 😊`;
    }

    // Post reply to comment
    if (replyText) {
      try {
        const replyResponse = await fetch(
          `https://graph.facebook.com/v21.0/${commentId}/comments?access_token=${page.page_access_token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: replyText }),
          },
        );

        if (replyResponse.ok) {
          console.log(
            `[WEBHOOK] ✅ Replied to comment: "${replyText.substring(0, 50)}..."`,
          );
        } else {
          const errData = await replyResponse.json();
          console.log(
            "[WEBHOOK] Comment reply failed:",
            errData.error?.message,
          );
        }
      } catch (replyErr) {
        console.log("[WEBHOOK] Error replying to comment:", replyErr.message);
      }
    }

    // If interested, send DM to the commenter
    if (isInterested && config.comment_dm_interested !== false) {
      console.log(`[WEBHOOK] Sending DM to interested commenter ${senderName}`);

      // Generate DM message
      let dmText = "";
      try {
        const dmResponse = await fetch(
          "https://integrate.api.nvidia.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${NVIDIA_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "meta/llama-3.1-8b-instruct",
              messages: [
                {
                  role: "system",
                  content: `You are a sales assistant sending a DM to someone who commented on a Facebook post.
Keep it SHORT and friendly (2-3 sentences).
Use Taglish (Tagalog + English mix).
Introduce yourself, thank them for the interest, and ask how you can help.
Knowledge base: ${config.knowledge_base || "We are a digital marketing agency."}`,
                },
                {
                  role: "user",
                  content: `Their comment was: "${commentText}". Their name is ${senderName}.`,
                },
              ],
              temperature: 0.7,
              max_tokens: 150,
            }),
          },
        );

        const dmResult = await dmResponse.json();
        dmText = dmResult.choices?.[0]?.message?.content || "";
      } catch (dmAiErr) {
        console.log("[WEBHOOK] AI error for DM:", dmAiErr.message);
        dmText = `Hi ${senderName}! 😊 Thank you sa comment mo! Nakita ko interested ka. How can I help you po?`;
      }

      // Send DM via Messenger
      if (dmText) {
        try {
          const msgResponse = await fetch(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${page.page_access_token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipient: { id: senderId },
                message: { text: dmText },
                messaging_type: "MESSAGE_TAG",
                tag: "CONFIRMED_EVENT_UPDATE", // Using tag for proactive messaging
              }),
            },
          );

          if (msgResponse.ok) {
            console.log(
              `[WEBHOOK] ✅ Sent DM to ${senderName}: "${dmText.substring(0, 50)}..."`,
            );

            // Create/update conversation for this commenter
            const conversationId = `fb_comment_${senderId}_${Date.now()}`;
            await db.from("facebook_conversations").upsert(
              {
                conversation_id: conversationId,
                page_id: pageId,
                participant_id: senderId,
                participant_name: senderName,
                last_message_text: dmText,
                last_message_time: new Date().toISOString(),
                last_message_from_page: true,
                source: "comment",
                ai_enabled: true,
                created_at: new Date().toISOString(),
              },
              { onConflict: "participant_id,page_id" },
            );
          } else {
            const errData = await msgResponse.json();
            console.log("[WEBHOOK] DM failed:", errData.error?.message);
            // Common error: user hasn't messaged page before (can't DM without prior conversation)
          }
        } catch (msgErr) {
          console.log("[WEBHOOK] Error sending DM:", msgErr.message);
        }
      }
    }

    // Log comment for analytics
    await db
      .from("facebook_comments")
      .insert({
        comment_id: commentId,
        post_id: postId,
        page_id: pageId,
        commenter_id: senderId,
        commenter_name: senderName,
        comment_text: commentText,
        is_interested: isInterested,
        auto_replied: !!replyText,
        dm_sent: isInterested && config.comment_dm_interested !== false,
        created_at: new Date().toISOString(),
      })
      .catch(() => { }); // Ignore if table doesn't exist
  } catch (error) {
    console.error("[WEBHOOK] Error handling comment:", error.message);
  }
}

/**
 * Facebook Webhook Handler
 * Handles verification (GET) and incoming messages (POST)
 * Also handles property click notifications
 */
export default async function handler(req, res) {
  console.log("[WEBHOOK] v3.0 - Optimized AI Response");

  // Diagnostic endpoint: GET /api/webhook?action=diagnose
  if (req.method === "GET" && req.query.action === "diagnose") {
    const db = getSupabase();
    const checks = {
      supabase: !!db,
      nvidia_key: !!(process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY),
      supabase_url: !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    if (db) {
      try {
        const { data, error } = await db.from("settings").select("key").limit(1);
        checks.settings_query = error ? `ERROR: ${error.message}` : `OK (${data?.length} rows)`;
      } catch (e) { checks.settings_query = `EXCEPTION: ${e.message}`; }
      try {
        const { data, error } = await db.from("facebook_pages").select("page_id").limit(1);
        checks.pages_query = error ? `ERROR: ${error.message}` : `OK (${data?.length} rows)`;
      } catch (e) { checks.pages_query = `EXCEPTION: ${e.message}`; }
    }
    return res.status(200).json({ status: "ok", checks });
  }

  // FULL WEBHOOK TEST: POST ?action=webhook_test
  // Traces the entire AI response flow and reports what happens at each step
  if (req.method === "POST" && req.body?.action === "webhook_test") {
    const steps = [];
    const db = getSupabase();
    if (!db) return res.status(500).json({ error: "No DB" });
    try {
      // Step 1: Get settings
      const { data: settings, error: settErr } = await db.from("settings").select("value").eq("key", "ai_chatbot_config").single();
      steps.push({ step: "settings", ok: !settErr, enabled: settings?.value?.global_bot_enabled !== false, autoRespond: settings?.value?.auto_respond_to_new_messages !== false, error: settErr?.message });

      // Step 2: Get page
      const { data: pages, error: pgErr } = await db.from("facebook_pages").select("page_id,page_name,page_access_token,is_active").limit(5);
      steps.push({ step: "pages", ok: !pgErr, count: pages?.length, pages: pages?.map(p => ({ id: p.page_id, name: p.page_name, hasToken: !!p.page_access_token && p.page_access_token !== "pending", tokenLen: p.page_access_token?.length, active: p.is_active })), error: pgErr?.message });

      // Step 3: Get a recent conversation
      const { data: convs, error: convErr } = await db.from("facebook_conversations").select("conversation_id,participant_name,ai_enabled,human_takeover").order("updated_at", { ascending: false }).limit(3);
      steps.push({ step: "conversations", ok: !convErr, count: convs?.length, convs: convs?.map(c => ({ id: c.conversation_id?.substring(0, 20), name: c.participant_name, ai: c.ai_enabled, humanTakeover: c.human_takeover })), error: convErr?.message });

      // Step 4: Check recent messages from first conversation
      if (convs?.[0]) {
        const cid = convs[0].conversation_id;
        const { data: msgs, error: msgErr } = await db.from("facebook_messages").select("is_from_page,message_text,timestamp").eq("conversation_id", cid).order("timestamp", { ascending: false }).limit(5);

        // Spam check: how many consecutive page messages?
        let consecutivePage = 0;
        for (const m of (msgs || [])) {
          if (m.is_from_page) consecutivePage++;
          else break;
        }
        steps.push({ step: "messages", ok: !msgErr, convId: cid.substring(0, 20), count: msgs?.length, consecutivePageMsgs: consecutivePage, wouldSpamBlock: consecutivePage >= 2, lastMsg: msgs?.[0]?.message_text?.substring(0, 50), error: msgErr?.message });
      }

      // Step 5: NVIDIA test
      const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
      if (NVIDIA_API_KEY) {
        try {
          const aiResp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${NVIDIA_API_KEY}` },
            body: JSON.stringify({ model: "meta/llama-3.1-70b-instruct", messages: [{ role: "user", content: "Say OK" }], max_tokens: 10, temperature: 0.1 }),
          });
          const aiData = aiResp.ok ? await aiResp.json() : { error: await aiResp.text() };
          steps.push({ step: "nvidia", ok: aiResp.ok, status: aiResp.status, reply: aiData.choices?.[0]?.message?.content || aiData.error?.substring?.(0, 100) });
        } catch (e) { steps.push({ step: "nvidia", ok: false, error: e.message }); }
      } else {
        steps.push({ step: "nvidia", ok: false, error: "No API key" });
      }

      // Step 6: Check verify token
      steps.push({ step: "verify_token", token: process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || "NOT SET" });

      return res.status(200).json({ status: "ok", steps });
    } catch (e) {
      return res.status(500).json({ error: e.message, steps });
    }
  }

  // DEEP TEST: POST ?action=deep_test
  // Actually runs triggerAIResponse for the most recent conversation and returns detailed results
  if (req.method === "POST" && req.body?.action === "deep_test") {
    const db = getSupabase();
    if (!db) return res.status(500).json({ error: "No DB" });
    const results = { steps: [], startTime: Date.now() };
    try {
      // Step 1: Get the real page
      const { data: page } = await db.from("facebook_pages").select("*").eq("is_active", true).limit(1).single();
      results.steps.push({ step: "page", id: page?.page_id, name: page?.page_name, tokenLen: page?.page_access_token?.length, tokenStart: page?.page_access_token?.substring(0, 10) });

      if (!page) return res.status(200).json({ ...results, error: "No active page found" });

      // Step 2: Get settings
      const { data: settings } = await db.from("settings").select("value").eq("key", "ai_chatbot_config").single();
      const config = settings?.value || {};
      results.steps.push({ step: "settings", global_bot_enabled: config.global_bot_enabled !== false, auto_respond: config.auto_respond_to_new_messages !== false, has_system_prompt: !!config.system_prompt, prompt_preview: config.system_prompt?.substring(0, 80) });

      // Step 3: Get most recent conversation
      const { data: conv } = await db.from("facebook_conversations").select("*").eq("page_id", page.page_id).order("updated_at", { ascending: false }).limit(1).single();
      results.steps.push({ step: "conversation", id: conv?.conversation_id, name: conv?.participant_name, ai_enabled: conv?.ai_enabled, human_takeover: conv?.human_takeover, last_ai_at: conv?.last_ai_response_at });

      if (!conv) return res.status(200).json({ ...results, error: "No conversations found" });

      // Step 4: Check cooldown
      if (conv.last_ai_response_at) {
        const secondsSince = (Date.now() - new Date(conv.last_ai_response_at).getTime()) / 1000;
        results.steps.push({ step: "cooldown", secondsSince: Math.round(secondsSince), blocked: secondsSince < 30 });
      } else {
        results.steps.push({ step: "cooldown", secondsSince: "never", blocked: false });
      }

      // Step 5: Check spam
      const { data: msgs } = await db.from("facebook_messages").select("is_from_page,message_text").eq("conversation_id", conv.conversation_id).order("timestamp", { ascending: false }).limit(5);
      let consecutivePage = 0;
      for (const m of (msgs || [])) { if (m.is_from_page) consecutivePage++; else break; }
      results.steps.push({ step: "spam_check", consecutivePageMsgs: consecutivePage, blocked: consecutivePage >= 2, recentMsgs: msgs?.map(m => ({ from: m.is_from_page ? "page" : "user", text: m.message_text?.substring(0, 30) })) });

      // Step 6: Try NVIDIA API
      const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
      results.steps.push({ step: "nvidia_key", hasKey: !!NVIDIA_API_KEY, keyLen: NVIDIA_API_KEY?.length });

      // Step 7: Build prompt and call AI
      const systemPrompt = config.system_prompt || "You are a friendly AI sales assistant for a business. Be helpful, professional, and concise.";
      const recentMessages = (msgs || []).reverse().map(m => ({
        role: m.is_from_page ? "assistant" : "user",
        content: m.message_text || "(no text)"
      }));

      const aiMessages = [
        { role: "system", content: systemPrompt },
        ...recentMessages.slice(-10)
      ];

      const aiStart = Date.now();
      try {
        const aiResp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${NVIDIA_API_KEY}` },
          body: JSON.stringify({ model: "meta/llama-3.1-70b-instruct", messages: aiMessages, max_tokens: 300, temperature: 0.7 }),
        });
        const aiData = await aiResp.json();
        const aiReply = aiData.choices?.[0]?.message?.content;
        results.steps.push({ step: "nvidia_call", ok: aiResp.ok, status: aiResp.status, timeMs: Date.now() - aiStart, replyPreview: aiReply?.substring(0, 100), error: aiData.error?.message });
      } catch (aiErr) {
        results.steps.push({ step: "nvidia_call", ok: false, timeMs: Date.now() - aiStart, error: aiErr.message });
      }

      // Step 8: Test Facebook send capability
      results.steps.push({ step: "fb_send_ready", pageId: page.page_id, hasToken: !!page.page_access_token && page.page_access_token !== "pending", sendUrl: `https://graph.facebook.com/v21.0/${page.page_id}/messages` });

      results.totalTimeMs = Date.now() - results.startTime;
      return res.status(200).json(results);
    } catch (e) {
      results.error = e.message;
      results.stack = e.stack?.substring(0, 200);
      return res.status(500).json(results);
    }
  }

  // SUBSCRIBE PAGE: POST ?action=subscribe_page
  // Subscribes the Facebook page to the app to receive webhook events
  if (req.method === "POST" && req.body?.action === "subscribe_page") {
    const db = getSupabase();
    if (!db) return res.status(500).json({ error: "No DB" });
    try {
      // Get the active page
      const { data: page } = await db.from("facebook_pages").select("*").eq("is_active", true).limit(1).single();
      if (!page) return res.status(200).json({ error: "No active page found" });
      if (!page.page_access_token || page.page_access_token === "pending") {
        return res.status(200).json({ error: "Page access token is missing or pending" });
      }

      // Step 1: Check current subscription status
      const checkUrl = `https://graph.facebook.com/v21.0/${page.page_id}/subscribed_apps?access_token=${page.page_access_token}`;
      const checkResp = await fetch(checkUrl);
      const checkData = await checkResp.json();

      // Step 2: Subscribe the page to the app
      const subscribeUrl = `https://graph.facebook.com/v21.0/${page.page_id}/subscribed_apps`;
      const subscribeResp = await fetch(subscribeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscribed_fields: "messages,messaging_postbacks,messaging_referrals,messaging_optins,messaging_handovers,message_reads,message_template_status_update,feed",
          access_token: page.page_access_token
        })
      });
      const subscribeData = await subscribeResp.json();

      // Step 3: Verify subscription
      const verifyResp = await fetch(checkUrl);
      const verifyData = await verifyResp.json();

      return res.status(200).json({
        page: { id: page.page_id, name: page.page_name },
        before: checkData,
        subscribeResult: subscribeData,
        after: verifyData
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // MARKETING MESSAGES: POST ?action=marketing_list|marketing_status|marketing_send|marketing_broadcast
  if (req.method === "POST" && req.body?.action?.startsWith("marketing_")) {
    const db = getSupabase();
    if (!db) return res.status(500).json({ error: "No DB" });
    const { action, page_id, conversation_id, participant_id, message_text, message_template } = req.body;

    try {
      // Get active page
      let pageQuery = db.from("facebook_pages").select("page_id, page_access_token, page_name").eq("is_active", true);
      if (page_id) pageQuery = pageQuery.eq("page_id", page_id);
      const { data: mktPage, error: mktPageErr } = await pageQuery.limit(1).single();
      if (mktPageErr || !mktPage) return res.status(400).json({ error: "No active Facebook page found" });

      // --- LIST SUBSCRIBERS ---
      if (action === "marketing_list") {
        let tokenQuery = db.from("recurring_notification_tokens")
          .select("id, conversation_id, participant_id, page_id, token_status, frequency, opted_in_at, last_used_at, expires_at")
          .eq("token_status", "active").eq("page_id", mktPage.page_id)
          .order("opted_in_at", { ascending: false });
        const { data: tokens } = await tokenQuery;
        const enriched = [];
        for (const token of (tokens || [])) {
          const { data: conv } = await db.from("facebook_conversations")
            .select("participant_name, last_message_time, ai_label, pipeline_stage")
            .eq("conversation_id", token.conversation_id).single();
          enriched.push({ ...token, participant_name: conv?.participant_name || "Unknown", ai_label: conv?.ai_label, pipeline_stage: conv?.pipeline_stage });
        }
        return res.status(200).json({ subscribers: enriched, total: enriched.length });
      }

      // --- CHECK STATUS ---
      if (action === "marketing_status") {
        if (!conversation_id && !participant_id) return res.status(400).json({ error: "conversation_id or participant_id required" });
        let tq = db.from("recurring_notification_tokens").select("*").eq("page_id", mktPage.page_id).eq("token_status", "active");
        if (conversation_id) tq = tq.eq("conversation_id", conversation_id);
        if (participant_id) tq = tq.eq("participant_id", participant_id);
        const { data: token } = await tq.single();
        const isExpired = token?.expires_at && new Date(token.expires_at) < new Date();
        const cooldownEnd = token?.last_used_at ? new Date(new Date(token.last_used_at).getTime() + 48 * 3600000) : null;
        return res.status(200).json({
          opted_in: !!token && !isExpired, token_status: token?.token_status || "none",
          frequency: token?.frequency, is_expired: isExpired,
          is_in_cooldown: cooldownEnd && cooldownEnd > new Date(),
          cooldown_ends: cooldownEnd?.toISOString() || null,
        });
      }

      // --- SEND TO SINGLE CONTACT ---
      if (action === "marketing_send") {
        if (!conversation_id && !participant_id) return res.status(400).json({ error: "conversation_id or participant_id required" });
        if (!message_text && !message_template) return res.status(400).json({ error: "message_text or message_template required" });
        let tq = db.from("recurring_notification_tokens").select("*").eq("page_id", mktPage.page_id).eq("token_status", "active");
        if (conversation_id) tq = tq.eq("conversation_id", conversation_id);
        if (participant_id) tq = tq.eq("participant_id", participant_id);
        const { data: token } = await tq.single();
        if (!token) return res.status(400).json({ error: "Contact has not opted in" });
        if (token.expires_at && new Date(token.expires_at) < new Date()) {
          await db.from("recurring_notification_tokens").update({ token_status: "expired" }).eq("id", token.id);
          return res.status(400).json({ error: "Token expired. Contact needs to re-subscribe." });
        }
        if (token.last_used_at) {
          const gap = Date.now() - new Date(token.last_used_at).getTime();
          if (gap < 48 * 3600000) return res.status(429).json({ error: `Cooldown active. ~${Math.ceil((48 * 3600000 - gap) / 3600000)}h left.` });
        }
        const result = await sendMarketingMsg(mktPage, token, message_text, message_template);
        if (result.success) {
          await db.from("recurring_notification_tokens").update({ last_used_at: new Date().toISOString(), followup_sent: true }).eq("id", token.id);
          return res.status(200).json({ success: true, message_id: result.message_id });
        }
        if (result.error_code === 551) await db.from("recurring_notification_tokens").update({ token_status: "revoked" }).eq("id", token.id);
        return res.status(400).json({ error: result.error });
      }

      // --- BROADCAST TO ALL ---
      if (action === "marketing_broadcast") {
        if (!message_text && !message_template) return res.status(400).json({ error: "message_text or message_template required" });
        const { data: tokens } = await db.from("recurring_notification_tokens").select("*").eq("page_id", mktPage.page_id).eq("token_status", "active");
        if (!tokens?.length) return res.status(200).json({ success: true, sent: 0, skipped: 0 });
        let sent = 0, skipped = 0, failed = 0;
        for (const token of tokens) {
          if (token.expires_at && new Date(token.expires_at) < new Date()) { skipped++; continue; }
          if (token.last_used_at && (Date.now() - new Date(token.last_used_at).getTime()) < 48 * 3600000) { skipped++; continue; }
          const r = await sendMarketingMsg(mktPage, token, message_text, message_template);
          if (r.success) { await db.from("recurring_notification_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", token.id); sent++; }
          else { failed++; }
          await new Promise(r => setTimeout(r, 200));
        }
        return res.status(200).json({ success: true, total: tokens.length, sent, skipped, failed });
      }

      return res.status(400).json({ error: "Unknown marketing action" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // Handle GET - Webhook Verification
    if (req.method === "GET") {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      const VERIFY_TOKEN =
        process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || "TEST_TOKEN";

      console.log("[WEBHOOK] Verification:", {
        mode,
        token,
        expectedToken: VERIFY_TOKEN,
      });

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("[WEBHOOK] Verified successfully!");
        return res.status(200).send(challenge);
      } else {
        console.error("[WEBHOOK] Verification failed");
        return res.status(403).send("Verification failed");
      }
    }

    // Handle POST
    if (req.method === "POST") {
      const body = req.body;

      // ===== PROPERTY CLICK HANDLER =====
      // Check if this is a property click notification from our frontend
      if (body.action === "property_click") {
        console.log("[WEBHOOK] Property click notification received");
        return await handlePropertyClick(req, res, body);
      }

      // ===== SEND PROPERTY SHOWCASE HANDLER =====
      // Check if this is a request to send property showcase button
      if (body.action === "send_property_showcase") {
        console.log("[WEBHOOK] Send property showcase request received");
        return await handleSendPropertyShowcase(req, res, body);
      }

      // ===== INQUIRY CLICK HANDLER =====
      // Sends an immediate chatbot message when user clicks Inquire
      if (body.action === "inquiry_click") {
        console.log("[WEBHOOK] Inquiry click received");
        return await handleInquiryClick(req, res, body);
      }

      // ===== AI CHAT PROXY =====
      // Proxies frontend AI calls to NVIDIA to avoid CORS issues
      if (body.action === "ai_chat") {
        const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
        if (!NVIDIA_API_KEY) {
          return res.status(500).json({ error: "NVIDIA API key not configured" });
        }
        try {
          const { messages, model, temperature, max_tokens } = body;
          const aiResp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${NVIDIA_API_KEY}` },
            body: JSON.stringify({
              model: model || "nvidia/llama-3.1-nemotron-70b-instruct",
              messages: messages || [],
              temperature: temperature ?? 0.7,
              max_tokens: max_tokens ?? 1024,
              stream: false,
            }),
          });
          if (!aiResp.ok) {
            const errText = await aiResp.text();
            return res.status(aiResp.status).json({ error: errText });
          }
          const aiData = await aiResp.json();
          return res.status(200).json(aiData);
        } catch (e) {
          return res.status(500).json({ error: e.message });
        }
      }

      // ===== CREATE ORG MEMBER (consolidated from create-org-member.js) =====
      if (body.action === "create_org_member") {
        try {
          const { email, name, password, role, organization_id, auth_token } = body;
          if (!email || !name || !password || !organization_id) {
            return res.status(400).json({ error: "Missing required fields" });
          }
          if (!["admin", "user"].includes(role)) {
            return res.status(400).json({ error: "Invalid role" });
          }
          const db = getSupabase();
          // Verify caller is organizer
          const token = auth_token || req.headers.authorization?.split(" ")[1];
          if (!token) return res.status(401).json({ error: "Unauthorized" });
          const { data: { user: callerUser }, error: authErr } = await db.auth.getUser(token);
          if (authErr || !callerUser) return res.status(401).json({ error: "Invalid token" });
          const { data: callerData } = await db.from("users").select("role, organization_id").eq("id", callerUser.id).single();
          if (callerData?.role !== "organizer" || callerData?.organization_id !== organization_id) {
            return res.status(403).json({ error: "Only organizers can add members" });
          }
          // Create auth user
          const { data: authData, error: createErr } = await db.auth.admin.createUser({
            email, password, email_confirm: true
          });
          if (createErr) return res.status(400).json({ error: createErr.message });
          // Create profile
          const { data: userData, error: profileErr } = await db.from("users").insert({
            id: authData.user.id, email, name, role, organization_id
          }).select().single();
          if (profileErr) {
            await db.auth.admin.deleteUser(authData.user.id);
            return res.status(400).json({ error: profileErr.message });
          }
          return res.status(200).json({ success: true, user: { id: userData.id, email: userData.email, name: userData.name, role: userData.role } });
        } catch (e) {
          return res.status(500).json({ error: e.message });
        }
      }

      // ===== CLOUDINARY SIGN HANDLER =====
      // Returns a signed upload payload (no preset required)
      if (body.action === "cloudinary_sign") {
        return await handleCloudinarySign(req, res, body);
      }

      // ===== PROCESS AI (self-callback from webhook) =====
      // This runs as a SEPARATE Vercel function invocation with its own 10s timer
      if (body.action === "process_ai") {
        console.log("[WEBHOOK] process_ai invoked for conversation:", body.conversation_id);
        try {
          const db = getSupabase();
          const { data: conv } = await db
            .from("facebook_conversations")
            .select("*")
            .eq("conversation_id", body.conversation_id)
            .single();
          if (conv) {
            await triggerAIResponse(db, body.conversation_id, body.page_id, conv);
            console.log("[WEBHOOK] process_ai completed successfully");
          } else {
            console.log("[WEBHOOK] process_ai: conversation not found");
          }
        } catch (e) {
          console.error("[WEBHOOK] process_ai error:", e.message);
        }
        return res.status(200).json({ ok: true });
      }

      // ===== FACEBOOK WEBHOOK EVENTS =====
      // Only log actual message events, not delivery/read receipts
      const hasMessageEvent = body.entry?.some((e) =>
        e.messaging?.some((m) => m.message),
      );
      if (hasMessageEvent) {
        console.log("[WEBHOOK] Message received");
      }

      if (body.object === "page") {
        // Track if response has been sent (for safety timeout)
        let responseSent = false;

        // Safety timeout: send 200 after 25s if processing is still running
        // Facebook requires response within ~30s, Vercel hobby timeout is 60s
        const safetyTimeout = setTimeout(() => {
          if (!responseSent) {
            responseSent = true;
            console.log("[WEBHOOK] Safety timeout - sending 200 before Facebook deadline");
            res.status(200).send("EVENT_RECEIVED");
          }
        }, 25000);

        try {
          // Process ALL messages INCLUDING AI response BEFORE returning 200
          // Vercel kills execution after res.send(), so we MUST finish first
          for (const entry of body.entry || []) {
            const pageId = entry.id;
            for (const event of (entry.messaging || [])) {
              try {
                if (event.message) {
                  await handleIncomingMessage(pageId, event);
                } else if (event.read) {
                  await handleReadReceipt(pageId, event);
                } else if (event.postback) {
                  await handlePostbackEvent(pageId, event);
                } else if (event.optin) {
                  await handleOptinEvent(pageId, event);
                } else if (event.referral) {
                  await handleReferralEvent(pageId, event);
                }
              } catch (eventErr) {
                console.error("[WEBHOOK] Error:", eventErr.message);
              }
            }
            for (const change of (entry.changes || [])) {
              if (change.field === "feed" && change.value?.item === "comment") {
                try { await handleCommentEvent(pageId, change.value); } catch (e) { console.error(e.message); }
              } else if (change.field === "message_template_status_update") {
                try { await handleTemplateStatusUpdate(pageId, change.value); } catch (e) { console.error(e.message); }
              }
            }
          }
        } finally {
          clearTimeout(safetyTimeout);
          if (!responseSent) {
            responseSent = true;
            console.log("[WEBHOOK] Processing complete - sending 200");
            res.status(200).send("EVENT_RECEIVED");
          }
        }
        return;
      }

      return res.status(200).send("OK");
    }

    return res.status(405).send("Method not allowed");
  } catch (error) {
    console.error("[WEBHOOK] Error:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Handle property click notification
 * Sends an immediate message to the contact when they click a property link
 */
async function handlePropertyClick(req, res, body) {
  const { participantId, propertyId, propertyTitle } = body;

  console.log("[PROPERTY CLICK] Processing:", {
    participantId,
    propertyId,
    propertyTitle,
  });

  if (!participantId || !propertyId) {
    return res
      .status(400)
      .json({ error: "Missing participantId or propertyId" });
  }

  const db = getSupabase();
  if (!db) {
    return res.status(500).json({ error: "Database not available" });
  }

  try {
    // 1. Find the conversation for this participant
    const { data: conversation, error: convError } = await db
      .from("facebook_conversations")
      .select("conversation_id, page_id, participant_name")
      .eq("participant_id", participantId)
      .single();

    if (convError || !conversation) {
      console.log(
        "[PROPERTY CLICK] Conversation not found for participant:",
        participantId,
      );
      // Still log the view even if we can't send a message
      await logPropertyView(db, propertyId, propertyTitle, participantId, null);
      return res.status(200).json({
        success: true,
        messageSent: false,
        reason: "Conversation not found",
      });
    }

    console.log(
      "[PROPERTY CLICK] Found conversation:",
      conversation.conversation_id,
    );

    // 2. Get the page access token
    const { data: page, error: pageError } = await db
      .from("facebook_pages")
      .select("page_access_token, page_name, team_id, organization_id")
      .eq("page_id", conversation.page_id)
      .single();

    if (
      pageError ||
      !page?.page_access_token ||
      page.page_access_token === "pending"
    ) {
      console.log("[PROPERTY CLICK] No valid page access token");
      await logPropertyView(
        db,
        propertyId,
        propertyTitle,
        participantId,
        conversation.participant_name,
      );
      return res.status(200).json({
        success: true,
        messageSent: false,
        reason: "No page access token",
      });
    }

    // 3. Log the property view
    await logPropertyView(
      db,
      propertyId,
      propertyTitle,
      participantId,
      conversation.participant_name,
      conversation.page_id // Pass page_id
    );

    // 4. Send immediate message to the contact
    const messageText = `👋 I noticed you're checking out "${propertyTitle}"! Great choice! 🏠\n\nIf you have any questions about this property or would like to schedule a viewing, just let me know. I'm here to help! 😊`;

    console.log("[PROPERTY CLICK] Sending message to:", participantId);
    console.log("[PROPERTY CLICK] Using page_id:", conversation.page_id);

    const response = await fetch(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${page.page_access_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: participantId },
          message: { text: messageText },
          messaging_type: "RESPONSE",
        }),
      },
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error(
        "[PROPERTY CLICK] Failed to send message:",
        responseData.error?.message,
      );
      return res.status(200).json({
        success: true,
        messageSent: false,
        viewLogged: true,
        error: responseData.error?.message,
      });
    }

    console.log("[PROPERTY CLICK] ✅ Message sent successfully!");

    // 5. Log this as an AI action (optional - ignore errors)
    try {
      await db.from("ai_action_log").insert({
        conversation_id: conversation.conversation_id,
        action_type: "property_click_message",
        details: {
          property_id: propertyId,
          property_title: propertyTitle,
          message_sent: true,
        },
      });
    } catch (e) {
      // Ignore if table doesn't exist
    }

    return res.status(200).json({
      success: true,
      messageSent: true,
      viewLogged: true,
    });
  } catch (error) {
    console.error("[PROPERTY CLICK] Error:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Helper: Log property view to database
 */
async function logPropertyView(
  db,
  propertyId,
  propertyTitle,
  participantId,
  visitorName,
  pageId = null // Add pageId param
) {
  try {
    await db.from("property_views").insert({
      property_id: propertyId,
      property_title: propertyTitle,
      participant_id: participantId,
      visitor_name: visitorName,
      page_id: pageId, // Insert page_id
      source: "fb_messenger",
      viewed_at: new Date().toISOString(),
    });
    console.log("[PROPERTY CLICK] ✅ View logged to database with page_id:", pageId);
  } catch (err) {
    console.error("[PROPERTY CLICK] Failed to log view:", err.message);
  }
}

/**
 * Handle send property showcase button
 * Sends a button to the contact that opens the immersive property showcase
 */
async function handleSendPropertyShowcase(req, res, body) {
  const { participantId, propertyId, propertyTitle, propertyImage, propertyPrice, teamId } = body;

  console.log("[PROPERTY SHOWCASE] Sending button:", {
    participantId,
    propertyId,
    propertyTitle,
    teamId,
  });

  if (!participantId || !propertyId) {
    return res
      .status(400)
      .json({ error: "Missing participantId or propertyId" });
  }

  const db = getSupabase();
  if (!db) {
    return res.status(500).json({ error: "Database not available" });
  }

  try {
    // 1. Find the conversation for this participant
    const { data: conversation, error: convError } = await db
      .from("facebook_conversations")
      .select("conversation_id, page_id, participant_name")
      .eq("participant_id", participantId)
      .single();

    if (convError || !conversation) {
      console.log(
        "[PROPERTY SHOWCASE] Conversation not found for participant:",
        participantId,
      );
      return res.status(200).json({
        success: false,
        error: "Conversation not found",
      });
    }

    console.log(
      "[PROPERTY SHOWCASE] Found conversation:",
      conversation.conversation_id,
    );

    // 2. Get the page access token
    const { data: page, error: pageError } = await db
      .from("facebook_pages")
      .select("page_access_token, page_name")
      .eq("page_id", conversation.page_id)
      .single();

    if (
      pageError ||
      !page?.page_access_token ||
      page.page_access_token === "pending"
    ) {
      console.log("[PROPERTY SHOWCASE] No valid page access token");
      return res.status(200).json({
        success: false,
        error: "No page access token",
      });
    }

    // 3. Build the showcase URL with mode=showcase
    const baseUrl = process.env.APP_URL || process.env.VITE_APP_URL || req.headers.origin || "https://gaia-app.com";
    const showcaseBase = buildScopedPropertyUrl({
      baseUrl,
      propertyId,
      participantId,
      teamId: teamId || page?.team_id,
      organizationId: page?.organization_id,
    });
    const showcaseUrl = `${showcaseBase}${showcaseBase.includes("?") ? "&" : "?"}mode=showcase`;

    console.log("[PROPERTY SHOWCASE] Showcase URL:", showcaseUrl);

    // 4. Send the button template to the contact
    const messagePayload = {
      recipient: { id: participantId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [
              {
                title: propertyTitle || "View Property",
                subtitle: propertyPrice ? `₱ ${parseFloat(propertyPrice).toLocaleString()}` : "Tap to view property details",
                image_url: propertyImage || "https://images.unsplash.com/photo-1600596542815-27bfef402399?q=80&w=2070",
                buttons: [
                  {
                    type: "web_url",
                    url: showcaseUrl,
                    title: "🏠 View Property",
                    webview_height_ratio: "full",
                    messenger_extensions: true
                  }
                ]
              }
            ]
          }
        }
      },
      messaging_type: "RESPONSE",
    };

    console.log("[PROPERTY SHOWCASE] Sending button to:", participantId);

    const response = await fetch(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${page.page_access_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messagePayload),
      },
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error(
        "[PROPERTY SHOWCASE] Failed to send button:",
        responseData.error?.message,
      );
      return res.status(200).json({
        success: false,
        error: responseData.error?.message,
      });
    }

    console.log("[PROPERTY SHOWCASE] ✅ Button sent successfully!");

    // 5. Log this action
    try {
      await db.from("ai_action_log").insert({
        conversation_id: conversation.conversation_id,
        action_type: "property_showcase_sent",
        details: {
          property_id: propertyId,
          property_title: propertyTitle,
          showcase_url: showcaseUrl,
        },
      });
    } catch (e) {
      // Ignore if table doesn't exist
    }

    return res.status(200).json({
      success: true,
      message: "Property showcase button sent",
    });
  } catch (error) {
    console.error("[PROPERTY SHOWCASE] Error:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Handle Cloudinary signed upload request
 */
async function handleCloudinarySign(req, res, body) {
  const { folder } = body || {};

  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const apiKey =
    process.env.CLOUDINARY_API_KEY || process.env.VITE_CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(500).json({
      error: "Cloudinary not configured",
    });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const params = { timestamp };
  if (folder) params.folder = String(folder);

  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const signature = crypto
    .createHash("sha1")
    .update(toSign + apiSecret)
    .digest("hex");

  return res.status(200).json({
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder: folder ? String(folder) : null,
  });
}

/**
 * Handle inquiry click
 * Sends an immediate chatbot message to the contact when they click Inquire
 */
async function handleInquiryClick(req, res, body) {
  const { participantId, propertyId, propertyTitle, scheduleUrl } = body;

  console.log("[INQUIRY CLICK] Processing:", {
    participantId,
    propertyId,
    propertyTitle,
  });

  if (!participantId || !propertyId) {
    return res
      .status(400)
      .json({ error: "Missing participantId or propertyId" });
  }

  const db = getSupabase();
  if (!db) {
    return res.status(500).json({ error: "Database not available" });
  }

  try {
    // 1. Find the conversation for this participant
    const { data: conversation, error: convError } = await db
      .from("facebook_conversations")
      .select("conversation_id, page_id, participant_name")
      .eq("participant_id", participantId)
      .single();

    if (convError || !conversation) {
      console.log(
        "[INQUIRY CLICK] Conversation not found for participant:",
        participantId,
      );
      return res.status(200).json({
        success: true,
        messageSent: false,
        reason: "Conversation not found",
      });
    }

    // 2. Get the page access token
    const { data: page, error: pageError } = await db
      .from("facebook_pages")
      .select("page_access_token, page_name")
      .eq("page_id", conversation.page_id)
      .single();

    if (
      pageError ||
      !page?.page_access_token ||
      page.page_access_token === "pending"
    ) {
      console.log("[INQUIRY CLICK] No valid page access token");
      return res.status(200).json({
        success: true,
        messageSent: false,
        reason: "No page access token",
      });
    }

    // 3. Send immediate message to the contact
    const title = propertyTitle || "this property";
    const lines = [
      `Thanks for your inquiry about "${title}"! 🏠`,
      "Would you like to schedule a viewing or ask any questions?",
    ];
    if (scheduleUrl) {
      lines.push(`Schedule here: ${scheduleUrl}`);
    }
    const messageText = lines.join("\n\n");

    const response = await fetch(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${page.page_access_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: participantId },
          message: { text: messageText },
          messaging_type: "RESPONSE",
        }),
      },
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error(
        "[INQUIRY CLICK] Failed to send message:",
        responseData.error?.message,
      );
      return res.status(200).json({
        success: true,
        messageSent: false,
        error: responseData.error?.message,
      });
    }

    // 4. Log this as an AI action (optional)
    try {
      await db.from("ai_action_log").insert({
        conversation_id: conversation.conversation_id,
        action_type: "inquiry_click_message",
        details: {
          property_id: propertyId,
          property_title: propertyTitle,
          message_sent: true,
        },
      });
    } catch (err) {
      console.warn("[INQUIRY CLICK] Failed to log AI action:", err?.message);
    }

    return res.status(200).json({ success: true, messageSent: true });
  } catch (error) {
    console.error("[INQUIRY CLICK] Error:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Save incoming message to database
 */
async function handleIncomingMessage(pageId, event) {
  const senderId = event.sender?.id;
  const recipientId = event.recipient?.id;
  const message = event.message;
  const timestamp = event.timestamp;

  if (!senderId || !message) {
    console.warn(
      `[WEBHOOK] Message rejected: missing senderId(${senderId}) or message(${!!message})`,
    );
    return;
  }

  // Check if this is an echo (message sent FROM the page, not received)
  // Method 1: Facebook sets is_echo flag for echoed messages (reliable)
  // Method 2: Sender ID matches page ID (unreliable, may catch legitimate messages)
  const hasEchoFlag = message.is_echo === true;
  const senderMatchesPage = String(senderId) === String(pageId);

  // Prefer is_echo flag over sender ID matching to avoid false positives
  const isEcho =
    hasEchoFlag || (senderMatchesPage && message.is_echo !== false);

  // DEBUG: Log all detection values
  console.log(
    `[WEBHOOK] Echo Detection: hasEchoFlag=${hasEchoFlag}, senderId=${senderId}, pageId=${pageId}, senderMatchesPage=${senderMatchesPage}, FINAL_isEcho=${isEcho}`,
  );

  // For echoes: sender is the page, recipient is the user
  // For regular messages: sender is the user, recipient is the page
  const participantId = isEcho ? recipientId : senderId;
  const isFromPage = isEcho;

  // Additional validation: participantId should not be the page
  if (!participantId) {
    console.warn(`[WEBHOOK] Rejecting: no participant ID found`);
    return;
  }

  // Only reject if sender matches page AND there's no echo flag (prevents legitimate messages being rejected)
  if (String(participantId) === String(pageId) && !message.is_echo) {
    console.warn(
      `[WEBHOOK] Rejecting: participantId (${participantId}) same as pageId (${pageId}) with no echo flag`,
    );
    return;
  }

  const db = getSupabase();
  if (!db) {
    console.error(
      `[WEBHOOK] ERROR: Database connection failed - cannot process message`,
    );
    return;
  }

  console.log(
    `[WEBHOOK] ${isEcho ? "Echo" : "Incoming"} from ${participantId}: ${(message.text || "[attachment]").substring(0, 50)}`,
  );

  try {
    // PARALLEL: Run dedup check, page check, and conversation lookup simultaneously
    // This saves ~200-400ms vs running them sequentially
    const [dedupResult, pageResult, convResult] = await Promise.all([
      // 1. Dedup check
      message.mid
        ? db.from("facebook_messages").select("message_id").eq("message_id", message.mid).single()
        : Promise.resolve({ data: null }),
      // 2. Page existence check
      db.from("facebook_pages").select("page_id").eq("page_id", pageId).single(),
      // 3. Conversation lookup
      db.from("facebook_conversations").select("*").eq("participant_id", participantId).eq("page_id", pageId).single(),
    ]);

    // Handle dedup
    if (dedupResult.data) {
      return; // Already processed
    }

    // Handle page creation if needed
    if (!pageResult.data) {
      console.log(`[WEBHOOK] Page ${pageId} not in database, creating...`);
      await db.from("facebook_pages").insert({
        page_id: pageId,
        page_name: `Page ${pageId}`,
        page_access_token: "pending",
        is_active: true,
      });
    }

    const existingConv = convResult.data;
    const convLookupError = convResult.error;
    console.log(`[WEBHOOK] Lookup: existing=${!!existingConv}, error=${convLookupError?.code || "none"}`);

    // Get conversation_id - for new conversations, try to fetch the real one from Facebook
    let conversationId = existingConv?.conversation_id;
    console.log(
      `[WEBHOOK] STEP 2: conversationId from existing = ${conversationId || "null"}`,
    );

    if (!conversationId) {
      // Use temporary ID immediately - no slow Facebook API calls
      conversationId = `t_${participantId}`;
      console.log(`[WEBHOOK] Using conversation ID: ${conversationId}`);
    }

    // Only increment unread for messages FROM the user, not echoes
    const newUnreadCount = isFromPage
      ? existingConv?.unread_count || 0
      : (existingConv?.unread_count || 0) + 1;
    console.log(`[WEBHOOK] STEP 4: unreadCount = ${newUnreadCount}`);

    // Try multiple sources for participant name
    let participantName = existingConv?.participant_name;

    // Fetch name if missing or placeholder (for both incoming messages AND echoes)
    const needsNameLookup = needsParticipantNameLookup(participantName);
    if (needsNameLookup) {
      // Source 1: Check if Facebook included sender name in the event
      const senderNameFromEvent =
        event.sender?.name || event.recipient?.name || message.sender_name || "";
      if (!needsParticipantNameLookup(senderNameFromEvent)) {
        console.log(`[WEBHOOK] Got name from event: ${senderNameFromEvent}`);
        participantName = senderNameFromEvent;
      }

      // Source 2: Fetch name from Conversations API (more reliable than profile endpoint)
      let conversationLookupName = "";
      if (
        needsParticipantNameLookup(participantName) &&
        needsParticipantNameLookup(conversationLookupName) &&
        !isFromPage
      ) {
        try {
          const realConversation = await fetchRealConversationId(participantId, pageId);
          const realConversationId = realConversation?.conversationId || "";

          if (!needsParticipantNameLookup(realConversation?.name)) {
            conversationLookupName = realConversation.name;
            console.log(
              `[WEBHOOK] Got name from conversations list: ${conversationLookupName}`,
            );
          }

          if (needsParticipantNameLookup(conversationLookupName)) {
            const conversationIdForLookup =
              realConversationId ||
              (conversationId && !conversationId.startsWith("t_")
                ? conversationId
                : "");

            if (conversationIdForLookup) {
              const deepConversationName = await fetchNameFromConversation(
                conversationIdForLookup,
                participantId,
                pageId,
              );
              if (!needsParticipantNameLookup(deepConversationName)) {
                conversationLookupName = deepConversationName;
              }
            }
          }
        } catch (conversationErr) {
          console.log(
            `[WEBHOOK] Conversation name lookup failed (non-fatal): ${conversationErr.message}`,
          );
        }
      }

      // Source 3: Fetch from Facebook Graph API if still no name
      let profileLookupName = "";
      if (needsParticipantNameLookup(participantName) && !isFromPage) {
        try {
          // Get page access token for the API call
          const { data: pageData } = await db
            .from("facebook_pages")
            .select("page_access_token")
            .eq("page_id", pageId)
            .eq("is_active", true)
            .single();

          if (pageData?.page_access_token) {
            const profileResp = await fetch(
              `https://graph.facebook.com/v21.0/${participantId}?fields=name,first_name,last_name&access_token=${pageData.page_access_token}`
            );
            if (profileResp.ok) {
              const profileData = await profileResp.json();
              profileLookupName = profileData.name || `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim();
              if (!needsParticipantNameLookup(profileLookupName)) {
                console.log(`[WEBHOOK] Got name from Graph API: ${profileLookupName}`);
              }
            } else {
              console.log(`[WEBHOOK] Graph API name lookup unavailable (privacy restriction)`);
            }
          }
        } catch (nameErr) {
          console.log(`[WEBHOOK] Name lookup failed (non-fatal): ${nameErr.message}`);
        }
      }

      // Source 4: Extract from contact's own message (e.g. "I'm Prince")
      const extractedName = !isFromPage
        ? extractNameFromText(message.text || "")
        : "";
      if (extractedName) {
        console.log(`[WEBHOOK] Got name from message text: ${extractedName}`);
      }

      participantName = resolveParticipantName({
        currentName: participantName,
        eventName: senderNameFromEvent,
        conversationName: conversationLookupName,
        graphName: profileLookupName,
        extractedName,
      });

      // Fallback
      console.log(`[WEBHOOK] Name: ${participantName}`);
    }

    const extractedPhone = !isFromPage
      ? extractPhoneFromText(message.text || "")
      : null;
    const existingPhone =
      existingConv?.phone_number ||
      existingConv?.extracted_details?.phone ||
      null;
    const shouldUpdatePhone =
      extractedPhone && extractedPhone !== existingPhone;

    // Save/update conversation - use select + insert/update pattern for robustness
    // This works regardless of whether unique constraint exists
    const isNewConversation = !existingConv;

    const conversationData = {
      conversation_id: conversationId,
      page_id: pageId,
      participant_id: participantId,
      participant_name: participantName || null,
      last_message_text: message.text || "[Attachment]",
      last_message_time: new Date(timestamp).toISOString(),
      last_message_from_page: isFromPage,
      unread_count: newUnreadCount,
      updated_at: new Date().toISOString(),
      // AUTO-ENABLE: AI is enabled by default for all contacts
      ai_enabled: existingConv?.ai_enabled ?? true,
      // Set default goal if not already set - use null for new (column is UUID type)
      active_goal_id: existingConv?.active_goal_id || null,
      // Note: goal_completed column removed - doesn't exist in database
    };

    let convError = null;

    // Use UPSERT with conversation_id as conflict key (has UNIQUE constraint)
    console.log(
      `[WEBHOOK] UPSERTING conversation ${conversationId} for participant ${participantId}`,
    );
    console.log(
      `[WEBHOOK] Save values: isFromPage=${isFromPage}, unread_count=${newUnreadCount}, name=${participantName || "null"}`,
    );
    const { error, data } = await db
      .from("facebook_conversations")
      .upsert(conversationData, {
        onConflict: "conversation_id",
        ignoreDuplicates: false,
      })
      .select();

    convError = error;

    if (error) {
      console.error(`[WEBHOOK] UPSERT FAILED - Code: ${error.code}`);
      console.error(`[WEBHOOK] UPSERT FAILED - Message: ${error.message}`);
      console.error(`[WEBHOOK] UPSERT FAILED - Details: ${error.details}`);
      console.error(`[WEBHOOK] UPSERT FAILED - Hint: ${error.hint}`);
      console.error(
        `[WEBHOOK] Conv ID: ${conversationId}, Page: ${pageId}, Participant: ${participantId}`,
      );
      console.error("[WEBHOOK] Aborting - conversation not saved");
      console.error(
        `[WEBHOOK] Full error object:`,
        JSON.stringify(error, null, 2),
      );
      return;
    }

    console.log(
      `[WEBHOOK] Conversation ${conversationId} saved, unread: ${newUnreadCount}`,
    );

    if (shouldUpdatePhone) {
      const baseDetails = existingConv?.extracted_details || {};
      const updatedDetails = { ...baseDetails, phone: extractedPhone };
      const { error: phoneUpdateError } = await db
        .from("facebook_conversations")
        .update({
          extracted_details: updatedDetails,
          updated_at: new Date().toISOString(),
        })
        .eq("conversation_id", conversationId);

      if (phoneUpdateError) {
        console.error(
          "[WEBHOOK] Error updating extracted phone:",
          phoneUpdateError.message,
        );
      } else {
        console.log(`[WEBHOOK] Saved extracted phone: ${extractedPhone}`);
      }
    }

    // Save message
    // For echoes (messages from page), check if already saved by app
    let sentSource = null;
    if (isFromPage) {
      // Check if this message was already saved by the app (sent via Gaia)
      const { data: existingMsg } = await db
        .from("facebook_messages")
        .select("sent_source")
        .eq("message_id", message.mid)
        .single();

      if (existingMsg?.sent_source === "app") {
        // Already saved by app, don't overwrite sent_source
        sentSource = "app";
        console.log(`[WEBHOOK] Message ${message.mid} was sent via app`);
      } else {
        // Not sent via app = sent via Facebook Business Suite
        sentSource = "business_suite";
        console.log(
          `[WEBHOOK] Message ${message.mid} was sent via Facebook Business Suite`,
        );
      }
    }

    const { error: msgError } = await db.from("facebook_messages").upsert(
      {
        message_id: message.mid,
        conversation_id: conversationId,
        sender_id: senderId,
        message_text: message.text || null,
        attachments: message.attachments || null,
        timestamp: new Date(timestamp).toISOString(),
        is_from_page: isFromPage,
        is_read: isFromPage, // Echo messages are already "read"
        sent_source: sentSource,
      },
      { onConflict: "message_id" },
    );

    if (msgError) {
      console.error("[WEBHOOK] Error saving message:", msgError);
    } else {
      console.log(`[WEBHOOK] Message ${message.mid} saved!`);
    }

    // Track engagement + cancel follow-ups in parallel (await to keep Vercel alive)
    if (!isFromPage) {
      const msgDate = new Date(timestamp);
      try {
        const [, followRes] = await Promise.all([
          db.from("contact_engagement").insert({
            conversation_id: conversationId,
            page_id: pageId,
            message_direction: "inbound",
            day_of_week: msgDate.getDay(),
            hour_of_day: msgDate.getHours(),
            engagement_score: 1,
            message_timestamp: msgDate.toISOString(),
          }),
          db.from("ai_followup_schedule")
            .update({ status: "cancelled", completed_at: new Date().toISOString() })
            .eq("conversation_id", conversationId)
            .eq("status", "pending"),
        ]);
        if (followRes.data?.length > 0) {
          console.log(`[WEBHOOK] Cancelled ${followRes.data.length} pending follow-ups`);
        }
      } catch (err) {
        console.error("[WEBHOOK] Engagement/followup error:", err.message);
      }

      // ============================================
      // A/B TESTING: Track reply for sequence scoring
      // ============================================
      try {
        // Find the most recent unreplied A/B test result for this conversation
        const { data: abResult } = await db
          .from("message_ab_results")
          .select("id, prompt_id, sequence_id, sent_at")
          .eq("conversation_id", conversationId)
          .eq("got_reply", false)
          .order("sent_at", { ascending: false })
          .limit(1)
          .single();

        if (abResult) {
          const sentAt = new Date(abResult.sent_at);
          const replyAt = new Date(timestamp);
          const replyLatencyMins = Math.round((replyAt - sentAt) / (1000 * 60));

          // Calculate conversion score (0-100)
          let conversionScore = 30; // Base: +30 for replying
          if (replyLatencyMins < 60) conversionScore += 20;       // Fast reply
          else if (replyLatencyMins < 360) conversionScore += 10; // Medium reply

          // Update the A/B result
          await db.from("message_ab_results").update({
            got_reply: true,
            replied_at: replyAt.toISOString(),
            reply_latency_minutes: replyLatencyMins,
            conversion_score: conversionScore,
          }).eq("id", abResult.id);

          // Increment total_replies on the prompt
          if (abResult.prompt_id) {
            const { data: promptData } = await db.from("message_prompts")
              .select("total_replies")
              .eq("id", abResult.prompt_id)
              .single();
            if (promptData) {
              await db.from("message_prompts")
                .update({ total_replies: (promptData.total_replies || 0) + 1 })
                .eq("id", abResult.prompt_id);
            }
          }

          // Increment total_replies on the sequence
          if (abResult.sequence_id) {
            const { data: seqData } = await db.from("message_sequences")
              .select("total_replies")
              .eq("id", abResult.sequence_id)
              .single();
            if (seqData) {
              await db.from("message_sequences")
                .update({ total_replies: (seqData.total_replies || 0) + 1 })
                .eq("id", abResult.sequence_id);
            }
          }

          console.log(`[WEBHOOK] 📊 A/B reply tracked: seq=${abResult.sequence_id?.substring(0, 8) || 'none'}, prompt=${abResult.prompt_id?.substring(0, 8) || 'none'}, latency=${replyLatencyMins}min, score=${conversionScore}`);
        }
      } catch (abErr) {
        // Non-fatal - table might not exist yet
        console.log("[WEBHOOK] A/B reply tracking (non-fatal):", abErr.message);
      }
    }

    // TRIGGER AI AUTO-RESPONSE for incoming user messages (NOT echoes)
    if (!isFromPage && message.text) {
      // FOR NEW CONVERSATIONS: Send welcome trigger instead of immediate AI reply
      // Check isNewConversation OR if total messages are very low (e.g. just this one)
      // We can't easily check total messages here without a query, but isNewConversation should be robust if delete worked.
      // However, let's treat it as new if we just upserted it and it had no previous messages.

      const shouldSendWelcome = isNewConversation || (existingConv && existingConv.last_message_time === null);

      if (shouldSendWelcome) {
        console.log("[WEBHOOK] New conversation detected - sending welcome trigger message...");
        const welcomeSent = await sendWelcomeMessage(pageId, participantId, conversationId);
        if (welcomeSent) {
          // Reset recurring notification follow-up timer (7-day countdown restarts)
          db.from("recurring_notification_tokens")
            .update({ followup_sent: false })
            .eq("conversation_id", conversationId)
            .eq("token_status", "active")
            .then(() => { })
            .catch(() => { });
          return; // Stop here, don't trigger AI text response
        }
        // If welcome fail (e.g. no booking URL AND no page token), fall through to AI
        console.log("[WEBHOOK] Welcome message failed (missing config?) - falling back to AI.");
      }

      // Reset recurring notification follow-up timer (7-day countdown restarts)
      db.from("recurring_notification_tokens")
        .update({ followup_sent: false })
        .eq("conversation_id", conversationId)
        .eq("token_status", "active")
        .then(() => { })
        .catch(() => { });

      // MUST await: Vercel kills unawaited promises when handler returns.
      // This is safe because we already sent 200 to Facebook before processing.
      console.log("[WEBHOOK] Triggering AI response (awaited)...");
      try {
        await triggerAIResponse(db, conversationId, pageId, existingConv || conversationData);
        console.log("[WEBHOOK] AI response completed");
      } catch (err) {
        console.error("[WEBHOOK] AI response error:", err.message);
      }

      // AI AUTO-LABELING: Apply labels based on conversation content
      // Must await to prevent Vercel from killing the function
      await (async () => {
        try {
          const { data: aiSettings } = await db
            .from("settings")
            .select("value")
            .eq("key", "ai_chatbot_config")
            .single();

          if (aiSettings?.value?.auto_labeling_enabled !== false) {
            // Get messages FIRST (needed by both AI and keyword fallback)
            const { data: msgs } = await db
              .from("facebook_messages")
              .select("message_text, is_from_page")
              .eq("conversation_id", conversationId)
              .order("timestamp", { ascending: true })
              .limit(50);

            if (msgs && msgs.length > 0) {
              // Get existing tags
              const { data: existingTagAssignments } = await db
                .from("conversation_tag_assignments")
                .select("tag:tag_id(name)")
                .eq("conversation_id", conversationId);

              const existingTagNames = (existingTagAssignments || [])
                .map((t) => t.tag?.name)
                .filter(Boolean);

              // ── Step 1: Try AI-based labeling (may fail if import breaks) ──
              let result = { labelsToAdd: [], labelsToRemove: [], reasoning: "" };
              try {
                const { autoLabelConversation } =
                  await import("../src/services/aiConversationAnalyzer.js");
                const labelingRules = aiSettings?.value?.labeling_rules || "";
                result = await autoLabelConversation(
                  msgs,
                  existingTagNames,
                  labelingRules,
                );
              } catch (aiErr) {
                console.log(
                  "[WEBHOOK] AI auto-label import/call failed, using keyword fallback:",
                  aiErr.message,
                );
              }

              // Apply tag changes if AI returned any
              if (
                result.labelsToAdd?.length > 0 ||
                result.labelsToRemove?.length > 0
              ) {
                console.log(
                  `[WEBHOOK] Auto-label result: +${result.labelsToAdd?.join(",")} -${result.labelsToRemove?.join(",")} | ${result.reasoning}`,
                );

                // Apply labels (create tag if needed, then assign)
                for (const labelName of result.labelsToAdd || []) {
                  const normalizedName = labelName.toUpperCase().trim();

                  let { data: existingTag } = await db
                    .from("conversation_tags")
                    .select("id")
                    .eq("page_id", pageId)
                    .ilike("name", normalizedName)
                    .single();

                  if (!existingTag) {
                    const { data: newTag } = await db
                      .from("conversation_tags")
                      .insert({
                        page_id: pageId,
                        name: normalizedName,
                        color: "#818cf8",
                      })
                      .select("id")
                      .single();
                    existingTag = newTag;
                  }

                  if (existingTag) {
                    await db.from("conversation_tag_assignments").upsert(
                      {
                        conversation_id: conversationId,
                        tag_id: existingTag.id,
                      },
                      {
                        onConflict: "conversation_id,tag_id",
                        ignoreDuplicates: true,
                      },
                    );
                  }
                }

                for (const labelName of result.labelsToRemove || []) {
                  const normalizedName = labelName.toUpperCase().trim();
                  const { data: tagToRemove } = await db
                    .from("conversation_tags")
                    .select("id")
                    .eq("page_id", pageId)
                    .ilike("name", normalizedName)
                    .single();

                  if (tagToRemove) {
                    await db
                      .from("conversation_tag_assignments")
                      .delete()
                      .eq("conversation_id", conversationId)
                      .eq("tag_id", tagToRemove.id);
                  }
                }
              }

              // ── Step 2: Map to ai_label column (ALWAYS runs) ──
              const AI_LABEL_MAP = {
                'HOT_LEAD': 'hot_lead',
                'HOT LEAD': 'hot_lead',
                'INTERESTED': 'interested',
                'QUALIFIED': 'interested',
                'NOT_INTERESTED': 'not_interested',
                'NOT INTERESTED': 'not_interested',
                'UNQUALIFIED': 'not_interested',
                'FOLLOW_UP_NEEDED': 'message_later',
                'FOLLOW UP NEEDED': 'message_later',
                'MESSAGE_LATER': 'message_later',
                'BOOKED': 'booked',
                'CONVERTED': 'converted',
                'COLD_LEAD': 'cold_lead',
                'COLD LEAD': 'cold_lead',
                'PRICE_SENSITIVE': 'price_sensitive',
                'PRICE SENSITIVE': 'price_sensitive',
                'NEEDS_INFO': 'needs_info',
                'NEEDS INFO': 'needs_info',
                'DO_NOT_MESSAGE': 'do_not_message',
                'DO NOT MESSAGE': 'do_not_message',
                'ALREADY_BOUGHT': 'already_bought',
                'ALREADY BOUGHT': 'already_bought',
                'NO_RESPONSE': 'no_response',
                'NO RESPONSE': 'no_response',
                'WARM_LEAD': 'interested',
                'WARM LEAD': 'interested',
              };

              // Try AI result labels first, then existing tags
              const allLabelNames = [
                ...(result.labelsToAdd || []),
                ...existingTagNames,
              ];
              let bestAiLabel = null;
              for (const name of allLabelNames) {
                const mapped =
                  AI_LABEL_MAP[name.toUpperCase().trim()];
                if (mapped) {
                  bestAiLabel = mapped;
                  break;
                }
              }

              // ── Step 3: Keyword fallback (runs even if AI failed) ──
              if (!bestAiLabel) {
                const customerMsgs = msgs
                  .filter(m => !m.is_from_page)
                  .map(m => (m.message_text || "").toLowerCase())
                  .join(" ");

                if (/\b(book|reserve|schedule|appointment|let['']?s go|take my money|sign me up|how do i pay)\b/i.test(customerMsgs)) {
                  bestAiLabel = "hot_lead";
                } else if (/\b(not interested|no thanks|pass|don['']?t want|stop messaging|unsubscribe)\b/i.test(customerMsgs)) {
                  bestAiLabel = "not_interested";
                } else if (/\b(how much|price|magkano|presyo|cost|budget|afford|expensive|cheap)\b/i.test(customerMsgs)) {
                  bestAiLabel = "price_sensitive";
                } else if (/\b(interested|tell me more|sounds good|what are|can you|do you have|curious|looking for)\b/i.test(customerMsgs)) {
                  bestAiLabel = "interested";
                } else if (/\b(later|next week|next month|busy|call me|message me|remind)\b/i.test(customerMsgs)) {
                  bestAiLabel = "message_later";
                } else if (msgs.length >= 2) {
                  bestAiLabel = "needs_info";
                }
                if (bestAiLabel) {
                  console.log(`[WEBHOOK] 🏷️ Keyword fallback label: ${bestAiLabel}`);
                }
              }

              // ── Step 4: Update ai_label column ──
              if (bestAiLabel) {
                const { data: currentConv } = await db
                  .from("facebook_conversations")
                  .select("ai_label")
                  .eq("conversation_id", conversationId)
                  .single();

                const criticalLabels = [
                  "do_not_message",
                  "not_interested",
                  "already_bought",
                ];
                const currentLabel = currentConv?.ai_label;
                const shouldUpdate =
                  !criticalLabels.includes(currentLabel) ||
                  criticalLabels.includes(bestAiLabel);

                if (shouldUpdate && currentLabel !== bestAiLabel) {
                  await db
                    .from("facebook_conversations")
                    .update({
                      ai_label: bestAiLabel,
                      ai_label_set_at: new Date().toISOString(),
                      ai_label_set_by: "system",
                      updated_at: new Date().toISOString(),
                    })
                    .eq("conversation_id", conversationId);

                  console.log(
                    `[WEBHOOK] 🏷️ ai_label updated: ${currentLabel || "none"} → ${bestAiLabel}`,
                  );
                }
              }
            }
          }
        } catch (labelErr) {
          console.log(
            "[WEBHOOK] Auto-label error (non-fatal):",
            labelErr.message,
          );
        }
      })();
    }
  } catch (error) {
    console.error("[WEBHOOK] Exception:", error);
  }
}

/**
 * Trigger AI auto-response for a conversation
 */
async function triggerAIResponse(db, conversationId, pageId, conversation) {
  try {
    console.log("[WEBHOOK] === AI AUTO-RESPONSE ===");
    const startTime = Date.now();

    // FAST CHECKS first (no DB needed)
    if (conversation?.ai_enabled === false) {
      console.log("[WEBHOOK] AI disabled for this conversation");
      return;
    }
    if (conversation?.human_takeover === true) {
      console.log("[WEBHOOK] Human takeover active - AI skipping");
      return;
    }
    // COOLDOWN: Don't respond if we responded in the last 30 seconds
    if (conversation?.last_ai_response_at) {
      const secondsSince = (Date.now() - new Date(conversation.last_ai_response_at).getTime()) / 1000;
      if (secondsSince < 30) {
        console.log(`[WEBHOOK] AI cooling down - ${secondsSince}s ago`);
        return;
      }
    }

    // PARALLEL: Fetch settings + spam check at the same time
    let settingsResult, spamCheckResult;
    try {
      [settingsResult, spamCheckResult] = await Promise.all([
        db.from("settings").select("value").eq("key", "ai_chatbot_config").single(),
        db.from("facebook_messages").select("is_from_page").eq("conversation_id", conversationId).order("timestamp", { ascending: false }).limit(3),
      ]);
    } catch (parallelErr) {
      console.error("[WEBHOOK] Parallel fetch 1 FAILED:", parallelErr.message);
      return;
    }

    const config = settingsResult.data?.value || {};

    if (config.global_bot_enabled === false) {
      console.log("[WEBHOOK] Global bot disabled");
      return;
    }
    if (config.auto_respond_to_new_messages === false) {
      console.log("[WEBHOOK] AI auto-respond disabled");
      return;
    }

    // Spam check
    const lastMessages = spamCheckResult.data;
    if (lastMessages && lastMessages.length >= 2) {
      let consecutivePageMessages = 0;
      for (const msg of lastMessages) {
        if (msg.is_from_page) consecutivePageMessages++;
        else break;
      }
      if (consecutivePageMessages >= 2) {
        console.log(`[WEBHOOK] Spam prevention - ${consecutivePageMessages} consecutive page messages`);
        return;
      }
    }

    console.log(`[WEBHOOK] Checks passed in ${Date.now() - startTime}ms - loading data...`);

    // PARALLEL: Fetch page context and messages first
    let pageResult, messagesResult;
    try {
      [pageResult, messagesResult] = await Promise.all([
        db.from("facebook_pages").select("page_access_token,team_id,organization_id").eq("page_id", pageId).single(),
        db.from("facebook_messages").select("message_text,is_from_page,attachments").eq("conversation_id", conversationId).order("timestamp", { ascending: false }).limit(20),
      ]);
    } catch (parallelErr) {
      console.error("[WEBHOOK] Parallel fetch 2 FAILED:", parallelErr.message);
      return;
    }

    const page = pageResult.data;

    let properties = [];
    try {
      if (!page?.team_id && !page?.organization_id) {
        console.warn("[WEBHOOK] Page has no tenant scope; skipping property recommendations for safety");
      } else {
        let propertiesQuery = db
          .from("properties")
          .select("id,title,address,price,bedrooms,bathrooms,floor_area,description,images,team_id,organization_id")
          .eq("status", "For Sale")
          .order("created_at", { ascending: false })
          .limit(10);

        propertiesQuery = applyScopeToPropertyQuery(propertiesQuery, {
          teamId: page?.team_id,
          organizationId: page?.organization_id,
        });

        const { data: scopedProperties, error: propertiesErr } = await propertiesQuery;
        if (propertiesErr) {
          console.error("[WEBHOOK] Failed loading scoped properties:", propertiesErr.message);
        } else {
          properties = scopedProperties || [];
        }
      }
    } catch (propertiesErr) {
      console.error("[WEBHOOK] Property fetch error:", propertiesErr.message);
    }

    const recentMessages = (messagesResult.data || []).reverse();

    if (!page?.page_access_token) {
      console.error("[WEBHOOK] ❌ No page access token found for page:", pageId);
      return;
    }
    if (page.page_access_token === "pending") {
      console.error("[WEBHOOK] ❌ Page access token is 'pending' — page was auto-created but not properly connected. Go to Gaia settings and reconnect your Facebook page.");
      return;
    }

    console.log(`[WEBHOOK] Data loaded in ${Date.now() - startTime}ms - ${properties?.length || 0} properties, ${recentMessages.length} messages`);

    // Build AI prompt with Taglish as default language
    const systemPrompt =
      config.system_prompt ||
      "You are a friendly AI sales assistant for a business. Be helpful, professional, and concise.";
    const knowledgeBase = config.knowledge_base || "";
    const faqContent = config.faq || ""; // FAQ for RAG pipeline
    const language = config.language || "Taglish"; // Default to Taglish (Tagalog + English mix)
    const botRulesDonts = config.bot_rules_donts || "";
    const disallowGreetings = /never introduce|do not introduce|dont introduce|don't introduce/i.test(botRulesDonts);
    const knownPhone =
      conversation?.phone_number || conversation?.extracted_details?.phone;
    const displayName = getDisplayContactName(
      conversation?.participant_name,
      getFirstName,
    );

    // ============================================
    // EVALUATION GATING LOGIC — Based on admin-defined evaluation questions
    // ============================================
    let evaluationScore = 0;
    let canViewProperties = true;
    let gatingReason = "";
    let evaluationThreshold = 70;
    let evaluationHalfThreshold = 35;
    let evaluationQuestions = [];
    let answeredQuestionNumbers = [];
    let evaluationQuestionPlan = null;

    try {
      // 1. Get threshold setting (default 70%) — NO .single() to avoid PGRST116 when row missing
      let threshold = 70;
      try {
        const { data: thresholdRows } = await db
          .from('settings')
          .select('value')
          .eq('key', 'evaluation_threshold')
          .limit(1);
        if (thresholdRows?.[0]?.value?.percentage) {
          threshold = thresholdRows[0].value.percentage;
        }
      } catch (e) { /* use default 70 */ }
      console.log(`[WEBHOOK] 📋 Eval threshold: ${threshold}%`);
      evaluationThreshold = threshold;
      evaluationHalfThreshold = Math.round(threshold / 2);

      // 2. Load evaluation questions from config or dedicated settings key
      if (config.evaluation_questions && Array.isArray(config.evaluation_questions) && config.evaluation_questions.length > 0) {
        evaluationQuestions = config.evaluation_questions;
        console.log(`[WEBHOOK] 📋 Eval questions loaded from ai_chatbot_config: ${evaluationQuestions.length} questions`);
      } else {
        try {
          const { data: evalRows } = await db
            .from('settings')
            .select('value')
            .eq('key', 'evaluation_questions')
            .limit(1);
          if (evalRows?.[0]?.value?.questions && Array.isArray(evalRows[0].value.questions)) {
            evaluationQuestions = evalRows[0].value.questions;
            console.log(`[WEBHOOK] 📋 Eval questions loaded from settings key: ${evaluationQuestions.length} questions`);
          }
        } catch (e) { /* no questions */ }
      }

      if (evaluationQuestions.length === 0) {
        // Use default questions if none configured
        evaluationQuestions = [
          'What is your primary business goal?',
          'What is your marketing budget?',
          'Who is your target audience?',
          'What has been your biggest marketing challenge?',
          'Why are you looking for our services now?'
        ];
        console.log(`[WEBHOOK] 📋 No eval questions found, using ${evaluationQuestions.length} defaults`);
      }

      const customerMessagesList = recentMessages
        .filter(m => !m.is_from_page)
        .map(m => (m.message_text || '').trim())
        .filter(Boolean);
      const customerMessages = customerMessagesList.join('\n');
      console.log(`[WEBHOOK] 📋 Customer messages for eval: ${customerMessages.length} chars (${customerMessagesList.length} msgs)`);

      let answeredCount = 0;
      const rememberedAnsweredQuestionNumbers = Array.isArray(
        conversation?.extracted_details?.evaluation_answered_questions,
      )
        ? conversation.extracted_details.evaluation_answered_questions
        : [];

      if (customerMessagesList.length > 0) {
        let aiAnsweredQuestionNumbers = [];
        let keywordMatchedNumbers = [];

        // Try AI check first
        const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;

        if (NVIDIA_API_KEY) {
          try {
            const questionList = evaluationQuestions
              .map((q, i) => `${i + 1}. ${q}`)
              .join('\n');

            const checkPrompt = `Analyze the customer messages below and determine which evaluation questions have been answered.

## Evaluation Questions:
${questionList}

## Customer Messages:
${customerMessages}

Return EXACTLY one JSON array of question numbers (1-indexed) that have been answered or have enough info to consider answered.
Do not add labels, explanation, bullets, or extra text.
If unsure, return an empty array.
Be generous - if the customer provided related info even without being directly asked, count it.

Example response: [1, 3, 5]
If none answered: []`;

            const aiResp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NVIDIA_API_KEY}`
              },
              body: JSON.stringify({
                model: 'meta/llama-3.1-8b-instruct',
                messages: [{ role: 'user', content: checkPrompt }],
                temperature: 0.1,
                max_tokens: 100
              })
            });

            if (aiResp.ok) {
              const aiData = await aiResp.json();
              const aiText = aiData.choices?.[0]?.message?.content?.trim() || '';
              console.log(`[WEBHOOK] 📋 Eval AI raw response: ${aiText}`);

              aiAnsweredQuestionNumbers = parseAiAnsweredQuestionNumbers(
                aiText,
                evaluationQuestions.length,
              );

              if (aiAnsweredQuestionNumbers.length === 0 && aiText) {
                console.log("[WEBHOOK] 📋 Eval AI output not strict JSON array - ignoring AI parsed answers");
              }

              answeredCount = aiAnsweredQuestionNumbers.length;
              console.log(`[WEBHOOK] 📋 Evaluation: ${answeredCount}/${evaluationQuestions.length} questions answered (AI check)`);
            } else {
              console.log(`[WEBHOOK] 📋 Eval AI call failed: ${aiResp.status} ${aiResp.statusText}`);
            }
          } catch (aiErr) {
            console.log('[WEBHOOK] 📋 Eval AI check error:', aiErr.message);
          }
        } else {
          console.log('[WEBHOOK] 📋 No NVIDIA_API_KEY — skipping AI eval check');
        }

        // Keyword signal (always compute), then merge with AI + remembered memory
        const custText = customerMessages.toLowerCase();
        for (let i = 0; i < evaluationQuestions.length; i += 1) {
          const q = evaluationQuestions[i];
          const keywords = q.toLowerCase()
            .replace(/[?.,!]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3 && !['what', 'your', 'have', 'been', 'with', 'this', 'that', 'from', 'they', 'will', 'does', 'which'].includes(w));
          const matchCount = keywords.filter(kw => custText.includes(kw)).length;
          if (matchCount >= Math.max(1, Math.floor(keywords.length * 0.3))) {
            keywordMatchedNumbers.push(i + 1);
          }
        }

        answeredQuestionNumbers = mergeAnsweredQuestionNumbers({
          totalQuestions: evaluationQuestions.length,
          rememberedQuestionNumbers: rememberedAnsweredQuestionNumbers,
          aiAnsweredQuestionNumbers,
          keywordAnsweredQuestionNumbers: keywordMatchedNumbers,
        });

        answeredQuestionNumbers = promoteLastAskedQuestionAsAnswered({
          evalQuestions: evaluationQuestions,
          answeredQuestionNumbers,
          recentMessages,
        });

        answeredCount = answeredQuestionNumbers.length;
        console.log(
          `[WEBHOOK] 📋 Evaluation merged answers: ${answeredCount}/${evaluationQuestions.length} (remembered=${rememberedAnsweredQuestionNumbers.length}, ai=${aiAnsweredQuestionNumbers.length}, keyword=${keywordMatchedNumbers.length})`,
        );

        // Last-resort fallback only if all detectors fail
        if (answeredCount === 0) {
          answeredCount = Math.min(customerMessagesList.length, evaluationQuestions.length);
          answeredQuestionNumbers = Array.from({ length: answeredCount }, (_, i) => i + 1);
          console.log(`[WEBHOOK] 📋 Evaluation reply-count fallback: ${answeredCount}/${evaluationQuestions.length}`);
        }
      } else {
        console.log('[WEBHOOK] 📋 No customer messages for evaluation');

        answeredQuestionNumbers = mergeAnsweredQuestionNumbers({
          totalQuestions: evaluationQuestions.length,
          rememberedQuestionNumbers: rememberedAnsweredQuestionNumbers,
          aiAnsweredQuestionNumbers: [],
          keywordAnsweredQuestionNumbers: [],
        });
      }

      evaluationQuestionPlan = getEvaluationQuestionPlan({
        evalQuestions: evaluationQuestions,
        answeredQuestionNumbers,
        recentMessages,
      });

      answeredQuestionNumbers = evaluationQuestionPlan.answeredQuestionNumbers;
      answeredCount = answeredQuestionNumbers.length;
      evaluationScore = Math.round((answeredCount / evaluationQuestions.length) * 100);
      console.log(`[WEBHOOK] 📋 Final evaluation score: ${evaluationScore}%`);

      // 4. Determine status
      if (evaluationScore < threshold) {
        canViewProperties = false;
        gatingReason = `Evaluation score ${evaluationScore}% is below threshold ${threshold}%`;
        console.log(`[WEBHOOK] ⛔ Property gating ACTIVE: ${gatingReason}`);
      } else {
        console.log(`[WEBHOOK] ✅ Property gating PASSED: Score ${evaluationScore}% >= ${threshold}%`);
      }
    } catch (evalErr) {
      console.error("[WEBHOOK] ❌ Evaluation logic error:", evalErr.message, evalErr.stack);
      canViewProperties = true;
    }

    // Save evaluation score + answered-question memory to conversation
    try {
      const existingExtractedDetails =
        conversation?.extracted_details &&
          typeof conversation.extracted_details === "object"
          ? conversation.extracted_details
          : {};

      const mergedExtractedDetails = {
        ...existingExtractedDetails,
        evaluation_answered_questions: answeredQuestionNumbers,
        evaluation_questions_total: evaluationQuestions.length,
        evaluation_last_updated_at: new Date().toISOString(),
      };

      await db.from("facebook_conversations")
        .update({
          evaluation_score: evaluationScore,
          extracted_details: mergedExtractedDetails,
        })
        .eq("conversation_id", conversationId);
    } catch (e) {
      console.log("[WEBHOOK] Evaluation memory save (non-fatal):", e.message);
    }

    // DEBUG: Log what RAG content we have
    console.log("[WEBHOOK] RAG Content Check:", {
      hasKnowledgeBase: !!knowledgeBase,
      kbLength: knowledgeBase.length,
      hasFaq: !!faqContent,
      faqLength: faqContent.length,
      language: language,
    });

    let aiPrompt = `## Role
${systemPrompt}
`;

    // === BOT RULES: INJECTED AT TOP FOR MAXIMUM COMPLIANCE ===
    if (config.bot_rules_dos || config.bot_rules_donts) {
      aiPrompt += `\n## 🚨 ABSOLUTE RULES — OVERRIDE EVERYTHING ELSE (SET BY YOUR OWNER)\nThese rules were set by the business owner. You MUST follow them in EVERY response. Violating these rules is UNACCEPTABLE.\n`;
      if (config.bot_rules_dos) {
        aiPrompt += `\n### ✅ YOU MUST DO:\n${config.bot_rules_dos}\n`;
      }
      if (config.bot_rules_donts) {
        aiPrompt += `\n### ❌ YOU MUST NEVER DO:\n${config.bot_rules_donts}\n`;
      }
      aiPrompt += `\n---\n`;
    }

    aiPrompt += `
## 🗣️ LANGUAGE (CRITICAL - MUST FOLLOW)
You MUST respond in ${language}. This is MANDATORY.
- Use Taglish (mix Filipino and English naturally in sentences)
- Use "po" and "opo" for respect
- Example: "Salamat po sa message mo. Ano po ang hinahanap mong property?"
- Example: "Based sa sinabi mo, Manila area po. Ano po budget range ninyo?"
- NEVER respond in pure English only - always mix Filipino words.

## Platform: Facebook Messenger
Contact Name: ${displayName || "NOT PROVIDED"}
${knownPhone ? `Phone Number: ${knownPhone}` : ""}
${conversation?.pipeline_stage ? `Pipeline Stage: ${conversation.pipeline_stage}` : ""}
${conversation?.lead_status ? `Lead Status: ${conversation.lead_status}` : ""}

${conversation?.agent_context
        ? `## 📝 IMPORTANT CONTEXT (Agent Notes - REMEMBER THIS)
${conversation.agent_context}
---
The above context was provided by a team member. Use this information to personalize responses and remember key details about this customer.`
        : ""
      }
`;

    // Add ACTIVE GOAL for the conversation
    const activeGoal = conversation?.active_goal_id || "booking";
    const goalDescriptions = {
      booking:
        "Get the customer to book a consultation or meeting. Guide them towards scheduling.",
      qualification:
        "Qualify the lead - understand their needs, budget, and timeline.",
      information:
        "Provide information about services and answer questions helpfully.",
      follow_up: "Re-engage the contact and move them towards next steps.",
      closing: "Close the deal - confirm property selection and arrange viewing.",
    };

    // Check if contact has opted in to recurring notifications
    const hasOptedIn = conversation?.recurring_optin_status === 'opted_in';

    // === BOOKING PUSH FREQUENCY CONTROL ===
    // Only push booking on first encounter, evaluation halfway, or evaluation complete
    const aiReplyCount = recentMessages ? recentMessages.filter(m => m.is_from_page).length : 0;
    const isFirstAIReply = aiReplyCount === 0;
    const bookingMilestones = (conversation?.booking_btn_milestones && typeof conversation.booking_btn_milestones === "object")
      ? conversation.booking_btn_milestones
      : {};

    // Check time gap since last contact message (for silence detection)
    let timeSinceLastContactMsg = 0; // in minutes
    if (recentMessages && recentMessages.length > 0) {
      const contactMsgs = recentMessages.filter(m => !m.is_from_page && m.created_at);
      if (contactMsgs.length > 0) {
        const lastContactTime = new Date(contactMsgs[contactMsgs.length - 1].created_at);
        timeSinceLastContactMsg = (Date.now() - lastContactTime.getTime()) / (1000 * 60);
      }
    }

    const isFirstBooking = isFirstAIReply && !bookingMilestones.first;
    const atHalfBooking = evaluationScore >= evaluationHalfThreshold && !bookingMilestones.half;
    const atFullBooking = evaluationScore >= evaluationThreshold && !bookingMilestones.full;
    const shouldPushBooking = isFirstBooking || atHalfBooking || atFullBooking;

    aiPrompt += `
## 🎯 YOUR PRIORITIES (Follow this order STRICTLY)
`;

    // When evaluation is NOT complete, asking questions is top priority
    if (!canViewProperties) {
      let evalQuestions = Array.isArray(evaluationQuestions)
        ? [...evaluationQuestions]
        : [];

      if (evalQuestions.length === 0) {
        // Safety fallback if evaluation section above failed
        evalQuestions = config.evaluation_questions || [];
        try {
          const { data: evalSetting } = await db
            .from('settings')
            .select('value')
            .eq('key', 'evaluation_questions')
            .single();
          if (evalSetting?.value?.questions?.length > 0) {
            evalQuestions = evalSetting.value.questions;
          }
        } catch (e) {
          console.log('[WEBHOOK] Could not load evaluation_questions setting');
        }
      }

      const questionPlan =
        evaluationQuestionPlan &&
          Array.isArray(evaluationQuestions) &&
          evaluationQuestions.length === evalQuestions.length
          ? evaluationQuestionPlan
          : getEvaluationQuestionPlan({
            evalQuestions,
            answeredQuestionNumbers,
            recentMessages,
          });
      const answeredNumbersText = questionPlan.answeredQuestionNumbers.length > 0
        ? questionPlan.answeredQuestionNumbers.join(', ')
        : 'none yet';
      const unansweredNumbersText = questionPlan.unansweredQuestionNumbers.length > 0
        ? questionPlan.unansweredQuestionNumbers.join(', ')
        : 'none';
      const nextQuestionNumber = questionPlan.nextQuestionNumber || 1;
      const nextQuestionText = questionPlan.nextQuestion || evalQuestions[0] || '';

      // Build a summary of what the customer already told us
      const customerMessages = (recentMessages || []).filter(m => !m.is_from_page && m.message_text);
      const conversationSummary = customerMessages.map(m => m.message_text).join(' | ');

      if (evalQuestions.length > 0) {
        aiPrompt += `
### Priority 1: 📋 ASK YOUR EVALUATION QUESTIONS (HIGHEST PRIORITY — MUST DO)
You are evaluating this customer. Score: ${evaluationScore}% (need more info to unlock property recommendations).

Here are YOUR evaluation questions. Ask them ONE AT A TIME in order.

**YOUR QUESTIONS:**
${evalQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

**WHAT THE CUSTOMER HAS ALREADY SAID:** "${conversationSummary || 'Nothing yet'}"
**ANSWERED QUESTION NUMBERS:** ${answeredNumbersText}
**UNANSWERED QUESTION NUMBERS:** ${unansweredNumbersText}
**NEXT REQUIRED QUESTION:** Q${nextQuestionNumber}: ${nextQuestionText}

⚡ CRITICAL RULES:
- REVIEW the conversation history above carefully — do NOT ask a question the customer already answered
- If they already said their location, DO NOT ask about location again
- If they already said their budget, DO NOT ask about budget again
- Ask the NEXT REQUIRED QUESTION shown above
- If their last reply is unclear or partial, ask ONE short clarification follow-up for that same question
- Do NOT repeat the exact same question wording twice in a row
- If ALL questions seem answered, acknowledge their answers and tell them you're finding the best match
- Ask ONE question per message, wait for their answer
- Be natural and conversational, like a friendly agent
- Do NOT ask "Can I ask you some questions?" — just ASK the question directly
- Do NOT recommend any properties — they are LOCKED
- Do NOT skip to booking or scheduling
${questionPlan.shouldAskClarifyingFollowup
            ? `- IMPORTANT NOW: The customer already replied to Q${nextQuestionNumber}. Ask a clarification follow-up for Q${nextQuestionNumber} using new wording (1 sentence max).`
            : ''}
`;
      } else {
        aiPrompt += `
### Priority 1: 📋 GET TO KNOW THE CUSTOMER (HIGHEST PRIORITY)
Ask the customer about what they're looking for in a property. Be conversational and friendly.
Ask about their preferences naturally — what type, where, budget, size, etc.
Ask ONE question per message. Do NOT recommend properties yet — they are locked.
`;
      }

      aiPrompt += `
### Priority 2: 📞 Be Conversational
After asking the evaluation question, be friendly and natural. Make it feel like a chat, not an interrogation.

### Priority 3: ${hasOptedIn ? '✅ Opt-in secured!' : '🔔 Get Notification Opt-in (LOW PRIORITY for now)'}
${hasOptedIn
          ? 'The customer has already opted in. Great!'
          : `After asking your evaluation question, you may ALSO include an opt-in hook.
- Add this marker at the END (not start) of your response: OPTIN_HOOK: [catchy text, max 20 words]
- Only do this if it feels natural — evaluation questions are more important right now.`}
`;
    } else {
      // Evaluation is COMPLETE — now focus on opt-in and booking
      aiPrompt += `
### Priority 1: ${hasOptedIn ? '✅ Opt-in secured!' : '🔔 Get Notification Opt-in (HIGHEST PRIORITY)'}
${hasOptedIn
          ? 'The customer has already opted in. Great! Focus on next priorities.'
          : `The customer has NOT yet clicked the notification opt-in button below. Your TOP TASK is to naturally encourage them to click it.
- START your response with this EXACT marker: OPTIN_HOOK: [Your short, catchy text here]
- The system will use your text to create a button for them to click.
- Create a catchy hook (max 20 words). Examples:
  - "I saved a spot for you — click below so I can reach out pag may perfect property na!"
  - "Click below po para ma-message kita pag may perfect match na!"
  - "Quick question — are you still looking? Tap below so I can help you find it!"`
        }

### Priority 2: 📞 Hop on a Call + Evaluation
Encourage the customer to schedule a quick call for a personalized property evaluation.
- Say: "Want me to do a quick evaluation para sa perfect property mo? We can hop on a call!"
- Make it feel low-pressure and helpful.

### Priority 3: 📅 Booking
${shouldPushBooking
          ? `Goal: ${activeGoal.toUpperCase()}
Instructions: ${goalDescriptions[activeGoal] || "Help the customer and guide them towards taking action."}
Gently guide the conversation towards scheduling a consultation.`
          : `The customer is actively engaged in conversation. Focus on answering their questions naturally.
Do NOT push booking, scheduling, or consultations unless the customer explicitly asks about it.
If they ask about booking, help them — otherwise just be helpful and conversational.`}
`;
    }

    const customGoals = config.custom_goals?.trim();
    if (customGoals) {
      aiPrompt += `\n## Additional Goals\n${customGoals}\n`;
    }

    // Booking context — only add proactive booking instructions when shouldPushBooking is true
    if (shouldPushBooking && (activeGoal === "booking" || config.booking_url)) {
      aiPrompt += `\n## 📅 BOOKING\nWhen customer wants to book, suggest weekday times (Mon-Fri 9AM-5PM).\nIf they confirm, add this marker at the END of your response:\nBOOKING_CONFIRMED: YYYY-MM-DD HH:MM | CustomerName | PhoneNumber\n`;
    } else if (config.booking_url) {
      // Always keep the booking marker instructions available (if customer asks)
      aiPrompt += `\n## 📅 BOOKING (only if customer asks)\nIf the customer explicitly asks to book/schedule, suggest weekday times (Mon-Fri 9AM-5PM).\nIf they confirm, add this marker at the END of your response:\nBOOKING_CONFIRMED: YYYY-MM-DD HH:MM | CustomerName | PhoneNumber\n`;
    }

    // Add Knowledge Base (company info, services, etc.)
    if (knowledgeBase) {
      aiPrompt += `
## 📚 Knowledge Base (About the Business - USE THIS INFO)
${knowledgeBase}
`;
    }

    // Add FAQ section for RAG
    if (faqContent) {
      aiPrompt += `
## ❓ FAQ (MUST USE these exact answers when relevant)
${faqContent}
`;
    }

    // Bot rules were already added at the TOP of the prompt for maximum compliance
    // Add a reminder at the end too
    if (config.bot_rules_dos || config.bot_rules_donts) {
      aiPrompt += `\n## ⚠️ REMINDER: Follow the ABSOLUTE RULES from above!\n`;
      if (config.bot_rules_donts) {
        aiPrompt += `DO NOT: ${config.bot_rules_donts}\n`;
      }
    }

    // Add properties (compact format) — GATED by evaluation score
    if (properties && properties.length > 0) {
      if (canViewProperties) {
        // ✅ Evaluation threshold met — show properties but enforce BEST MATCH ONLY
        const propertyList = properties.map((p) =>
          `- ID:${p.id} | ${p.title} | ${p.address} | ₱${parseInt(p.price || 0).toLocaleString()} | ${p.bedrooms || '?'}BR/${p.bathrooms || '?'}BA | ${p.floor_area || '?'}sqm${p.images?.[0] ? ` | img:${p.images[0]}` : ''}`
        ).join('\n');

        aiPrompt += `\n## 🏠 PROPERTIES FOR SALE (EVALUATION COMPLETE ✅ — Score: ${evaluationScore}%)
${propertyList}

To show a property card: SEND_PROPERTY_CARD: [property_id]

## ⚠️ STRICT RULES FOR PROPERTY RECOMMENDATIONS
1. Send ONLY the **ONE** best-matching property card. Never send multiple cards unless the customer explicitly asks "show me more" or "other options".
2. Explain WHY this property is the best match for them based on their stated preferences.
3. If the customer asks for alternatives, you may send ONE more at a time.
`;
      } else {
        // ⛔ Evaluation NOT complete — just tell AI properties are locked
        aiPrompt += `\n## 🏠 PROPERTY RECOMMENDATIONS (LOCKED 🔒 — Score: ${evaluationScore}%)
You do NOT have access to the property list yet. The customer's evaluation is incomplete.
Continue asking the evaluation questions from Priority 1 above.
Do NOT mention evaluation, score, threshold, or percentage to the customer.
Do NOT recommend any properties yet. Say something like "Let me find the perfect match for you po!"
`;
      }
    }

    if (config.booking_url) {
      aiPrompt += `\n## 📅 BOOKING LINK
Booking link: ${config.booking_url}
NOTE: The system automatically sends a booking button card to the customer. Do NOT include the booking link as raw text in your messages.
${shouldPushBooking ? 'You may mention booking verbally (e.g. "you can book a consultation using the button above") to encourage scheduling.' : 'Do NOT mention booking unless the customer explicitly asks about scheduling or appointments. Focus on their current question.'}
`;
    }

    // Log booking push decision
    console.log(`[WEBHOOK] Booking push decision: first=${isFirstBooking}, half=${atHalfBooking}, full=${atFullBooking}, shouldPush=${shouldPushBooking}, aiReplies=${aiReplyCount}, gapMinutes=${Math.round(timeSinceLastContactMsg)}`);

    aiPrompt += `
## RULES
- Customer name: "${displayName || "NOT PROVIDED"}" (if NOT PROVIDED, use "po" instead)
- Conversation status: ${isFirstAIReply ? "first reply" : "ongoing conversation"}
- NEVER invent names. Use "po" for respect.
- Split responses with ||| (1-2 sentences per part, like texting)
 - Example: "Salamat po sa details. ||| Noted po. ||| Ano po budget range ninyo?"
- NEVER include raw URLs or links in your messages. The system sends buttons automatically.
- When booking confirmed, add at END: BOOKING_CONFIRMED: YYYY-MM-DD HH:MM | Name | Phone
- Use 24h format (18:00 not 6pm), PIPE | separator
- Avoid repetitive greetings like "Kumusta" or "Hello"
${disallowGreetings ? '- Do NOT greet or introduce yourself unless asked by the customer.' : '- Do NOT greet or reintroduce yourself if this is not the first AI reply in this conversation.'}
${isFirstAIReply ? (disallowGreetings ? '- This is your first reply; start directly with the next question or answer.' : '- This is your first reply; a brief greeting is ok.') : '- This is not your first reply; start directly with the next question or answer.'}
${isFirstAIReply ? '- THIS IS YOUR FIRST MESSAGE to this customer. Make a great first impression!' : ''}
`;

    // Build messages array, handling images for vision models
    const aiMessages = [{ role: "system", content: aiPrompt }];
    let hasImages = false;

    for (const msg of recentMessages) {
      // Check if message has image attachments
      const attachments = msg.attachments;
      let imageUrl = null;

      if (attachments && Array.isArray(attachments)) {
        for (const att of attachments) {
          if (att.type === "image" && att.payload?.url) {
            imageUrl = att.payload.url;
            hasImages = true;
            console.log(
              "[WEBHOOK] Found image in message:",
              imageUrl.substring(0, 50) + "...",
            );
            break;
          }
        }
      }

      if (imageUrl) {
        // For vision models, include image in content
        aiMessages.push({
          role: msg.is_from_page ? "assistant" : "user",
          content: [
            {
              type: "text",
              text: msg.message_text || "The customer sent an image:",
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        });
      } else {
        aiMessages.push({
          role: msg.is_from_page ? "assistant" : "user",
          content: msg.message_text || "[Attachment]",
        });
      }
    }

    console.log("[WEBHOOK] Has images:", hasImages);

    // Call NVIDIA AI — reduced model list for speed
    const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
    if (!NVIDIA_API_KEY) {
      console.error("[WEBHOOK] NVIDIA API key not set");
      return;
    }

    let MODELS;
    if (hasImages) {
      // GLM-5 for vision, with Llama vision as fallback
      MODELS = [
        "zhipu/glm-5",
        "meta/llama-3.2-11b-vision-instruct",
      ];
    } else {
      // GLM-5 (744B params) = smartest, with known-working fallbacks
      MODELS = [
        "zhipu/glm-5",
        "meta/llama-3.1-70b-instruct",
        "meta/llama-3.1-8b-instruct",
      ];
    }

    let aiReply = null;
    let lastError = null;

    for (const model of MODELS) {
      try {
        console.log(`[WEBHOOK] Trying model: ${model}, hasImages: ${hasImages}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout per model attempt
        const aiResponse = await fetch(
          "https://integrate.api.nvidia.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${NVIDIA_API_KEY}`,
            },
            body: JSON.stringify({
              model: model,
              messages: aiMessages,
              temperature: 0.7,
              max_tokens: 300,
            }),
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.log(
            `[WEBHOOK] Model ${model} failed: ${errorText.substring(0, 100)}`,
          );

          // Special handling for vision model failures with images
          if (hasImages && (errorText.includes("does not support") || errorText.includes("image input") || errorText.includes("vision"))) {
            console.log("[WEBHOOK] Vision model failed, falling back to text-only without images");
            // Remove images and try text-only models
            hasImages = false;
            break;
          }

          lastError = errorText;
          continue; // Try next model
        }

        const aiData = await aiResponse.json();
        aiReply = aiData.choices?.[0]?.message?.content;

        if (aiReply) {
          console.log(`[WEBHOOK] Success with model: ${model}`);
          break; // Got a response, exit loop
        }
      } catch (err) {
        console.log(`[WEBHOOK] Model ${model} error: ${err.message}`);

        // Special handling for vision model errors with images
        if (hasImages && (err.message.includes("vision") || err.message.includes("image"))) {
          console.log("[WEBHOOK] Vision model error, falling back to text-only without images");
          hasImages = false;
          break;
        }

        lastError = err.message;
        continue;
      }
    }

    // If we fell back from vision to text-only, rebuild aiMessages without images
    if (hasImages === false && (lastError?.includes("vision") || lastError?.includes("image"))) {
      console.log("[WEBHOOK] Rebuilding messages for text-only model (removing images)");
      aiMessages = [{ role: "system", content: aiPrompt }];
      for (const msg of recentMessages) {
        if (msg.message_text && msg.message_text.trim().length > 0) {
          aiMessages.push({
            role: msg.is_from_page ? "assistant" : "user",
            content: msg.message_text,
          });
        } else if (msg.attachments && msg.attachments.length > 0) {
          // Add a note that there was an attachment we can't process
          aiMessages.push({
            role: msg.is_from_page ? "assistant" : "user",
            content: "[Image or attachment - text extracted from image if available]",
          });
        }
      }

      // Retry with text-only models (fast 8b first)
      MODELS = [
        "meta/llama-3.1-8b-instruct",
      ];

      for (const model of MODELS) {
        try {
          console.log(`[WEBHOOK] Retrying (text-only): ${model}`);
          const aiResponse = await fetch(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${NVIDIA_API_KEY}`,
              },
              body: JSON.stringify({
                model: model,
                messages: aiMessages,
                temperature: 0.7,
                max_tokens: 400,
              }),
            },
          );

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.log(`[WEBHOOK] Model ${model} failed: ${errorText.substring(0, 100)}`);
            lastError = errorText;
            continue;
          }

          const aiData = await aiResponse.json();
          aiReply = aiData.choices?.[0]?.message?.content;

          if (aiReply) {
            console.log(`[WEBHOOK] Success with text-only model: ${model}`);
            break;
          }
        } catch (err) {
          console.log(`[WEBHOOK] Model ${model} error: ${err.message}`);
          lastError = err.message;
          continue;
        }
      }
    }

    if (!aiReply) {
      console.error("[WEBHOOK] All models failed. Last error:", lastError);
      return;
    }

    console.log("[WEBHOOK] AI Reply:", aiReply.substring(0, 80) + "...");
    console.log("[WEBHOOK] AI Reply length:", aiReply.length);
    console.log("[WEBHOOK] Contains ||| delimiter:", aiReply.includes("|||"));

    // Flag to track if booking was already handled (prevent duplicates)
    let bookingHandled = false;

    // Detect BOOKING_CONFIRMED and create calendar event
    if (aiReply.includes("BOOKING_CONFIRMED:")) {
      bookingHandled = true; // Mark as handled to prevent FALLBACK from creating duplicate
      try {
        const bookingMatch = aiReply.match(/BOOKING_CONFIRMED:\s*(.+)/i);
        if (bookingMatch) {
          const bookingInfo = bookingMatch[1];
          console.log("[WEBHOOK] Booking detected raw:", bookingInfo);

          // Parse the booking info (format: DATETIME | NAME | PHONE)
          // Split by pipe character (not dash, which is in dates)
          const parts = bookingInfo.split("|").map((p) => p.trim());
          console.log("[WEBHOOK] Booking parts:", JSON.stringify(parts));

          const dateTimeStr = parts[0] || "";
          const customerName = resolveParticipantName({
            currentName: parts[1],
            extractedName: conversation?.participant_name,
            fallback: "Lead",
          });
          const phone = parts[2] || "";

          console.log(
            `[WEBHOOK] Parsed: dateTime = "${dateTimeStr}", name = "${customerName}", phone = "${phone}"`,
          );

          // Try to parse date/time
          const bookingDate = new Date(dateTimeStr);
          if (!isNaN(bookingDate.getTime())) {
            // Create calendar event - skip if fails, don't block message sending
            try {
              const { error: calError } = await db
                .from("calendar_events")
                .insert({
                  title: `📅 Booking: ${customerName}`,
                  description: `Booked via AI chatbot\nPhone: ${phone}\nConversation: ${conversationId}\nCustomer: ${customerName}`,
                  start_time: bookingDate.toISOString(),
                  end_time: new Date(
                    bookingDate.getTime() + 60 * 60 * 1000,
                  ).toISOString(), // 1 hour
                  event_type: "meeting",
                  status: "scheduled",
                  // For automated reminders
                  conversation_id: conversationId,
                  contact_psid: conversation?.participant_id || null,
                });

              if (calError) {
                console.error(
                  "[WEBHOOK] Calendar event creation failed:",
                  calError.message,
                );
              } else {
                console.log(
                  "[WEBHOOK] ✅ Calendar event created for",
                  bookingDate,
                );
              }
            } catch (calErr) {
              console.error("[WEBHOOK] Calendar insert error:", calErr.message);
            }

            // Cancel any pending follow-ups for this conversation (they booked!)
            try {
              const { data: cancelledFollowups, error: cancelError } = await db
                .from("ai_followup_schedule")
                .update({
                  status: "cancelled",
                  error_message: "Contact booked - no follow-up needed",
                })
                .eq("conversation_id", conversationId)
                .eq("status", "pending")
                .select("id");

              if (cancelledFollowups?.length > 0) {
                console.log(
                  `[WEBHOOK] ✅ Cancelled ${cancelledFollowups.length} pending follow-ups - contact booked!`,
                );
              }
            } catch (cancelErr) {
              console.log(
                "[WEBHOOK] Could not cancel follow-ups:",
                cancelErr.message,
              );
            }

            // Move contact to 'booked' pipeline stage with contact details
            try {
              const updateData = {
                pipeline_stage: "booked",
                booking_date: bookingDate.toISOString(),
                booked_at: new Date().toISOString(),
              };

              // Save phone number if provided
              if (phone && phone.length > 5) {
                updateData.phone_number = phone;
              }

              await db
                .from("facebook_conversations")
                .update(updateData)
                .eq("conversation_id", conversationId);

              console.log(
                "[WEBHOOK] ✅ Contact moved to BOOKED pipeline with details:",
                {
                  booking_date: bookingDate.toISOString(),
                  phone: phone || "not provided",
                },
              );
            } catch (pipeErr) {
              console.error(
                "[WEBHOOK] Pipeline update error:",
                pipeErr.message,
              );
            }

            // Also add to clients table (the actual pipeline)
            try {
              // Check if client already exists by name or phone
              let existingClient = null;

              if (phone && phone.length > 5) {
                const { data: byPhone } = await db
                  .from("clients")
                  .select("id")
                  .ilike("contact_details", `%${phone}%`)
                  .limit(1)
                  .maybeSingle();
                existingClient = byPhone;
              }

              if (!existingClient && customerName) {
                const { data: byName } = await db
                  .from("clients")
                  .select("id")
                  .ilike("client_name", customerName)
                  .limit(1)
                  .maybeSingle();
                existingClient = byName;
              }

              if (!existingClient) {
                // Create new client in pipeline
                const clientData = {
                  client_name: customerName,
                  contact_details: phone || null,
                  notes: `Booked via AI on ${bookingDate.toLocaleDateString()}`,
                  phase: "booked",
                  payment_status: "unpaid",
                  source: "ai_chatbot",
                  created_at: new Date().toISOString(),
                };

                const { data: newClient, error: clientError } = await db
                  .from("clients")
                  .insert(clientData)
                  .select()
                  .single();

                if (clientError) {
                  // Try without source column if it doesn't exist
                  if (clientError.message?.includes("source")) {
                    delete clientData.source;
                    await db.from("clients").insert(clientData);
                    console.log(
                      "[WEBHOOK] ✅ Added to clients pipeline (without source)",
                    );
                  } else {
                    console.log(
                      "[WEBHOOK] Could not add to clients:",
                      clientError.message,
                    );
                  }
                } else {
                  console.log(
                    "[WEBHOOK] ✅ Added to clients pipeline:",
                    newClient?.id,
                  );
                }
              } else {
                // Update existing client to booked phase
                await db
                  .from("clients")
                  .update({ phase: "booked" })
                  .eq("id", existingClient.id);
                console.log(
                  "[WEBHOOK] ✅ Updated existing client to booked:",
                  existingClient.id,
                );
              }
            } catch (clientErr) {
              console.log(
                "[WEBHOOK] Clients table sync error (non-critical):",
                clientErr.message,
              );
            }
          }

          // Remove the BOOKING_CONFIRMED line from the reply (it's internal)
          aiReply = aiReply.replace(/BOOKING_CONFIRMED:\s*.+/gi, "").trim();

          // If reply is now empty, add a confirmation message
          if (!aiReply) {
            aiReply = `Noted po! ✅ I've scheduled your consultation for ${dateTimeStr}. Thank you for booking with us! See you there! 🎉`;
            console.log("[WEBHOOK] Added fallback confirmation message");
          }
        }
      } catch (bookingErr) {
        console.log(
          "[WEBHOOK] Booking parsing error (non-fatal):",
          bookingErr.message,
        );
      }
    }

    // FALLBACK: Detect booking confirmations from natural language (if AI forgot the marker)
    // Look for patterns like "scheduled for 2026-01-17 18:00" or "booked for January 17"
    console.log(
      "[WEBHOOK] FALLBACK CHECK: aiReply contains BOOKING_CONFIRMED?",
      aiReply.includes("BOOKING_CONFIRMED:"),
    );
    console.log(
      "[WEBHOOK] FALLBACK CHECK: aiReply preview:",
      aiReply.substring(0, 150),
    );
    console.log("[WEBHOOK] FALLBACK CHECK: bookingHandled=", bookingHandled);
    if (!bookingHandled && !aiReply.includes("BOOKING_CONFIRMED:")) {
      console.log("[WEBHOOK] FALLBACK: Entering fallback detection...");
      try {
        // Pattern 1: Look for ISO date format (2026-01-17 18:00)
        const isoDateMatch = aiReply.match(
          /(?:scheduled|booked|confirmed).*?for\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/i,
        );

        // Pattern 2: Look for natural date (January 19, 2026 at 2:00 PM) - flexible pattern
        const naturalDateMatch = aiReply.match(
          /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})?\s*(?:at\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)?/i,
        );

        // Pattern 3: Look for RELATIVE dates like "tomorrow at 9am", "tomorrow at 9:00 AM"
        const relativeMatch = aiReply.match(
          /(?:scheduled|booked|confirmed|meeting).*?(tomorrow|today|day after tomorrow)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
        );

        let detectedDate = null;
        let detectedTime = null;

        if (isoDateMatch) {
          detectedDate = isoDateMatch[1]; // 2026-01-17
          detectedTime = isoDateMatch[2]; // 18:00
          console.log(
            `[WEBHOOK] FALLBACK: Detected ISO date booking: ${detectedDate} ${detectedTime}`,
          );
        } else if (naturalDateMatch) {
          console.log(
            "[WEBHOOK] FALLBACK: Match found:",
            JSON.stringify(naturalDateMatch.slice(0, 7)),
          );
          const monthNames = {
            january: "01",
            february: "02",
            march: "03",
            april: "04",
            may: "05",
            june: "06",
            july: "07",
            august: "08",
            september: "09",
            october: "10",
            november: "11",
            december: "12",
          };
          const month = monthNames[naturalDateMatch[1].toLowerCase()];
          const day = naturalDateMatch[2].padStart(2, "0");
          const year = naturalDateMatch[3] || new Date().getFullYear();
          let hour = parseInt(naturalDateMatch[4]);
          const minute = naturalDateMatch[5];
          const ampm = naturalDateMatch[6];

          // Convert to 24-hour format
          if (ampm && ampm.toLowerCase() === "pm" && hour < 12) {
            hour += 12;
          } else if (ampm && ampm.toLowerCase() === "am" && hour === 12) {
            hour = 0;
          }

          detectedDate = `${year}-${month}-${day}`;
          detectedTime = `${String(hour).padStart(2, "0")}:${minute}`;
          console.log(
            `[WEBHOOK] FALLBACK: Detected natural date booking: ${detectedDate} ${detectedTime}`,
          );
        } else if (relativeMatch) {
          // Handle relative dates: tomorrow, today, day after tomorrow
          console.log(
            "[WEBHOOK] FALLBACK: Relative date match found:",
            JSON.stringify(relativeMatch.slice(0, 5)),
          );
          const relativeDay = relativeMatch[1].toLowerCase();
          let hour = parseInt(relativeMatch[2]);
          const minute = relativeMatch[3] || "00";
          const ampm = relativeMatch[4]?.toLowerCase();

          // Convert to 24-hour format
          if (ampm === "pm" && hour < 12) {
            hour += 12;
          } else if (ampm === "am" && hour === 12) {
            hour = 0;
          } else if (!ampm && hour <= 6) {
            // If no AM/PM specified and hour is 1-6, assume PM (business hours)
            hour += 12;
          }

          // Calculate the date
          const now = new Date();
          let targetDate = new Date(now);

          if (relativeDay === "tomorrow") {
            targetDate.setDate(now.getDate() + 1);
          } else if (relativeDay === "day after tomorrow") {
            targetDate.setDate(now.getDate() + 2);
          }
          // 'today' stays as current date

          const year = targetDate.getFullYear();
          const month = String(targetDate.getMonth() + 1).padStart(2, "0");
          const day = String(targetDate.getDate()).padStart(2, "0");

          detectedDate = `${year}-${month}-${day}`;
          detectedTime = `${String(hour).padStart(2, "0")}:${minute}`;
          console.log(
            `[WEBHOOK] FALLBACK: Detected RELATIVE date booking: "${relativeDay}" -> ${detectedDate} ${detectedTime}`,
          );
        }

        if (detectedDate && detectedTime) {
          const bookingDate = new Date(`${detectedDate}T${detectedTime}`);

          if (!isNaN(bookingDate.getTime())) {
            console.log(
              "[WEBHOOK] FALLBACK: Creating calendar event from natural language",
            );

            // Get customer name from conversation
            const customerName = resolveParticipantName({
              currentName: conversation?.participant_name,
              fallback: "Lead",
            });

            // Try to extract phone from recent messages
            let phone = "";
            if (recentMessages && recentMessages.length > 0) {
              for (const msg of recentMessages) {
                const msgText = msg.message_text || "";
                const phoneMatch = extractPhoneFromText(msgText);
                if (phoneMatch) {
                  phone = phoneMatch;
                  console.log(
                    "[WEBHOOK] FALLBACK: Found phone in messages:",
                    phone,
                  );
                  break;
                }
              }
            }

            // Create calendar event
            try {
              const calendarData = {
                title: `📅 Booking: ${customerName}`,
                description: `Booked via AI chatbot (auto-detected)\nPhone: ${phone || "Not provided"}\nConversation: ${conversationId}`,
                start_time: bookingDate.toISOString(),
                end_time: new Date(
                  bookingDate.getTime() + 60 * 60 * 1000,
                ).toISOString(),
                event_type: "meeting",
                status: "scheduled",
                // For automated reminders
                conversation_id: conversationId,
                contact_psid: conversation?.participant_id || null,
              };
              console.log(
                "[WEBHOOK] FALLBACK: Inserting calendar event:",
                JSON.stringify(calendarData),
              );

              const { data: calData, error: calError } = await db
                .from("calendar_events")
                .insert(calendarData)
                .select();

              if (calError) {
                console.error(
                  "[WEBHOOK] FALLBACK: Calendar error code:",
                  calError.code,
                );
                console.error(
                  "[WEBHOOK] FALLBACK: Calendar error msg:",
                  calError.message,
                );
                console.error(
                  "[WEBHOOK] FALLBACK: Calendar error details:",
                  calError.details,
                );
                console.error(
                  "[WEBHOOK] FALLBACK: Calendar error hint:",
                  calError.hint,
                );
              } else {
                console.log(
                  "[WEBHOOK] FALLBACK: ✅ Calendar event created!",
                  calData?.[0]?.id,
                );
              }
            } catch (e) {
              console.error(
                "[WEBHOOK] FALLBACK: Calendar insert exception:",
                e.message,
                e.stack,
              );
            }

            // Cancel pending follow-ups
            try {
              await db
                .from("ai_followup_schedule")
                .update({
                  status: "cancelled",
                  error_message: "Contact booked (auto-detected)",
                })
                .eq("conversation_id", conversationId)
                .eq("status", "pending");
              console.log("[WEBHOOK] FALLBACK: Cancelled pending follow-ups");
            } catch (e) { }

            // Update conversation
            try {
              await db
                .from("facebook_conversations")
                .update({
                  pipeline_stage: "booked",
                  booking_date: bookingDate.toISOString(),
                  phone_number: phone || null,
                })
                .eq("conversation_id", conversationId);
              console.log(
                "[WEBHOOK] FALLBACK: ✅ Updated conversation to booked",
              );
            } catch (e) { }

            // ADD TO CLIENTS TABLE (pipeline)
            try {
              let existingClient = null;
              if (phone) {
                const { data: byPhone } = await db
                  .from("clients")
                  .select("id")
                  .ilike("contact_details", `%${phone}%`)
                  .limit(1)
                  .maybeSingle();
                existingClient = byPhone;
              }
              if (
                !existingClient &&
                customerName &&
                !needsParticipantNameLookup(customerName)
              ) {
                const { data: byName } = await db
                  .from("clients")
                  .select("id")
                  .ilike("client_name", customerName)
                  .limit(1)
                  .maybeSingle();
                existingClient = byName;
              }

              if (!existingClient) {
                const clientData = {
                  client_name: customerName,
                  contact_details: phone || null,
                  notes: `Booked via AI on ${bookingDate.toLocaleDateString()}`,
                  phase: "booked",
                  payment_status: "unpaid",
                  created_at: new Date().toISOString(),
                };
                await db.from("clients").insert(clientData);
                console.log("[WEBHOOK] FALLBACK: ✅ Added to clients pipeline");
              } else {
                await db
                  .from("clients")
                  .update({ phase: "booked" })
                  .eq("id", existingClient.id);
                console.log(
                  "[WEBHOOK] FALLBACK: ✅ Updated existing client to booked",
                );
              }
            } catch (clientErr) {
              console.log(
                "[WEBHOOK] FALLBACK: Clients error (non-fatal):",
                clientErr.message,
              );
            }
          }
        }
      } catch (fallbackErr) {
        console.log(
          "[WEBHOOK] FALLBACK: Detection error (non-fatal):",
          fallbackErr.message,
        );
      }
    }

    // Split messages - AI uses |||, but if not, force split by sentences
    let messageParts = [];

    if (aiReply.includes("|||")) {
      // AI decided to split the message
      messageParts = aiReply
        .split("|||")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      console.log(
        `[WEBHOOK] AI split into ${messageParts.length} parts using |||`,
      );
    } else {
      // FALLBACK: Force split by sentences if response is long
      // Split on sentence endings (. ! ?) followed by space
      const sentences = aiReply
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.trim().length > 0);

      if (sentences.length <= 2) {
        // Short enough, send as one
        messageParts.push(aiReply);
      } else {
        // Group sentences into parts (2-3 sentences each)
        let currentPart = "";
        let sentenceCount = 0;

        for (const sentence of sentences) {
          currentPart += (currentPart ? " " : "") + sentence;
          sentenceCount++;

          if (sentenceCount >= 2) {
            messageParts.push(currentPart.trim());
            currentPart = "";
            sentenceCount = 0;
          }
        }

        // Add remaining sentences
        if (currentPart.trim()) {
          messageParts.push(currentPart.trim());
        }

        console.log(
          `[WEBHOOK] Force split into ${messageParts.length} parts by sentences`,
        );
      }
    }

    console.log(`[WEBHOOK] Sending ${messageParts.length} message part(s)`);

    // Process SEND_PROPERTY_CARD markers - convert to property card attachments
    const processedMessages = [];
    for (const part of messageParts) {
      // Check for OPTIN_HOOK marker (AI generated opt-in button)
      const optinMatch = part.match(/^OPTIN_HOOK:\s*(.+)/i);

      if (optinMatch) {
        const hookText = optinMatch[1].trim();
        console.log(`[WEBHOOK] 🔔 AI generated opt-in hook: "${hookText}"`);

        // Create the opt-in button message
        const optinUrl = config.booking_url || `${process.env.APP_URL || 'https://gaia-tech.vercel.app'}/book/${pageId}`;

        // Add as a special message type
        processedMessages.push({
          type: "optin_button",
          content: hookText,
          url: optinUrl
        });
        continue; // Done with this part
      }

      // Check for SHOW_PROFILE_CARD marker (MANUAL trigger only — AI does NOT generate this)
      const profileCardMatch = part.match(/^SHOW_PROFILE_CARD$/i);
      if (profileCardMatch) {
        const details = conversation?.extracted_details || {};
        const analysis = conversation?.ai_analysis || {};
        const name = resolveParticipantName({
          currentName: conversation?.participant_name,
          fallback: "Lead",
        });

        // Build profile summary lines
        const profileLines = [];
        if (details.budget || analysis.budget) profileLines.push(`💰 Budget: ${details.budget || analysis.budget}`);
        if (details.location || analysis.preferred_location) profileLines.push(`📍 Location: ${details.location || analysis.preferred_location}`);
        if (details.property_type || analysis.property_type) profileLines.push(`🏠 Type: ${details.property_type || analysis.property_type}`);
        if (details.bedrooms || analysis.bedrooms) profileLines.push(`🛏️ Bedrooms: ${details.bedrooms || analysis.bedrooms}`);
        if (details.bathrooms || analysis.bathrooms) profileLines.push(`🚿 Bathrooms: ${details.bathrooms || analysis.bathrooms}`);
        if (details.floor_area || analysis.floor_area) profileLines.push(`📐 Floor Area: ${details.floor_area || analysis.floor_area} sqm`);

        if (profileLines.length === 0) {
          profileLines.push("No preferences gathered yet.");
        }

        const subtitle = profileLines.join('\n');

        processedMessages.push({
          type: "profile_card",
          name: name,
          subtitle: subtitle,
          score: evaluationScore
        });
        console.log(`[WEBHOOK] 📋 Profile card added for: ${name} (score: ${evaluationScore}%)`);
        continue;
      }

      // Check for SEND_PROPERTY_CARD marker
      const propertyCardMatch = part.match(/^SEND_PROPERTY_CARD:\s*([a-zA-Z0-9\-]+)/i);

      if (propertyCardMatch) {
        const propertyId = propertyCardMatch[1];
        console.log("[WEBHOOK] Property card requested:", propertyId);

        // Find the property in our loaded data
        const property = properties?.find(p => p.id === propertyId);

        if (property) {
          // Add property as attachment
          processedMessages.push({
            type: "property_card",
            property: property
          });
          console.log("[WEBHOOK] ✓ Added property card:", property.title);
        } else {
          console.log("[WEBHOOK] ✗ Property not found:", propertyId);
          // Skip or could send error message
        }
      } else {
        // Regular text message, remove the markers if AI included them inline
        let cleanedText = part
          .replace(/^SEND_PROPERTY_CARD:\s*[a-zA-Z0-9\-]+\s*/i, "")
          .replace(/^OPTIN_HOOK:\s*.+/i, "") // Should have been caught above, but just in case
          .trim();

        if (cleanedText.length > 0) {
          processedMessages.push({
            type: "text",
            content: cleanedText
          });
        }
      }
    }

    console.log(`[WEBHOOK] After property card processing: ${processedMessages.length} total messages`);

    // Send each part via Facebook
    const participantId =
      conversation?.participant_id || conversationId.replace("t_", "");
    const pageReplies = recentMessages?.filter(m => m.is_from_page) || [];

    // 🔔 OPT-IN BUTTON (Removed pre-send, now handled via OPTIN_HOOK in loop below)

    for (let i = 0; i < processedMessages.length; i++) {
      const part = processedMessages[i];

      // Add delay between messages for natural chat feel
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      console.log(
        `[WEBHOOK] Sending part ${i + 1}/${processedMessages.length}: ${part.type === "property_card" ? "Property Card" : part.content.substring(0, 50)}`,
      );

      // Prepare message body based on type
      let messageBody;
      if (part.type === "property_card") {
        // Send property card as generic template
        const prop = part.property;
        const propertyUrl = buildScopedPropertyUrl({
          baseUrl: process.env.APP_URL || process.env.VITE_APP_URL || "",
          propertyId: prop.id,
          participantId,
          teamId: prop.team_id || page?.team_id,
          organizationId: prop.organization_id || page?.organization_id,
        });

        messageBody = {
          recipient: { id: participantId },
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "generic",
                elements: [
                  {
                    title: prop.title,
                    image_url: prop.images && prop.images.length > 0 ? prop.images[0] : null,
                    subtitle: `₱${parseInt(prop.price || 0).toLocaleString()} • ${prop.bedrooms || 'N/A'} bed • ${prop.bathrooms || 'N/A'} bath`,
                    default_action: {
                      type: "web_url",
                      url: propertyUrl,
                      webview_height_ratio: "tall"
                    },
                    buttons: [
                      {
                        type: "web_url",
                        url: propertyUrl,
                        title: "View Details"
                      },
                      {
                        type: "postback",
                        title: "I'm Interested",
                        payload: `INQUIRY_PROPERTY_${prop.id}`
                      }
                    ]
                  }
                ]
              }
            }
          },
          messaging_type: "RESPONSE"
        };
      } else if (part.type === "optin_button") {
        // Send notification_messages opt-in template using minimal schema
        messageBody = buildNotificationOptinMessage({
          participantId,
          title: part.content || "Get property updates?",
        });

      } else if (part.type === "profile_card") {
        // Instagram-style profile summary card (MANUAL trigger only)
        const scoreEmoji = part.score >= 70 ? "✅" : part.score >= 40 ? "🟡" : "🔴";
        messageBody = {
          recipient: { id: participantId },
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "button",
                text: `📋 ${part.name}'s Profile ${scoreEmoji}\n━━━━━━━━━━━━━━━━━\n${part.subtitle}\n━━━━━━━━━━━━━━━━━\n📊 Evaluation: ${part.score}%`,
                buttons: [
                  {
                    type: "postback",
                    title: "🏠 Show Best Match",
                    payload: "REQUEST_BEST_PROPERTY"
                  }
                ]
              }
            }
          },
          messaging_type: "RESPONSE"
        };
      } else {
        // Regular text message
        messageBody = {
          recipient: { id: participantId },
          message: { text: part.content },
          messaging_type: "RESPONSE"
        };
      }

      const sendResponse = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${page.page_access_token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messageBody),
        },
      );

      if (!sendResponse.ok) {
        const err = await sendResponse.text();
        console.error(`[WEBHOOK] Send part ${i + 1} failed:`, err);

        if (
          part.type === "optin_button" &&
          isUnsupportedNotificationOptinError(err)
        ) {
          console.warn(
            "[WEBHOOK] Opt-in template schema unsupported by page/app; falling back to text hook",
          );

          const fallbackTextBody = {
            recipient: { id: participantId },
            message: {
              text: buildOptinFallbackText(part.content),
            },
            messaging_type: "RESPONSE",
          };

          const fallbackResponse = await fetch(
            `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${page.page_access_token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(fallbackTextBody),
            },
          );

          if (!fallbackResponse.ok) {
            const fallbackErr = await fallbackResponse.text();
            console.error(
              "[WEBHOOK] Opt-in fallback text send failed:",
              fallbackErr,
            );
          }

          continue;
        }

        // Try with HUMAN_AGENT tag if 24h window issue (allows 7-day window)
        if (err.includes("allowed window") || err.includes("outside")) {
          console.log("[WEBHOOK] Retrying with HUMAN_AGENT tag...");
          const retryResponse = await fetch(
            `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${page.page_access_token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipient: { id: participantId },
                message: { text: part.content || part },
                messaging_type: "MESSAGE_TAG",
                tag: "HUMAN_AGENT",
              }),
            },
          );
          if (!retryResponse.ok) {
            console.error("[WEBHOOK] Retry also failed");
            return;
          }
        } else {
          return;
        }
      }

      if (part.type === "optin_button") {
        try {
          await db
            .from("facebook_conversations")
            .update({
              recurring_optin_status: "sent",
              updated_at: new Date().toISOString(),
            })
            .eq("conversation_id", conversationId);
        } catch (optinStatusErr) {
          console.log(
            "[WEBHOOK] Opt-in sent-status update failed (non-fatal):",
            optinStatusErr.message,
          );
        }
      }

      // Small delay between messages to maintain order
      if (i < messageParts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log("[WEBHOOK] AI reply sent successfully!");

    console.log(`[WEBHOOK] AI reply sent! Total time: ${Date.now() - startTime}ms`);

    // 📅 BOOKING BUTTON — only show at specific milestones:
    //   1. First AI reply (introduction)
    //   2. When evaluation reaches 50% of threshold (halfway point)
    //   3. When evaluation reaches the threshold (qualified)
    try {
      const bookingUrl = config.booking_url;
      if (bookingUrl) {
        // Get the evaluation threshold (default 70%) and check milestones
        const evalThreshold = evaluationThreshold;
        const halfThreshold = evaluationHalfThreshold;

        // Check what booking milestone flags have been sent for this conversation
        const bookingSent = bookingMilestones;
        const isFirst = pageReplies.length === 0 && !bookingSent.first;
        const atHalf = evaluationScore >= halfThreshold && !bookingSent.half;
        const atFull = evaluationScore >= evalThreshold && !bookingSent.full;

        const shouldSendBooking = isFirst || atHalf || atFull;

        if (shouldSendBooking) {
          const reason = isFirst ? 'first_reply' : atFull ? 'eval_complete' : 'eval_half';
          console.log(`[WEBHOOK] 📅 Sending booking button (reason: ${reason}, score: ${evaluationScore}%, threshold: ${evalThreshold}%)`);

          await new Promise(resolve => setTimeout(resolve, 1000));

          const bookingBtnBody = {
            recipient: { id: participantId },
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "button",
                  text: isFirst
                    ? "📅 Ready to book? Click below to schedule your consultation!"
                    : atFull
                      ? "📅 Great news! Based on our chat, I think we have the perfect property for you. Book a viewing!"
                      : "📅 Interested po? Click below to book a quick consultation!",
                  buttons: [
                    {
                      type: "web_url",
                      url: bookingUrl,
                      title: "📅 Book Now",
                      webview_height_ratio: "full"
                    }
                  ]
                }
              }
            },
            messaging_type: "RESPONSE"
          };

          const btnResponse = await fetch(
            `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${page.page_access_token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(bookingBtnBody),
            }
          );

          if (btnResponse.ok) {
            console.log("[WEBHOOK] ✅ Booking button sent automatically!");
            // Record which milestones have been reached to avoid resending
            try {
              const newMilestones = { ...bookingSent };
              if (isFirst) newMilestones.first = true;
              if (atHalf) newMilestones.half = true;
              if (atFull) newMilestones.full = true;
              await db.from('facebook_conversations').update({
                booking_btn_milestones: newMilestones,
                updated_at: new Date().toISOString(),
              }).eq('conversation_id', conversationId);
            } catch (milestoneErr) {
              console.log('[WEBHOOK] Milestone update failed (column may not exist yet):', milestoneErr.message);
            }
          } else {
            const btnErr = await btnResponse.text();
            console.log("[WEBHOOK] Booking button send failed (non-fatal):", btnErr.substring(0, 100));
          }
        } else {
          console.log(`[WEBHOOK] 📅 Booking button skipped (score: ${evaluationScore}%, half: ${halfThreshold}%, full: ${evalThreshold}%, milestones: ${JSON.stringify(bookingSent)})`);
        }
      }
    } catch (bookingBtnErr) {
      console.log("[WEBHOOK] Booking button error (non-fatal):", bookingBtnErr.message);
    }

    // FIRE-AND-FORGET: Schedule follow-up in background (don't await)
    analyzeAndScheduleFollowUp(db, conversationId, pageId, conversation, recentMessages)
      .catch(err => console.log("[WEBHOOK] Follow-up error (non-fatal):", err.message));
  } catch (error) {
    console.error("[WEBHOOK] AI Error:", error);
  }
}

/**
 * Intelligent Follow-up Analysis
 * AI analyzes the conversation to decide how long to wait before following up
 */
async function analyzeAndScheduleFollowUp(
  db,
  conversationId,
  pageId,
  conversation,
  recentMessages,
) {
  console.log("[WEBHOOK] === INTELLIGENT FOLLOW-UP ANALYSIS ===");

  // Build conversation summary for AI
  const messagesSummary = recentMessages
    .slice(-5)
    .map(
      (m) =>
        `${m.is_from_page ? "AI" : "Customer"}: ${m.message_text || "[attachment]"}`,
    )
    .join("\n");

  const analysisPrompt = `Analyze this conversation and determine the optimal follow-up timing.

CONVERSATION:
${messagesSummary}

You must respond with ONLY valid JSON (no markdown, no explanation):
{
  "wait_minutes": <number between 15-240>,
  "reason": "<brief explanation why this wait time is appropriate>",
  "follow_up_type": "<one of: best_time|intuition|reminder|flow|manual>",
  "urgency": "<one of: low|medium|high>"
}

AGGRESSIVE FOLLOW-UP GUIDELINES (use minutes, not hours):
- Hot lead showing interest: 15-30 minutes
- Customer asked a question: 30-60 minutes
- Customer is comparing options: 60-120 minutes (1-2 hours)
- Conversation ended mid-discussion: 30-60 minutes
- Customer showed buying intent: 15-30 minutes
- Customer just received info: 60-120 minutes
- Customer went silent after question: 30-60 minutes
- Customer said they're busy: 120-180 minutes (2-3 hours)
- Customer asked for time to think: 120-240 minutes (2-4 hours MAX)`;

  try {
    // Get page access token for AI call
    const { data: page } = await db
      .from("facebook_pages")
      .select("page_access_token")
      .eq("page_id", pageId)
      .single();

    const nvidiaKey = process.env.NVIDIA_API_KEY;
    if (!nvidiaKey) {
      console.log("[WEBHOOK] No NVIDIA API key for follow-up analysis");
      return;
    }

    const response = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nvidiaKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta/llama-3.1-8b-instruct",
          messages: [{ role: "user", content: analysisPrompt }],
          max_tokens: 200,
          temperature: 0.3,
        }),
      },
    );

    if (!response.ok) {
      console.error("[WEBHOOK] Follow-up AI call failed");
      return;
    }

    const aiResult = await response.json();
    const analysisText = aiResult.choices?.[0]?.message?.content?.trim();

    console.log("[WEBHOOK] Follow-up analysis raw:", analysisText);

    // Parse JSON response
    let analysis;
    try {
      // Clean up the response (remove markdown if present)
      const cleanJson = analysisText.replace(/```json\n?|\n?```/g, "").trim();
      analysis = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.log(
        "[WEBHOOK] Could not parse follow-up analysis, using defaults",
      );
      analysis = {
        wait_minutes: 30,
        reason: "Quick follow-up",
        follow_up_type: "intuition",
        urgency: "medium",
      };
    }

    // Calculate scheduled time - use minutes, cap at 4 hours max
    const waitMinutes = Math.min(
      Math.max(analysis.wait_minutes || 30, 15),
      240,
    ); // 15 mins to 4 hours max
    const scheduledAt = new Date(Date.now() + waitMinutes * 60 * 1000);

    console.log("[WEBHOOK] Follow-up decision:", {
      wait_minutes: waitMinutes,
      reason: analysis.reason,
      type: analysis.follow_up_type,
      scheduled_at: scheduledAt.toISOString(),
    });

    // Cancel any existing pending follow-ups for this conversation
    await db
      .from("ai_followup_schedule")
      .update({ status: "cancelled" })
      .eq("conversation_id", conversationId)
      .eq("status", "pending");

    // SANITIZE follow_up_type to ensure it's a valid DB value
    const validTypes = ["best_time", "intuition", "manual", "flow", "reminder"];
    let sanitizedType = analysis.follow_up_type || "reminder";
    if (!validTypes.includes(sanitizedType)) {
      // Map common AI responses to valid values
      const typeMapping = {
        gentle_reminder: "reminder",
        check_in: "reminder",
        immediate: "intuition",
        urgent: "intuition",
        re_engagement: "reminder",
        follow_up: "reminder",
      };
      sanitizedType = typeMapping[sanitizedType] || "reminder";
      console.log(
        `[WEBHOOK] Sanitized follow_up_type from "${analysis.follow_up_type}" to "${sanitizedType}"`,
      );
    }

    // Schedule the new intelligent follow-up
    const schedulePayload = buildAiFollowupSchedulePayload({
      conversationId,
      pageId,
      scheduledAt,
      followUpType: sanitizedType,
      reason: analysis.reason || "AI scheduled follow-up",
      status: "pending",
    });

    const { error: scheduleError } = await db
      .from("ai_followup_schedule")
      .insert(schedulePayload);

    if (scheduleError) {
      console.error(
        "[WEBHOOK] Failed to schedule follow-up:",
        scheduleError.message,
      );
    } else {
      console.log(
        `[WEBHOOK] ✅ Intelligent follow-up scheduled for ${scheduledAt.toLocaleString()} (${waitMinutes} mins)`,
      );
    }
  } catch (err) {
    console.error("[WEBHOOK] Follow-up analysis exception:", err.message);
  }
}

function getInternalAppBaseUrl() {
  const rawBaseUrl =
    process.env.APP_URL ||
    process.env.VITE_APP_URL ||
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "";

  if (!rawBaseUrl) return null;

  const trimmed = rawBaseUrl.trim().replace(/\/$/, "");
  if (!trimmed) return null;

  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

async function triggerImmediateScheduledProcessing() {
  const baseUrl = getInternalAppBaseUrl();
  if (!baseUrl) {
    console.log("[WEBHOOK] Read receipt: No APP_URL/VITE_APP_URL/VERCEL_URL configured — follow-up will wait for next cron cycle");
    return false;
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 4000);

  try {
    const response = await fetch(`${baseUrl}/api/scheduled/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "read_receipt_auto" }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log("[WEBHOOK] Read receipt immediate process failed:", errText.slice(0, 160));
      return false;
    }

    return true;
  } catch (err) {
    console.log("[WEBHOOK] Read receipt immediate process error:", err.message);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handle Facebook Read Receipt
 * When a contact reads/sees our message, schedule a quick follow-up
 * that acknowledges they've seen the message and nudges them to respond.
 */
async function handleReadReceipt(pageId, event) {
  const senderId = event.sender?.id;
  const readTimestamp = event.read?.watermark; // Messages up to this timestamp were read

  if (!senderId || !readTimestamp) return;

  const db = getSupabase();
  if (!db) return;

  console.log(`[WEBHOOK] 👁️ Read receipt from ${senderId} at ${new Date(readTimestamp).toISOString()}`);

  try {
    // 1. Find the conversation for this participant
    const { data: conv } = await db
      .from('facebook_conversations')
      .select('conversation_id, participant_name')
      .eq('participant_id', senderId)
      .eq('page_id', pageId)
      .single();

    if (!conv) {
      console.log('[WEBHOOK] 👁️ Read receipt: no conversation found, skipping');
      return;
    }

    // 2. Check if there's already a pending read-triggered follow-up (prevent spam)
    const { data: existingFollow } = await db
      .from('ai_followup_schedule')
      .select('id')
      .eq('conversation_id', conv.conversation_id)
      .eq('status', 'pending')
      .eq('follow_up_type', 'read_receipt')
      .limit(1);

    if (existingFollow?.length > 0) {
      console.log('[WEBHOOK] 👁️ Read-triggered follow-up already pending, skipping');
      return;
    }

    // 2b. Removed prior-reply gate — read receipts should work for all contacts

    // 3. Check the last message in this conversation — was it from the page (AI)?
    const { data: lastMsg } = await db
      .from('facebook_messages')
      .select('is_from_page, timestamp, message_text')
      .eq('conversation_id', conv.conversation_id)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (!lastMsg || !lastMsg.is_from_page) {
      // Last message was from the customer, no need to follow up on a read
      console.log('[WEBHOOK] 👁️ Last message was from customer, no read follow-up needed');
      return;
    }

    // 4. Check that the message was sent reasonably recently (within 7 days)
    const msgAge = Date.now() - new Date(lastMsg.timestamp).getTime();
    if (msgAge > 7 * 24 * 60 * 60 * 1000) {
      console.log('[WEBHOOK] 👁️ Last AI message is older than 7 days, skipping read follow-up');
      return;
    }

    const sourceAiTimestamp = new Date(lastMsg.timestamp).toISOString();
    const sourceMessageTag = `source_ai_ts=${sourceAiTimestamp}`;

    // 4b. Avoid duplicate auto-replies for repeated read events of the same outbound message
    const { data: existingForSource } = await db
      .from('ai_followup_schedule')
      .select('id, status')
      .eq('conversation_id', conv.conversation_id)
      .eq('follow_up_type', 'read_receipt')
      .in('status', ['pending', 'sent'])
      .ilike('reason', `%${sourceMessageTag}%`)
      .limit(1);

    if (existingForSource?.length > 0) {
      console.log('[WEBHOOK] 👁️ Read-triggered follow-up already handled for this message, skipping');
      return;
    }

    // 5. Check that the customer hasn't already replied to this message
    const { data: replyAfter } = await db
      .from('facebook_messages')
      .select('id')
      .eq('conversation_id', conv.conversation_id)
      .eq('is_from_page', false)
      .gt('timestamp', lastMsg.timestamp)
      .limit(1)
      .single();

    if (replyAfter) {
      console.log('[WEBHOOK] 👁️ Customer already replied after last AI message, skipping');
      return;
    }

    // 6. Schedule read-aware follow-up immediately so triggerImmediateScheduledProcessing picks it up
    // The natural-feeling delay comes from the AI message generation, not the scheduling
    const delayMinutes = 0;
    const scheduledAt = new Date();

    const reason = `read_receipt:${new Date(readTimestamp).toISOString()}|${sourceMessageTag}|delay=${delayMinutes}m`;
    const { error: insertError } = await db.from('ai_followup_schedule').insert(
      buildAiFollowupSchedulePayload({
        conversationId: conv.conversation_id,
        pageId,
        scheduledAt,
        status: 'pending',
        followUpType: 'read_receipt',
        reason,
      }),
    );

    if (insertError) {
      console.log('[WEBHOOK] Read receipt schedule failed, retrying as reminder:', insertError.message);
      const { error: fallbackError } = await db.from('ai_followup_schedule').insert(
        buildAiFollowupSchedulePayload({
          conversationId: conv.conversation_id,
          pageId,
          scheduledAt,
          status: 'pending',
          followUpType: 'reminder',
          reason,
        }),
      );
      if (fallbackError) {
        console.log('[WEBHOOK] Read receipt fallback failed:', fallbackError.message);
        return;
      }
    }

    console.log(`[WEBHOOK] 👁️ Read-triggered follow-up scheduled for ${conv.participant_name || senderId} in ${delayMinutes} min`);

    const immediateProcessed = await triggerImmediateScheduledProcessing();
    if (immediateProcessed) {
      console.log('[WEBHOOK] 👁️ Immediate follow-up processor triggered after read event');
    }
  } catch (err) {
    // Non-fatal — follow_up_type column might not exist yet, or table missing
    console.log('[WEBHOOK] Read receipt handling (non-fatal):', err.message);
  }
}

/**
 * Handle booking quick reply from AI messages
 */
async function handleBookingQuickReply(pageId, senderId, timestamp) {
  const db = getSupabase();
  if (!db) return;

  try {
    console.log(`[WEBHOOK] 📅 Booking button clicked by ${senderId}`);

    // Get booking URL from config
    const { data: settings } = await db
      .from("settings")
      .select("value")
      .eq("key", "ai_chatbot_config")
      .single();

    const bookingUrl = settings?.value?.booking_url;
    if (!bookingUrl) {
      console.log("[WEBHOOK] No booking URL configured");
      return;
    }

    // Get page access token
    const { data: page } = await db
      .from("facebook_pages")
      .select("page_access_token, page_name")
      .eq("page_id", pageId)
      .single();

    if (!page?.page_access_token) {
      console.log("[WEBHOOK] No page access token found");
      return;
    }

    // Get or create conversation
    const { data: existingConv } = await db
      .from("facebook_conversations")
      .select("conversation_id, participant_name")
      .eq("participant_id", senderId)
      .eq("page_id", pageId)
      .single();

    const conversationId = existingConv?.conversation_id || `t_${senderId}`;

    // Send booking link message
    const message = `📅 Great! Here's your booking link:\n\n${bookingUrl}\n\nClick to schedule your consultation.`;

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${page.page_access_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: message },
          messaging_type: "RESPONSE"
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("[WEBHOOK] Failed to send booking link:", error);
      throw new Error(error.error?.message || "Failed to send booking link");
    }

    const result = await response.json();
    console.log(`[WEBHOOK] ✅ Booking link sent: ${result.message_id}`);

    // Save the booking link message
    await db.from("facebook_messages").upsert(
      {
        message_id: result.message_id,
        conversation_id: conversationId,
        sender_id: pageId,
        message_text: message,
        timestamp: new Date(timestamp).toISOString(),
        is_from_page: true,
        is_read: true,
        sent_source: "app"
      },
      { onConflict: "message_id" }
    );

    // Update pipeline stage to indicate booking interest
    await db
      .from("facebook_conversations")
      .update({
        pipeline_stage: "booked",
        lead_status: "appointment_booked",
        last_message_text: message,
        last_message_time: new Date(timestamp).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("conversation_id", conversationId);

    console.log(`[WEBHOOK] ✅ Updated conversation ${conversationId} to 'booked' stage`);
  } catch (error) {
    console.error("[WEBHOOK] handleBookingQuickReply error:", error.message);
  }
}

/**
 * Handle Facebook Optin events (Recurring Notification opt-ins)
 * Triggered when a user clicks "Get Updates" on a recurring notification template
 */
async function handleOptinEvent(pageId, event) {
  const senderId = event.sender?.id;
  const optin = event.optin;

  if (!senderId || !optin) {
    console.log("[WEBHOOK] Invalid optin event - missing sender or optin data");
    return;
  }

  try {
    const db = getSupabase();
    if (!db) return;

    const token = optin.notification_messages_token;
    const frequency = optin.notification_messages_frequency || "DAILY";
    const payload = optin.payload || "";
    const tokenExpiresAt = optin.token_expiry_timestamp
      ? new Date(optin.token_expiry_timestamp * 1000).toISOString()
      : new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString(); // 6 months default

    console.log(`[WEBHOOK] 🔔 Optin received from ${senderId}: frequency=${frequency}, payload=${payload}, hasToken=${!!token}`);

    if (!token) {
      console.log("[WEBHOOK] No notification token in optin - user may have declined");
      // User declined or notification_messages_status is "STOP_NOTIFICATIONS"
      if (optin.notification_messages_status === "STOP_NOTIFICATIONS") {
        await db.from("facebook_conversations").update({
          recurring_optin_status: "declined",
          updated_at: new Date().toISOString(),
        }).eq("participant_id", senderId).eq("page_id", pageId);

        // Mark any existing tokens as revoked
        await db.from("recurring_notification_tokens").update({
          token_status: "revoked",
        }).eq("participant_id", senderId).eq("page_id", pageId).eq("token_status", "active");
      }
      return;
    }

    // Find the conversation for this sender
    const { data: conv } = await db
      .from("facebook_conversations")
      .select("conversation_id")
      .eq("participant_id", senderId)
      .eq("page_id", pageId)
      .single();

    const conversationId = conv?.conversation_id || `t_${senderId}`;

    // Store the notification token
    await db.from("recurring_notification_tokens").upsert({
      conversation_id: conversationId,
      participant_id: senderId,
      page_id: pageId,
      token: token,
      token_status: "active",
      frequency: frequency,
      opted_in_at: new Date().toISOString(),
      expires_at: tokenExpiresAt,
      followup_sent: false,
    }, {
      onConflict: "conversation_id",
    });

    // Update conversation status
    await db.from("facebook_conversations").update({
      recurring_optin_status: "opted_in",
      updated_at: new Date().toISOString(),
    }).eq("conversation_id", conversationId);

    console.log(`[WEBHOOK] ✅ Recurring notification token stored for ${senderId} (${frequency})`);
  } catch (error) {
    console.error("[WEBHOOK] handleOptinEvent error:", error.message);
  }
}

/**
 * Handle message template status updates
 * Fired when a utility template is approved or rejected
 */
async function handleTemplateStatusUpdate(pageId, value) {
  try {
    const db = getSupabase();
    if (!db) return;

    if (!value) {
      console.log("[WEBHOOK] Template status update missing value");
      return;
    }

    const templateName = value.message_template_name || value.template_name || null;
    const templateId = value.message_template_id || value.template_id || null;
    const statusRaw = (value.message_template_status || value.status || "").toString().toUpperCase();
    const status = statusRaw || "PENDING";
    const errorMessage = value.reason || value.rejected_reason || value.error_message || null;

    let query = db.from("utility_followup_templates").update({
      status,
      error_message: errorMessage,
      approved_at: status === "APPROVED" ? new Date().toISOString() : null,
    }).eq("page_id", pageId);

    if (templateId) {
      query = query.eq("template_id", templateId);
    } else if (templateName) {
      query = query.eq("template_name", templateName);
    } else {
      console.log("[WEBHOOK] Template status update missing template id/name");
      return;
    }

    const { error } = await query;
    if (error) {
      console.error("[WEBHOOK] Template status update error:", error.message);
      return;
    }

    console.log(`[WEBHOOK] Template status updated: ${templateName || templateId} (${status})`);
  } catch (error) {
    console.error("[WEBHOOK] handleTemplateStatusUpdate error:", error.message);
  }
}

/**
 * Handle Facebook Postback events (Ice Breakers, Get Started buttons, persistent menu)
 * These happen when a user clicks a button instead of typing a message
 */
async function handlePostbackEvent(pageId, event) {
  const senderId = event.sender?.id;
  const timestamp = event.timestamp;
  const postback = event.postback;

  if (!senderId || !postback) {
    console.log(
      "[WEBHOOK] Invalid postback event - missing sender or postback data",
    );
    return;
  }

  const db = getSupabase();
  if (!db) return;

  try {
    const payload = postback.payload || "";
    const title = postback.title || payload || "Started conversation";

    console.log(
      `[WEBHOOK] Postback from ${senderId}: "${title}" (payload: ${payload})`,
    );

    // Handle BOOK_MEETING quick reply
    if (payload === "BOOK_MEETING") {
      await handleBookingQuickReply(pageId, senderId, timestamp);
      return;
    }

    // Handle GET_STARTED payload
    if (payload === "GET_STARTED" || payload === "START") {
      console.log(`[WEBHOOK] Handling GET_STARTED for ${senderId}`);
      await sendWelcomeMessage(pageId, senderId, null); // passing null as conversationId, function should handle
      return; // Skip further processing for GET_STARTED
    }

    // Check for referral data in the postback (ad clicks include this)
    const referral = postback.referral;
    if (referral) {
      console.log(
        `[WEBHOOK] Postback includes referral: source=${referral.source}, type=${referral.type}, ad_id=${referral.ad_id}`,
      );
    }

    // Ensure page exists
    const { data: existingPage } = await db
      .from("facebook_pages")
      .select("page_id")
      .eq("page_id", pageId)
      .single();

    if (!existingPage) {
      await db.from("facebook_pages").insert({
        page_id: pageId,
        page_name: `Page ${pageId}`,
        page_access_token: "pending",
        is_active: true,
      });
    }

    // Look up or create conversation
    let { data: existingConv } = await db
      .from("facebook_conversations")
      .select("*")
      .eq("participant_id", senderId)
      .eq("page_id", pageId)
      .single();

    // Try to get the real conversation ID and participant name from Facebook
    let conversationId = existingConv?.conversation_id;
    let participantName = existingConv?.participant_name;

    if (!conversationId || needsParticipantNameLookup(participantName)) {
      const result = await fetchRealConversationId(senderId, pageId);
      if (result.conversationId) {
        conversationId = result.conversationId;
      } else {
        conversationId = `t_${senderId}`;
      }
      if (result.name) {
        participantName = result.name;
      }
    }

    // Try to get name from Facebook API if still missing
    if (needsParticipantNameLookup(participantName)) {
      participantName = await fetchFacebookUserName(senderId, pageId);
    }

    participantName = resolveParticipantName({
      currentName: participantName,
      fallback: "Customer",
    });

    // Create/update conversation
    const conversationData = {
      conversation_id: conversationId,
      page_id: pageId,
      participant_id: senderId,
      participant_name: participantName || null,
      last_message_text: title,
      last_message_time: new Date(timestamp).toISOString(),
      last_message_from_page: false,
      unread_count: 1,
      updated_at: new Date().toISOString(),
      ai_enabled: existingConv?.ai_enabled ?? true,
      active_goal_id: existingConv?.active_goal_id || null,
    };

    const { error: convError } = await db
      .from("facebook_conversations")
      .upsert(conversationData, {
        onConflict: "conversation_id",
        ignoreDuplicates: false,
      });

    if (convError) {
      console.error(
        "[WEBHOOK] Failed to save postback conversation:",
        convError.message,
      );
      return;
    }

    console.log(`[WEBHOOK] ✅ Postback conversation saved: ${conversationId}`);

    // Save as a message for history
    const messageId = `postback_${senderId}_${timestamp}`;
    await db.from("facebook_messages").upsert(
      {
        message_id: messageId,
        conversation_id: conversationId,
        sender_id: senderId,
        message_text: `[Button: ${title}]`,
        timestamp: new Date(timestamp).toISOString(),
        is_from_page: false,
        is_read: false,
      },
      { onConflict: "message_id" },
    );

    // Track engagement
    const msgDate = new Date(timestamp);
    await db.from("contact_engagement").insert({
      conversation_id: conversationId,
      page_id: pageId,
      message_direction: "inbound",
      day_of_week: msgDate.getDay(),
      hour_of_day: msgDate.getHours(),
      engagement_score: 1,
      message_timestamp: msgDate.toISOString(),
    });

    // Trigger AI response - treat the postback as the first message
    // Check if auto_greet_new_contacts is enabled
    const { data: aiSettings } = await db
      .from("settings")
      .select("value")
      .eq("key", "ai_chatbot_config")
      .single();

    const autoGreetEnabled =
      aiSettings?.value?.auto_greet_new_contacts !== false;

    if (autoGreetEnabled) {
      console.log(
        "[WEBHOOK] Triggering AI greeting for postback (new contact)...",
      );
      await triggerAIResponse(db, conversationId, pageId, existingConv);
    } else {
      console.log(
        "[WEBHOOK] Auto-greet disabled - skipping AI greeting for postback",
      );
    }
  } catch (error) {
    console.error("[WEBHOOK] Postback handler error:", error.message);
  }
}

/**
 * Handle Facebook Referral events (ad clicks, m.me links with ref parameter)
 * These happen when a user clicks an ad or a referral link
 */
async function handleReferralEvent(pageId, event) {
  const senderId = event.sender?.id;
  const timestamp = event.timestamp;
  const referral = event.referral;

  if (!senderId || !referral) {
    console.log(
      "[WEBHOOK] Invalid referral event - missing sender or referral data",
    );
    return;
  }

  const db = getSupabase();
  if (!db) return;

  try {
    const source = referral.source || "UNKNOWN";
    const type = referral.type || "UNKNOWN";
    const adId = referral.ad_id || null;
    const ref = referral.ref || null;

    console.log(
      `[WEBHOOK] Referral from ${senderId}: source=${source}, type=${type}, ad_id=${adId}, ref=${ref}`,
    );

    // Ensure page exists
    const { data: existingPage } = await db
      .from("facebook_pages")
      .select("page_id")
      .eq("page_id", pageId)
      .single();

    if (!existingPage) {
      await db.from("facebook_pages").insert({
        page_id: pageId,
        page_name: `Page ${pageId}`,
        page_access_token: "pending",
        is_active: true,
      });
    }

    // Look up or create conversation
    let { data: existingConv } = await db
      .from("facebook_conversations")
      .select("*")
      .eq("participant_id", senderId)
      .eq("page_id", pageId)
      .single();

    // Try to get the real conversation ID and participant name
    let conversationId = existingConv?.conversation_id;
    let participantName = existingConv?.participant_name;

    if (!conversationId || needsParticipantNameLookup(participantName)) {
      const result = await fetchRealConversationId(senderId, pageId);
      if (result.conversationId) {
        conversationId = result.conversationId;
      } else {
        conversationId = `t_${senderId}`;
      }
      if (result.name) {
        participantName = result.name;
      }
    }

    if (needsParticipantNameLookup(participantName)) {
      participantName = await fetchFacebookUserName(senderId, pageId);
    }

    participantName = resolveParticipantName({
      currentName: participantName,
      fallback: "Customer",
    });

    // Create welcome message based on source
    const welcomeContext =
      source === "ADS"
        ? "Clicked on Facebook ad"
        : ref
          ? `Referral: ${ref}`
          : "Started conversation via link";

    // Create/update conversation
    const conversationData = {
      conversation_id: conversationId,
      page_id: pageId,
      participant_id: senderId,
      participant_name: participantName || null,
      last_message_text: welcomeContext,
      last_message_time: new Date(timestamp).toISOString(),
      last_message_from_page: false,
      unread_count: 1,
      updated_at: new Date().toISOString(),
      ai_enabled: existingConv?.ai_enabled ?? true,
      active_goal_id: existingConv?.active_goal_id || null,
      source: source === "ADS" ? "ad" : "referral",
    };

    const { error: convError } = await db
      .from("facebook_conversations")
      .upsert(conversationData, {
        onConflict: "conversation_id",
        ignoreDuplicates: false,
      });

    if (convError) {
      console.error(
        "[WEBHOOK] Failed to save referral conversation:",
        convError.message,
      );
      return;
    }

    console.log(`[WEBHOOK] ✅ Referral conversation saved: ${conversationId}`);

    // Save as a message for history
    const messageId = `referral_${senderId}_${timestamp}`;
    await db.from("facebook_messages").upsert(
      {
        message_id: messageId,
        conversation_id: conversationId,
        sender_id: senderId,
        message_text: `[${welcomeContext}]`,
        timestamp: new Date(timestamp).toISOString(),
        is_from_page: false,
        is_read: false,
      },
      { onConflict: "message_id" },
    );

    // Track engagement
    const msgDate = new Date(timestamp);
    await db.from("contact_engagement").insert({
      conversation_id: conversationId,
      page_id: pageId,
      message_direction: "inbound",
      day_of_week: msgDate.getDay(),
      hour_of_day: msgDate.getHours(),
      engagement_score: 2, // Higher score for ad clicks
      message_timestamp: msgDate.toISOString(),
    });

    // Trigger AI response
    // Check if auto_greet_new_contacts is enabled
    const { data: aiSettings } = await db
      .from("settings")
      .select("value")
      .eq("key", "ai_chatbot_config")
      .single();

    const autoGreetEnabled =
      aiSettings?.value?.auto_greet_new_contacts !== false;

    if (autoGreetEnabled) {
      console.log(
        "[WEBHOOK] Triggering AI greeting for referral (ad click)...",
      );
      await triggerAIResponse(db, conversationId, pageId, existingConv);
    } else {
      console.log(
        "[WEBHOOK] Auto-greet disabled - skipping AI greeting for referral",
      );
    }
  } catch (error) {
    console.error("[WEBHOOK] Referral handler error:", error.message);
  }
}

/**
 * Send the first-message welcome trigger
 */
async function sendWelcomeMessage(pageId, recipientId, conversationId = null) {
  const db = getSupabase();
  if (!db) return false;

  try {
    // 1. Get Booking URL + page token in parallel
    const [settingsResult, pageResult] = await Promise.all([
      db.from("settings").select("value").eq("key", "ai_chatbot_config").single(),
      db.from("facebook_pages").select("page_access_token").eq("page_id", pageId).single()
    ]);

    const settings = settingsResult.data;
    const pageToken = pageResult.data?.page_access_token;

    if (!pageToken || pageToken === 'pending') {
      console.error("[WEBHOOK] sendWelcomeMessage: No valid page token for", pageId);
      return false;
    }

    // 3. Get contact context for personalization
    let participantName = "Friend";
    let openerMessage = "";
    let extractedDetails = {};
    try {
      const { data: conv } = await db
        .from("facebook_conversations")
        .select("participant_name,last_message_text,extracted_details")
        .eq("conversation_id", conversationId)
        .single();
      if (conv?.participant_name) participantName = conv.participant_name;
      if (conv?.last_message_text) openerMessage = conv.last_message_text;
      if (conv?.extracted_details && typeof conv.extracted_details === "object") {
        extractedDetails = conv.extracted_details;
      }
    } catch (e) { }
    const greetingName =
      getDisplayContactName(participantName, getFirstName) || "Friend";

    // DEBUG: Log settings to find correct booking URL key
    console.log("[WEBHOOK] Welcome Settings Dump:", JSON.stringify(settings?.value || {}, null, 2));

    // === BOOKING URL LOOKUP CHAIN (highest priority first) ===
    // 1. Environment variable (most reliable — set once in Vercel dashboard)
    let bookingUrl = process.env.BOOKING_URL || process.env.DEFAULT_BOOKING_URL;

    // 2. Welcome button URL from config (new UI field)
    if (!bookingUrl) {
      bookingUrl = settings?.value?.welcome_button_url;
    }

    // 3. Booking URL keys from ai_chatbot_config
    if (!bookingUrl) {
      bookingUrl = settings?.value?.booking_url || settings?.value?.booking_link || settings?.value?.bookingLink;
    }

    // 4. Check booking_settings table
    if (!bookingUrl) {
      try {
        const { data: bookingSettingsData } = await db
          .from("booking_settings")
          .select("booking_url, booking_link")
          .eq("page_id", pageId)
          .single();
        if (bookingSettingsData) {
          bookingUrl = bookingSettingsData.booking_url || bookingSettingsData.booking_link;
        }
      } catch (bsErr) {
        console.log("[WEBHOOK] booking_settings lookup (non-fatal):", bsErr.message);
      }
    }

    // 5. Final fallback: app's own booking page
    if (!bookingUrl) {
      const appHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.APP_URL || "https://gaia-app.vercel.app";
      bookingUrl = `${appHost}/booking?pageId=${pageId}`;
      console.log("[WEBHOOK] Using fallback booking URL:", bookingUrl);
    }

    console.log("[WEBHOOK] Final booking URL:", bookingUrl);

    // Read custom welcome settings
    const customWelcomeText = settings?.value?.welcome_message_text || "";
    const aiGenEnabled = settings?.value?.welcome_ai_generated !== false; // default: true
    const configuredButtonLabel = settings?.value?.welcome_button_label || "";
    const hasCustomButtonLabel = configuredButtonLabel.trim().length > 0;
    let primaryButtonLabel = hasCustomButtonLabel
      ? sanitizeWelcomeButtonLabel(configuredButtonLabel)
      : DEFAULT_WELCOME_BUTTON_LABEL;
    const customButtonUrl = settings?.value?.welcome_button_url || bookingUrl;
    const button2Enabled = settings?.value?.welcome_button2_enabled === true;
    const button2Label = settings?.value?.welcome_button2_label || "";
    const button2Url = settings?.value?.welcome_button2_url || "";

    // Determine welcome text
    let welcomeText = buildWelcomeFallbackMessage(greetingName);

    if (customWelcomeText) {
      // Use user's custom text (replace {{name}} placeholder)
      welcomeText = customWelcomeText.replace(/\{\{name\}\}/gi, greetingName);
    } else if (aiGenEnabled) {
      // Generate clickbait + personalized first message via AI
      const systemPrompt = settings?.value?.system_prompt || "You are a helpful real estate assistant.";
      const botDos = settings?.value?.bot_rules_dos || "";
      const botDonts = settings?.value?.bot_rules_donts || "";
      const recentMessagesToAvoid = Array.isArray(settings?.value?.welcome_recent_messages)
        ? settings.value.welcome_recent_messages.filter(Boolean).slice(0, 5)
        : [];

      const { prompt: welcomePrompt, angle: selectedAngle } = buildWelcomeGenerationPrompt({
        firstName: greetingName,
        cityOrArea: extractedDetails.city || extractedDetails.location || extractedDetails.area,
        propertyInterest:
          extractedDetails.property_interest ||
          extractedDetails.propertyType ||
          extractedDetails.property_type ||
          extractedDetails.intent,
        budgetRange: extractedDetails.budget || extractedDetails.budget_range,
        timeline: extractedDetails.timeline,
        goal: extractedDetails.goal,
        painPoint: extractedDetails.pain_point || extractedDetails.painPoint,
        leadSource: extractedDetails.lead_source || "facebook_messenger",
        openerMessage,
        recentMessagesToAvoid,
        lastAngleUsed: settings?.value?.welcome_last_angle || "",
        systemPrompt,
        botDos,
        botDonts,
      });

      let selectedOutputAngle = selectedAngle;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
        const completion = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "meta/llama-3.1-8b-instruct",
            messages: [{ role: "user", content: welcomePrompt }],
            temperature: 0.7,
            max_tokens: 100,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const data = await completion.json();
        if (data.choices?.[0]?.message?.content) {
          const parsedOutput = parseWelcomeGenerationOutput(data.choices[0].message.content, greetingName);
          welcomeText = parsedOutput.message;
          if (!hasCustomButtonLabel && parsedOutput.button) {
            primaryButtonLabel = parsedOutput.button;
          }
          if (parsedOutput.angle) {
            selectedOutputAngle = parsedOutput.angle;
          }

          try {
            const existingMessages = Array.isArray(settings?.value?.welcome_recent_messages)
              ? settings.value.welcome_recent_messages.filter(Boolean)
              : [];
            const updatedRecentMessages = [
              welcomeText,
              ...existingMessages.filter((msg) => msg !== welcomeText),
            ].slice(0, 5);

            await db
              .from("settings")
              .update({
                value: {
                  ...(settings?.value || {}),
                  welcome_last_angle: selectedOutputAngle,
                  welcome_recent_messages: updatedRecentMessages,
                },
              })
              .eq("key", "ai_chatbot_config");
          } catch (persistErr) {
            console.warn("[WEBHOOK] Failed to persist welcome angle/history:", persistErr.message);
          }
        }
      } catch (aiErr) {
        console.error("[WEBHOOK] Welcome AI Gen Failed:", aiErr.message);
        welcomeText = buildWelcomeFallbackMessage(greetingName);
        if (!hasCustomButtonLabel) {
          primaryButtonLabel = DEFAULT_WELCOME_BUTTON_LABEL;
        }
      }
    }

    // 4. Construct Welcome Message with configurable buttons
    const buttons = [];
    buttons.push({
      type: "web_url",
      url: customButtonUrl,
      title: primaryButtonLabel,
      webview_height_ratio: "full"
    });

    // Optional second button
    if (button2Enabled && button2Label && button2Url) {
      buttons.push({
        type: "web_url",
        url: button2Url,
        title: button2Label,
        webview_height_ratio: "full"
      });
    }

    const welcomeMessage = {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: welcomeText,
            buttons: buttons
          }
        }
      }
    };

    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${pageToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(welcomeMessage),
      },
    );

    if (resp.ok) {
      console.log(`[WEBHOOK] Welcome message sent to ${recipientId} (Booking URL: ${bookingUrl})`);
      // Log to DB if we have conversationId
      if (conversationId) {
        try {
          await db.from("facebook_messages").insert({
            message_id: `welcome_${recipientId}_${Date.now()}`,
            conversation_id: conversationId,
            sender_id: pageId,
            message_text: welcomeText,
            is_from_page: true,
            timestamp: new Date().toISOString(),
            sent_source: "app"
          });
        } catch (e) { console.warn("Failed to log welcome msg", e); }
      }
      return true;
    } else {
      const errorData = await resp.json();
      console.error("[WEBHOOK] FB Send Error:", errorData);
    }
    return false;
  } catch (error) {
    console.error(`[WEBHOOK] Failed to send welcome message: ${error.message}`);
    return false;
  }
}

/**
 * Send a marketing message using a notification token
 */
async function sendMarketingMsg(page, token, text, template) {
  const body = { recipient: { notification_messages_token: token.token } };
  if (template) {
    body.message = { attachment: { type: "template", payload: template } };
  } else {
    body.message = { text };
  }
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${page.page_id}/messages?access_token=${page.page_access_token}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const data = await resp.json();
    if (resp.ok) {
      console.log(`[MARKETING] ✅ Sent to ${token.participant_id}: ${data.message_id}`);
      return { success: true, message_id: data.message_id };
    }
    console.log(`[MARKETING] ❌ Failed:`, data.error?.message);
    return { success: false, error: data.error?.message, error_code: data.error?.code };
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
