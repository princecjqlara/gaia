import { betaSample } from "./followupPromptStrategy.js";

const PROHIBITED_WELCOME_TERMS = /\b(consultation|consult|booking|book|schedule|appointment|meeting|call)\b/i;
const MESSENGER_BUTTON_MAX_LENGTH = 20;
const WELCOME_MIN_EXPLORATION_SENDS = 2;

export const DEFAULT_WELCOME_BUTTON_LABEL = "Show Top Picks";

export const WELCOME_HOOK_ANGLES = [
  "insider drop",
  "hidden listing",
  "budget match alert",
  "location price move",
  "limited opportunity",
  "fast-moving picks",
];

function normalizePromptValue(value) {
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => `${item}`.trim()).filter(Boolean);
    return cleaned.length ? cleaned.join(" | ") : "N/A";
  }

  if (value === null || value === undefined) {
    return "N/A";
  }

  const cleaned = `${value}`.trim();
  return cleaned || "N/A";
}

export function buildWelcomeFallbackMessage(firstName = "Friend") {
  const cleanedName = `${firstName || ""}`.trim();
  if (cleanedName && cleanedName.toLowerCase() !== "friend") {
    return `Kumusta, ${cleanedName}! May bagong property picks ngayon na mabilis maubos - gusto mo makita bago maunahan?`;
  }

  return "Kumusta! May bagong property picks ngayon na mabilis maubos - gusto mo makita bago maunahan?";
}

