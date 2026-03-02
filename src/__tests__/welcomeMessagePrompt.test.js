import {
  DEFAULT_WELCOME_BUTTON_LABEL,
  WELCOME_HOOK_ANGLES,
  buildWelcomeGenerationPrompt,
  parseWelcomeGenerationOutput,
  pickWelcomeHookAngle,
  sanitizeWelcomeButtonLabel,
} from "../utils/welcomeMessagePrompt";

describe("welcomeMessagePrompt", () => {
  test("builds clickbait prompt with a non-repeating angle", () => {
    const { prompt, angle } = buildWelcomeGenerationPrompt({
      firstName: "Prince",
      cityOrArea: "Quezon City",
      propertyInterest: "condo",
      budgetRange: "3M-5M",
      lastAngleUsed: "hidden listing",
      recentMessagesToAvoid: ["Kumusta! Old welcome message"],
      randomFn: () => 0,
    });

    expect(angle).not.toBe("hidden listing");
    expect(prompt).toContain("Generate ONE first-message auto-trigger for a brand-new contact.");
    expect(prompt).toContain("Do NOT mention or imply: consultation, booking, schedule, appointment, call, meeting.");
    expect(prompt).toContain("first_name: Prince");
    expect(prompt).toContain("city_or_area: Quezon City");
    expect(prompt).toContain("Use this hook angle for this run:");
  });

  test("sanitizes booking language from AI output", () => {
    const parsed = parseWelcomeGenerationOutput(
      "Message: Hi Prince! Let's book a consultation now.\nButton: Book Now\nAngle: hidden listing",
      "Prince",
    );

    expect(parsed.message).not.toMatch(/consultation|book/i);
    expect(parsed.button).toBe(DEFAULT_WELCOME_BUTTON_LABEL);
    expect(parsed.angle).toBe("hidden listing");
  });

  test("keeps non-booking button labels", () => {
    expect(sanitizeWelcomeButtonLabel("Show Hidden Picks")).toBe("Show Hidden Picks");
  });

  test("truncates long button labels to Messenger limit", () => {
    const label = sanitizeWelcomeButtonLabel("Show Me The Most Exclusive Hidden Picks Right Now");
    expect(label.length).toBeLessThanOrEqual(20);
  });

  test("pickWelcomeHookAngle avoids the previous angle", () => {
    const angle = pickWelcomeHookAngle("budget match alert", () => 0);
    expect(angle).not.toBe("budget match alert");
  });

  test("buildWelcomeGenerationPrompt includes custom welcome prompt instruction", () => {
    const { prompt } = buildWelcomeGenerationPrompt({
      firstName: "Mia",
      welcomePromptInstruction: "Sound premium and ask one short qualifying question.",
      randomFn: () => 0,
    });

    expect(prompt).toContain("Custom welcome prompt instruction");
    expect(prompt).toContain("Sound premium and ask one short qualifying question.");
  });

  test("pickWelcomeHookAngle explores under-tested angles first", () => {
    const angleStats = Object.fromEntries(
      WELCOME_HOOK_ANGLES.map((angle) => [angle, { sent: 5, replies: 2 }]),
    );
    angleStats["budget match alert"] = { sent: 0, replies: 0 };

    const angle = pickWelcomeHookAngle("", () => 0, angleStats);
    expect(angle).toBe("budget match alert");
  });
});
