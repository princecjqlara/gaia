const OPTIN_TITLE_MAX_LENGTH = 65;

function sanitizeHookText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s+/g, " ")
    .replace(/["'`]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function buildSafeOptinTitle(rawTitle) {
  const cleaned = sanitizeHookText(rawTitle);
  if (!cleaned) {
    return "Get property updates?";
  }

  const firstSentence = cleaned.match(/[^.!?]+[.!?]?/);
  let safeTitle = (firstSentence?.[0] || cleaned).trim();

  if (safeTitle.length > OPTIN_TITLE_MAX_LENGTH) {
    safeTitle = safeTitle.slice(0, OPTIN_TITLE_MAX_LENGTH).trim();
  }

  return safeTitle || "Get property updates?";
}

export function buildNotificationOptinMessage({
  participantId,
  title,
  payload = "MARKETING_OPTIN_PROPERTIES",
} = {}) {
  const safeTitle = buildSafeOptinTitle(title);

  return {
    recipient: { id: participantId },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "notification_messages",
          title: safeTitle,
          payload,
        },
      },
    },
    messaging_type: "RESPONSE",
  };
}

export function isUnsupportedNotificationOptinError(rawError) {
  const text = typeof rawError === "string" ? rawError : "";
  if (!text) {
    return false;
  }

  return (
    /invalid keys/i.test(text) &&
    /notification_messages_/i.test(text)
  ) || (
    /name_placeholder/i.test(text) &&
    /notification_messages_/i.test(text)
  ) || (
    /title length exceeded/i.test(text)
  ) || (
    /error_subcode"?\s*:\s*2018309/i.test(text)
  );
}

export function buildOptinFallbackText(hookText) {
  const safeHook = sanitizeHookText(hookText);
  if (safeHook) {
    return safeHook;
  }

  return "May updates ako for you po. Reply here anytime para ma-send ko agad ang best matches.";
}