export function sanitizeWelcomeText(rawText, firstName = "Friend") {
  const fallback = buildWelcomeFallbackMessage(firstName);
  if (typeof rawText !== "string") {
    return fallback;
  }

  let cleaned = rawText.replace(/[\r\n]+/g, " ").replace(/["'`]+/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return fallback;
  }

  if (PROHIBITED_WELCOME_TERMS.test(cleaned)) {
    return fallback;
  }

  const sentenceChunks = cleaned.match(/[^.!?]+[.!?]?/g);
  if (sentenceChunks && sentenceChunks.length > 2) {
    cleaned = `${sentenceChunks[0].trim()} ${sentenceChunks[1].trim()}`.trim();
  }

  if (cleaned.length > 280) {
    cleaned = `${cleaned.slice(0, 277).trim()}...`;
  }

  return cleaned;
}

export function sanitizeWelcomeButtonLabel(rawLabel) {
  if (typeof rawLabel !== "string") {
    return DEFAULT_WELCOME_BUTTON_LABEL;
  }

  let cleaned = rawLabel.replace(/["'`]+/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned || PROHIBITED_WELCOME_TERMS.test(cleaned)) {
    return DEFAULT_WELCOME_BUTTON_LABEL;
  }

  if (cleaned.length > MESSENGER_BUTTON_MAX_LENGTH) {
    cleaned = cleaned.slice(0, MESSENGER_BUTTON_MAX_LENGTH).trim();
  }

  return cleaned || DEFAULT_WELCOME_BUTTON_LABEL;
}

function normalizeAngleStats(angleStats = {}, angle) {
  const rawStats = angleStats && typeof angleStats === "object" ? angleStats[angle] : null;
  const sent = Number(rawStats?.sent);
  const replies = Number(rawStats?.replies);
  const safeSent = Number.isFinite(sent) ? Math.max(0, Math.floor(sent)) : 0;
  const safeReplies = Number.isFinite(replies) ? Math.max(0, Math.floor(replies)) : 0;
  return {
    sent: safeSent,
    replies: Math.min(safeReplies, safeSent),
  };
}

export function pickWelcomeHookAngle(lastAngleUsed = "", randomFn = Math.random, angleStats = {}) {
  const cleanedLastAngle = `${lastAngleUsed || ""}`.trim().toLowerCase();
  const candidates = WELCOME_HOOK_ANGLES.filter((angle) => angle !== cleanedLastAngle);
  const pool = candidates.length ? candidates : WELCOME_HOOK_ANGLES;
  const safeRandomFn = typeof randomFn === "function" ? randomFn : Math.random;

  const underTestedAngles = pool.filter((angle) => {
    const stats = normalizeAngleStats(angleStats, angle);
    return stats.sent < WELCOME_MIN_EXPLORATION_SENDS;
  });

  if (underTestedAngles.length > 0) {
    const rawRandom = Number(safeRandomFn());
    const normalizedRandom = Number.isFinite(rawRandom)
      ? Math.min(Math.max(rawRandom, 0), 0.999999)
      : 0;
    const index = Math.floor(normalizedRandom * underTestedAngles.length);
    return underTestedAngles[index] || underTestedAngles[0] || WELCOME_HOOK_ANGLES[0];
  }

  let bestAngle = pool[0] || WELCOME_HOOK_ANGLES[0];
  let bestScore = -1;
  for (const angle of pool) {
    const stats = normalizeAngleStats(angleStats, angle);
    const failures = Math.max(0, stats.sent - stats.replies);
    const score = betaSample(stats.replies + 1, failures + 1);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  if (bestAngle) {
    return bestAngle;
  }

  const rawRandom = Number(safeRandomFn());
  const normalizedRandom = Number.isFinite(rawRandom)
    ? Math.min(Math.max(rawRandom, 0), 0.999999)
    : 0;
  const index = Math.floor(normalizedRandom * pool.length);
  return pool[index] || pool[0] || WELCOME_HOOK_ANGLES[0];
}

export function buildWelcomeGenerationPrompt({
  firstName,
  cityOrArea,
  propertyInterest,
  budgetRange,
  timeline,
  goal,
  painPoint,
  leadSource,
  openerMessage,
  recentMessagesToAvoid,
  lastAngleUsed,
  randomFn,
  angleStats,
  systemPrompt,
  botDos,
  botDonts,
  welcomePromptInstruction,
} = {}) {
  const selectedAngle = pickWelcomeHookAngle(lastAngleUsed, randomFn, angleStats);

  const prompt = `You are a high-converting Messenger copywriter for real estate leads in the Philippines.

Task: Generate ONE first-message auto-trigger for a brand-new contact.
Goal: Always sound fresh, personalized, and clickbait-style (attention-grabbing), while staying believable.

Business context:
${normalizePromptValue(systemPrompt)}

Lead context:
- first_name: ${normalizePromptValue(firstName)}
- city_or_area: ${normalizePromptValue(cityOrArea)}
- property_interest: ${normalizePromptValue(propertyInterest)}
- budget_range: ${normalizePromptValue(budgetRange)}
- timeline: ${normalizePromptValue(timeline)}
- goal: ${normalizePromptValue(goal)}
- pain_point: ${normalizePromptValue(painPoint)}
- lead_source: ${normalizePromptValue(leadSource)}
- opener_message: ${normalizePromptValue(openerMessage)}
- recent_messages_to_avoid: ${normalizePromptValue(recentMessagesToAvoid)}
- last_angle_used: ${normalizePromptValue(lastAngleUsed)}

Rules:
1) Write only 1 short message (max 2 sentences).
2) Use Taglish by default; switch to English only if lead data is clearly English.
3) Personalize using at least 2 lead fields (name + location/interest/budget/etc).
4) Use a strong curiosity hook + urgency/FOMO.
5) Do NOT mention or imply: consultation, booking, schedule, appointment, call, meeting.
6) End with a reply-driving question.
7) Must be clearly different from recent_messages_to_avoid.
8) Use a different hook angle from last_angle_used.
9) Add 1 CTA button label (2-4 words), no booking language.

${welcomePromptInstruction ? `Custom welcome prompt instruction:\n${welcomePromptInstruction}\n\n` : ""}${botDos ? `MUST DO:\n${botDos}\n` : ""}${botDonts ? `MUST NOT DO:\n${botDonts}\n` : ""}Allowed hook angles:
- insider drop
- hidden listing
- budget match alert
- location price move
- limited opportunity
- fast-moving picks

Use this hook angle for this run: ${selectedAngle}

Output exactly in this format:
Message: <final message>
Button: <cta text>
Angle: <chosen angle>`;

  return { prompt, angle: selectedAngle };
}

export function parseWelcomeGenerationOutput(rawOutput, firstName = "Friend") {
  const text = typeof rawOutput === "string" ? rawOutput.trim() : "";
  const messageMatch = text.match(/^Message:\s*(.+)$/im);
  const buttonMatch = text.match(/^Button:\s*(.+)$/im);
  const angleMatch = text.match(/^Angle:\s*(.+)$/im);

  const parsedMessage = messageMatch?.[1]?.trim() || text;
  const parsedButton = buttonMatch?.[1]?.trim() || DEFAULT_WELCOME_BUTTON_LABEL;
  const parsedAngle = (angleMatch?.[1] || "").trim().toLowerCase();

  return {
    message: sanitizeWelcomeText(parsedMessage, firstName),
    button: sanitizeWelcomeButtonLabel(parsedButton),
    angle: parsedAngle,
  };
}
