import { jest } from "@jest/globals";
import {
  buildBackfillConversationRecords,
  calculateBestTimeToContact,
} from "../../api/cron/ai-followup.js";
import {
  buildFollowupCounterSummary,
  evaluateSevenDayWindow,
  getCounterResultCount,
} from "../../api/scheduled/process.js";
import { shouldSkipReadReceiptFollowup } from "../../api/webhook.js";

function createEngagementDb(engagements) {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: engagements }),
  };

  return {
    from: jest.fn().mockReturnValue(query),
  };
}

describe("ai follow-up scheduling compliance", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("best-time scheduling picks the next daily best hour (within 24 hours)", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-02T12:15:00.000Z"));

    const db = createEngagementDb([
      { day_of_week: 5, hour_of_day: 10, response_latency_seconds: 100 },
      { day_of_week: 5, hour_of_day: 10, response_latency_seconds: 120 },
      { day_of_week: 5, hour_of_day: 10, response_latency_seconds: 90 },
      { day_of_week: 2, hour_of_day: 9, response_latency_seconds: 800 },
    ]);

    const result = await calculateBestTimeToContact(db, "conv_1", "page_1");
    const msUntilBest = result.nextBestTime.getTime() - Date.now();

    expect(msUntilBest).toBeGreaterThan(0);
    expect(msUntilBest).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  test("7-day check falls back to conversation activity when inbound timestamp is missing", () => {
    const status = evaluateSevenDayWindow({
      lastInboundTimestamp: null,
      conversationLastMessageTimestamp: "2026-02-20T00:00:00.000Z",
      now: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(status.outside7DayWindow).toBe(true);
    expect(status.daysSinceLastMsg).toBeGreaterThan(7);
  });

  test("7-day check defaults to outside window when inbound is missing and last message is from page", () => {
    const status = evaluateSevenDayWindow({
      lastInboundTimestamp: null,
      conversationLastMessageTimestamp: "2026-03-01T00:00:00.000Z",
      conversationLastMessageFromPage: true,
      now: new Date("2026-03-02T00:00:00.000Z"),
    });

    expect(status.outside7DayWindow).toBe(true);
  });

  test("read receipt is still eligible beyond 7 days so utility fallback can send", () => {
    const status = shouldSkipReadReceiptFollowup(
      "2026-02-20T00:00:00.000Z",
      new Date("2026-03-02T00:00:00.000Z"),
    );

    expect(status.skip).toBe(false);
  });

  test("diagnostic summary groups sent counts by follow-up type", () => {
    const summary = buildFollowupCounterSummary({
      pendingTotal: 9,
      pendingDue: 4,
      pendingReadReceipt: 2,
      failedUtilityNoTemplate: 3,
      cancelledUtilityDisabled: 1,
      utilitySentInWindow: 5,
      sentRows: [
        { follow_up_type: "read_receipt" },
        { follow_up_type: "best_time" },
        { follow_up_type: "read_receipt" },
      ],
    });

    expect(summary.pending.total).toBe(9);
    expect(summary.pending.dueNow).toBe(4);
    expect(summary.pending.readReceipt).toBe(2);
    expect(summary.utilityFailures.noApprovedTemplate).toBe(3);
    expect(summary.utilityFailures.disabledOutsideWindow).toBe(1);
    expect(summary.sent.total).toBe(3);
    expect(summary.sent.byType.read_receipt).toBe(2);
    expect(summary.sent.byType.best_time).toBe(1);
    expect(summary.sent.utilityTemplatesLastWindow).toBe(5);
  });

  test("counter helper falls back to default when query result has error", () => {
    const count = getCounterResultCount(
      { count: null, error: { message: "" } },
      7,
    );

    expect(count).toBe(7);
  });

  test("builds backfill records for old page conversations so AI can read context", () => {
    const records = buildBackfillConversationRecords({
      pageId: "page_1",
      conversations: [
        {
          id: "conv_old_1",
          unread_count: 0,
          participants: {
            data: [
              { id: "page_1", name: "Page" },
              { id: "user_1", name: "Old Contact" },
            ],
          },
          messages: {
            data: [
              {
                id: "msg_1",
                message: "Hi, available pa?",
                from: { id: "user_1", name: "Old Contact" },
                created_time: "2026-01-01T01:00:00.000Z",
              },
              {
                id: "msg_2",
                message: "Yes available po",
                from: { id: "page_1", name: "Page" },
                created_time: "2026-01-01T01:05:00.000Z",
              },
            ],
          },
        },
      ],
    });

    expect(records.conversations).toHaveLength(1);
    expect(records.messages).toHaveLength(2);
    expect(records.conversations[0].conversation_id).toBe("conv_old_1");
    expect(records.conversations[0].participant_id).toBe("user_1");
    expect(records.conversations[0].last_message_from_page).toBe(true);
    expect(records.messages[0].conversation_id).toBe("conv_old_1");
  });

  test("skips malformed backfill conversations without ids", () => {
    const records = buildBackfillConversationRecords({
      pageId: "page_1",
      conversations: [{ participants: { data: [] } }],
    });

    expect(records.conversations).toHaveLength(0);
    expect(records.messages).toHaveLength(0);
  });
});
