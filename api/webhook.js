import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

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
          subscribed_fields: "messages,messaging_postbacks,messaging_referrals,messaging_optins,messaging_handovers,feed",
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
      .select("page_access_token, page_name")
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
) {
  try {
    await db.from("property_views").insert({
      property_id: propertyId,
      property_title: propertyTitle,
      participant_id: participantId,
      visitor_name: visitorName,
      source: "fb_messenger",
      viewed_at: new Date().toISOString(),
    });
    console.log("[PROPERTY CLICK] ✅ View logged to database");
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
    const showcaseUrl = `${baseUrl}/property/${propertyId}?mode=showcase&pid=${participantId}`;

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

    // Fetch name if missing, empty, or is "Unknown" (for both incoming messages AND echoes)
    const needsNameLookup =
      !participantName ||
      participantName === "Unknown" ||
      participantName.trim() === "";
    if (needsNameLookup) {
      // Source 1: Check if Facebook included sender name in the event
      const senderNameFromEvent =
        event.sender?.name || event.recipient?.name || message.sender_name;
      if (senderNameFromEvent) {
        console.log(`[WEBHOOK] Got name from event: ${senderNameFromEvent}`);
        participantName = senderNameFromEvent;
      }

      // FAST name lookup - only use event data, no slow API calls
      if (!participantName) {
        const senderNameFromEvent =
          event.sender?.name || event.recipient?.name || message.sender_name;
        participantName = senderNameFromEvent || "Customer";
      }
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
            const { autoLabelConversation } =
              await import("../src/services/aiConversationAnalyzer");

            // Get messages
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
              const labelingRules = aiSettings?.value?.labeling_rules || "";

              const result = await autoLabelConversation(
                msgs,
                existingTagNames,
                labelingRules,
              );

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

                  // Check if tag exists
                  let { data: existingTag } = await db
                    .from("conversation_tags")
                    .select("id")
                    .eq("page_id", pageId)
                    .ilike("name", normalizedName)
                    .single();

                  // Create if not exists
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

                  // Assign tag
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

                // Remove labels
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

    // PARALLEL: Fetch page token, properties, and messages all at once
    let pageResult, propertiesResult, messagesResult;
    try {
      [pageResult, propertiesResult, messagesResult] = await Promise.all([
        db.from("facebook_pages").select("page_access_token").eq("page_id", pageId).single(),
        db.from("properties").select("id,title,address,price,bedrooms,bathrooms,floor_area,description,images").eq("status", "For Sale").order("created_at", { ascending: false }).limit(10),
        db.from("facebook_messages").select("message_text,is_from_page,attachments").eq("conversation_id", conversationId).order("timestamp", { ascending: false }).limit(15),
      ]);
    } catch (parallelErr) {
      console.error("[WEBHOOK] Parallel fetch 2 FAILED:", parallelErr.message);
      return;
    }

    const page = pageResult.data;
    const properties = propertiesResult.data;
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
    const knownPhone =
      conversation?.phone_number || conversation?.extracted_details?.phone;

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

## 🗣️ LANGUAGE (CRITICAL - MUST FOLLOW)
You MUST respond in ${language}. This is MANDATORY.
- Use Taglish (mix Filipino and English naturally in sentences)
- Use "po" and "opo" for respect
- Example: "Hello po! Kumusta? Ready na po tayo sa consultation mo!"
- Example: "Ano po ang business mo? Gusto namin i-maximize yung ROI mo sa ads."
- NEVER respond in pure English only - always mix Filipino words.

## Platform: Facebook Messenger
Contact Name: ${conversation?.participant_name || "Customer"}
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

    aiPrompt += `
## 🎯 YOUR CURRENT GOAL (CRITICAL - This is your PRIMARY objective)
Goal: ${activeGoal.toUpperCase()}
Instructions: ${goalDescriptions[activeGoal] || "Help the customer and guide them towards taking action."}
Every response should move the conversation closer to achieving this goal.
`;

    const customGoals = config.custom_goals?.trim();
    if (customGoals) {
      aiPrompt += `\n## Additional Goals\n${customGoals}\n`;
    }

    // Booking context (simplified - no calendar DB queries)
    if (activeGoal === "booking" || config.booking_url) {
      aiPrompt += `\n## 📅 BOOKING\nWhen customer wants to book, suggest weekday times (Mon-Fri 9AM-5PM).\nIf they confirm, add this marker at the END of your response:\nBOOKING_CONFIRMED: YYYY-MM-DD HH:MM | CustomerName | PhoneNumber\n`;
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

    // Add bot rules
    if (config.bot_rules_dos) {
      aiPrompt += `\n## ✅ DO's\n${config.bot_rules_dos}\n`;
    }
    if (config.bot_rules_donts) {
      aiPrompt += `\n## ❌ DON'Ts\n${config.bot_rules_donts}\n`;
    }

    // Add properties (compact format)
    if (properties && properties.length > 0) {
      const propertyList = properties.map((p) =>
        `- ID:${p.id} | ${p.title} | ${p.address} | ₱${parseInt(p.price || 0).toLocaleString()} | ${p.bedrooms || '?'}BR/${p.bathrooms || '?'}BA | ${p.floor_area || '?'}sqm${p.images?.[0] ? ` | img:${p.images[0]}` : ''}`
      ).join('\n');

      aiPrompt += `\n## 🏠 PROPERTIES FOR SALE\n${propertyList}\n\nTo show a property card: SEND_PROPERTY_CARD: [property_id]\nAsk about budget/location/bedrooms first. Max 3 cards at once.\n`;
    }

    if (config.booking_url) {
      aiPrompt += `\nBooking link: ${config.booking_url}\n`;
    }

    aiPrompt += `
## RULES
- Customer name: "${conversation?.participant_name || "NOT PROVIDED"}" (if NOT PROVIDED, use "po" instead)
- NEVER invent names. Use "po" for respect.
- Split responses with ||| (1-2 sentences per part, like texting)
- Example: "Hello po! ||| I'd be happy to help. ||| What are you looking for?"
- When booking confirmed, add at END: BOOKING_CONFIRMED: YYYY-MM-DD HH:MM | Name | Phone
- Use 24h format (18:00 not 6pm), PIPE | separator
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
      MODELS = [
        "meta/llama-3.2-11b-vision-instruct",
      ];
    } else {
      // Use fast 8b model first (responds in ~2-3s), 70b as fallback
      MODELS = [
        "meta/llama-3.1-8b-instruct",
        "meta/llama-3.1-70b-instruct",
      ];
    }

    let aiReply = null;
    let lastError = null;

    for (const model of MODELS) {
      try {
        console.log(`[WEBHOOK] Trying model: ${model}, hasImages: ${hasImages}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s timeout per model attempt
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
          const customerName =
            parts[1] || conversation?.participant_name || "Customer";
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
            const customerName = conversation?.participant_name || "Customer";

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
                customerName !== "Customer" &&
                customerName !== "Unknown"
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
        // Regular text message, remove the marker if AI included it
        const cleanedText = part.replace(/^SEND_PROPERTY_CARD:\s*[a-zA-Z0-9\-]+\s*/i, "").trim();
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
        const propertyUrl = `${process.env.APP_URL || window?.location?.origin || ""}/property/${prop.id}?pid=${participantId}`;

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

      // Small delay between messages to maintain order
      if (i < messageParts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log("[WEBHOOK] AI reply sent successfully!");

    console.log(`[WEBHOOK] AI reply sent! Total time: ${Date.now() - startTime}ms`);

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
    const { error: scheduleError } = await db
      .from("ai_followup_schedule")
      .insert({
        conversation_id: conversationId,
        page_id: pageId,
        scheduled_at: scheduledAt.toISOString(),
        follow_up_type: sanitizedType,
        reason: analysis.reason || "AI scheduled follow-up",
        status: "pending",
      });

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
      .limit(1)
      .single();

    if (existingFollow) {
      console.log('[WEBHOOK] 👁️ Read-triggered follow-up already pending, skipping');
      return;
    }

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

    // 4. Check that the message was sent reasonably recently (within 24h)
    const msgAge = Date.now() - new Date(lastMsg.timestamp).getTime();
    if (msgAge > 24 * 60 * 60 * 1000) {
      console.log('[WEBHOOK] 👁️ Last AI message is older than 24h, skipping read follow-up');
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

    // 6. Schedule a quick read-aware follow-up (5-15 min delay)
    const delayMinutes = Math.floor(Math.random() * 11) + 5; // 5-15 minutes
    const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    await db.from('ai_followup_schedule').insert({
      conversation_id: conv.conversation_id,
      page_id: pageId,
      scheduled_at: scheduledAt.toISOString(),
      status: 'pending',
      follow_up_type: 'read_receipt',
      notes: `Contact read message at ${new Date(readTimestamp).toISOString()}. Scheduled read-aware follow-up in ${delayMinutes} minutes.`
    });

    console.log(`[WEBHOOK] 👁️ Read-triggered follow-up scheduled for ${conv.participant_name || senderId} in ${delayMinutes} min`);
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

    if (!conversationId || !participantName || participantName === "Unknown") {
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
    if (!participantName || participantName === "Unknown") {
      participantName = await fetchFacebookUserName(senderId, pageId);
    }

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
      source: referral?.source === "ADS" ? "ad" : "postback",
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

    if (!conversationId || !participantName || participantName === "Unknown") {
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

    if (!participantName || participantName === "Unknown") {
      participantName = await fetchFacebookUserName(senderId, pageId);
    }

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

export const config = {
  api: {
    bodyParser: true,
  },
  maxDuration: 60,
};
