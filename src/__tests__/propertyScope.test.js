import {
  applyScopeToPropertyQuery,
  buildScopedPropertyPath,
  buildScopedPropertyUrl,
  resolvePropertyScopeId,
} from "../utils/propertyScope";

describe("propertyScope", () => {
  test("prefers team scope over organization scope", () => {
    const scopeId = resolvePropertyScopeId({
      teamId: "team-123",
      organizationId: "org-456",
    });

    expect(scopeId).toBe("team-123");
  });

  test("applies team filter to property query", () => {
    const eqCalls = [];
    const query = {
      eq: (field, value) => {
        eqCalls.push([field, value]);
        return query;
      },
    };

    applyScopeToPropertyQuery(query, { teamId: "team-123" });

    expect(eqCalls).toEqual([["team_id", "team-123"]]);
  });

  test("applies organization filter when team is missing", () => {
    const eqCalls = [];
    const query = {
      eq: (field, value) => {
        eqCalls.push([field, value]);
        return query;
      },
    };

    applyScopeToPropertyQuery(query, { organizationId: "org-456" });

    expect(eqCalls).toEqual([["organization_id", "org-456"]]);
  });

  test("builds scoped property path", () => {
    const path = buildScopedPropertyPath("prop-1", {
      teamId: "team-123",
    });

    expect(path).toBe("/team-123/property/prop-1");
  });

  test("builds scoped property URL with participant id", () => {
    const url = buildScopedPropertyUrl({
      baseUrl: "https://gaia.test/",
      propertyId: "prop-1",
      participantId: "psid-999",
      teamId: "team-123",
    });

    expect(url).toBe("https://gaia.test/team-123/property/prop-1?pid=psid-999");
  });

  test("falls back to unscoped property path when scope missing", () => {
    const path = buildScopedPropertyPath("prop-1", {});
    expect(path).toBe("/property/prop-1");
  });
});
