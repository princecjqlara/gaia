function sanitizeHookText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s+/g, " ")
    .replace(/["'`]/g, "")
    .trim();
}

export function buildNotificationOptinMessage({
  participantId,
  title,
  payload = "MARKETING_OPTIN_PROPERTIES",
} = {}) {
  const safeTitle = sanitizeHookText(title) || "Get property updates?";

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
  );
}

export function buildOptinFallbackText(hookText) {
  const safeHook = sanitizeHookText(hookText);
  if (safeHook) {
    return safeHook;
  }

  return "May updates ako for you po. Reply here anytime para ma-send ko agad ang best matches.";
}
