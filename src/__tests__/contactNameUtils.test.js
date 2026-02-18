import {
  getDisplayContactName,
  needsParticipantNameLookup,
  resolveParticipantName,
} from "../utils/contactNameUtils";

describe("contactNameUtils", () => {
  test("flags placeholders for lookup", () => {
    expect(needsParticipantNameLookup("")).toBe(true);
    expect(needsParticipantNameLookup("Unknown")).toBe(true);
    expect(needsParticipantNameLookup("Customer")).toBe(true);
    expect(needsParticipantNameLookup("CUSTOMER")).toBe(true);
    expect(needsParticipantNameLookup("Lead")).toBe(true);
    expect(needsParticipantNameLookup("Prince Lara")).toBe(false);
  });

  test("prefers extracted name when current is placeholder", () => {
    const name = resolveParticipantName({
      currentName: "Customer",
      eventName: "",
      graphName: "",
      extractedName: "Prince",
    });

    expect(name).toBe("Prince");
  });

  test("returns fallback when no valid name found", () => {
    const name = resolveParticipantName({
      currentName: "Customer",
      eventName: "Unknown",
      graphName: "",
      extractedName: "",
    });

    expect(name).toBe("Customer");
  });

  test("builds display name from first-name resolver", () => {
    const displayName = getDisplayContactName("Prince CJ Lara", (name) => name.split(" ")[0]);
    expect(displayName).toBe("Prince");
  });

  test("returns blank display name for placeholders", () => {
    expect(getDisplayContactName("Customer")).toBe("");
  });
});
