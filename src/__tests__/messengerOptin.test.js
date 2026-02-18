import {
  buildNotificationOptinMessage,
  buildOptinFallbackText,
  isUnsupportedNotificationOptinError,
} from "../utils/messengerOptin";

describe("messengerOptin", () => {
  test("builds minimal notification message payload without unsupported keys", () => {
    const payload = buildNotificationOptinMessage({
      participantId: "psid_123",
      title: "Click below for updates",
    });

    expect(payload.recipient.id).toBe("psid_123");
    expect(payload.message.attachment.payload.template_type).toBe("notification_messages");
    expect(payload.message.attachment.payload.title).toBe("Click below for updates");
    expect(payload.message.attachment.payload.payload).toBe("MARKETING_OPTIN_PROPERTIES");
    expect(payload.message.attachment.payload).not.toHaveProperty("notification_messages_frequency");
    expect(payload.message.attachment.payload).not.toHaveProperty("notification_messages_reoptin");
    expect(payload.message.attachment.payload).not.toHaveProperty("notification_messages_timezone");
  });

  test("detects unsupported notification template schema errors", () => {
    const err = '{"error":{"message":"(#100) Invalid keys \"notification_messages_frequency\" were found in param \"name_placeholder\"."}}';
    expect(isUnsupportedNotificationOptinError(err)).toBe(true);
  });

  test("does not misclassify unrelated facebook errors", () => {
    const err = '{"error":{"message":"(#10) Permission denied"}}';
    expect(isUnsupportedNotificationOptinError(err)).toBe(false);
  });

  test("builds safe fallback text from hook content", () => {
    const fallback = buildOptinFallbackText("I saved a spot for you - tap below");
    expect(fallback).toContain("I saved a spot for you");
    expect(fallback.length).toBeGreaterThan(0);
  });

  test("truncates long opt-in title to supported length", () => {
    const payload = buildNotificationOptinMessage({
      participantId: "psid_123",
      title:
        "Click below po para ma-message kita pag may perfect match na! Saan located ang Carmona Estates?",
    });

    expect(payload.message.attachment.payload.title.length).toBeLessThanOrEqual(65);
  });

  test("detects title length payload errors", () => {
    const err = '{"error":{"message":"(#100) Title length exceeded the max limit. Please check developer doc for more information."}}';
    expect(isUnsupportedNotificationOptinError(err)).toBe(true);
  });
});
