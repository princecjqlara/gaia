function toIsoString(dateLike) {
  const parsed = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : new Date().toISOString();
}

export function buildAiFollowupSchedulePayload({
  conversationId,
  pageId,
  scheduledAt,
  followUpType,
  reason,
  status = "pending",
} = {}) {
  const scheduledIso = toIsoString(scheduledAt || new Date());

  return {
    conversation_id: conversationId,
    page_id: pageId,
    scheduled_at: scheduledIso,
    scheduled_for: scheduledIso,
    follow_up_type: followUpType || "reminder",
    reason: reason || "AI scheduled follow-up",
    status,
  };
}
