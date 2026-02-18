import { buildAiFollowupSchedulePayload } from "../utils/followUpSchedulePayload";

describe("followUpSchedulePayload", () => {
  test("includes both scheduled_at and scheduled_for", () => {
    const scheduledAt = new Date("2026-02-18T07:40:26.022Z");
    const payload = buildAiFollowupSchedulePayload({
      conversationId: "t_123",
      pageId: "page_1",
      scheduledAt,
      followUpType: "reminder",
      reason: "Customer asked a question",
    });

    expect(payload.scheduled_at).toBe(scheduledAt.toISOString());
    expect(payload.scheduled_for).toBe(scheduledAt.toISOString());
    expect(payload.status).toBe("pending");
  });

  test("defaults follow_up_type and reason safely", () => {
    const payload = buildAiFollowupSchedulePayload({
      conversationId: "t_456",
      pageId: "page_2",
      scheduledAt: new Date("2026-02-18T08:00:00.000Z"),
    });

    expect(payload.follow_up_type).toBe("reminder");
    expect(payload.reason).toBe("AI scheduled follow-up");
  });
});
