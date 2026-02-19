import {
  buildUtilityTemplateParameters,
  countTemplatePlaceholders,
} from "../utils/utilityTemplateParams";

describe("utilityTemplateParams", () => {
  test("counts two placeholders in strict utility format", () => {
    const templateBody = "{{1}} — Message from {page name} support team. {{2}}";
    expect(countTemplatePlaceholders(templateBody)).toBe(2);
  });

  test("defaults to one placeholder when template has none", () => {
    expect(countTemplatePlaceholders("Quick follow-up message")).toBe(1);
  });

  test("builds header + body parameters for two-placeholder templates", () => {
    const params = buildUtilityTemplateParameters({
      templateBody: "{{1}} — Message from {page name} support team. {{2}}",
      messageText: "Following up about your property inquiry. Reply anytime and we can continue.",
    });

    expect(params).toEqual([
      "Following up about your property inquiry",
      "Following up about your property inquiry. Reply anytime and we can continue.",
    ]);
  });

  test("builds single parameter for one-placeholder templates", () => {
    const params = buildUtilityTemplateParameters({
      templateBody: "Quick update: {{1}}",
      messageText: "Thanks for your time today.",
    });

    expect(params).toEqual(["Thanks for your time today."]);
  });
});
