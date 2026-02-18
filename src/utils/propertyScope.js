export function resolvePropertyScopeId({ teamId, organizationId } = {}) {
  return `${teamId || ""}`.trim() || `${organizationId || ""}`.trim() || null;
}

export function applyScopeToPropertyQuery(query, { teamId, organizationId } = {}) {
  if (!query || typeof query.eq !== "function") {
    return query;
  }

  const cleanedTeamId = `${teamId || ""}`.trim();
  if (cleanedTeamId) {
    return query.eq("team_id", cleanedTeamId);
  }

  const cleanedOrganizationId = `${organizationId || ""}`.trim();
  if (cleanedOrganizationId) {
    return query.eq("organization_id", cleanedOrganizationId);
  }

  return query;
}

export function buildScopedPropertyPath(propertyId, { teamId, organizationId } = {}) {
  const cleanedPropertyId = `${propertyId || ""}`.trim();
  if (!cleanedPropertyId) {
    return "/property";
  }

  const scopeId = resolvePropertyScopeId({ teamId, organizationId });
  if (scopeId) {
    return `/${encodeURIComponent(scopeId)}/property/${encodeURIComponent(cleanedPropertyId)}`;
  }

  return `/property/${encodeURIComponent(cleanedPropertyId)}`;
}

export function buildScopedPropertyUrl({
  baseUrl,
  propertyId,
  participantId,
  teamId,
  organizationId,
} = {}) {
  const normalizedBase = `${baseUrl || ""}`.trim().replace(/\/$/, "");
  const path = buildScopedPropertyPath(propertyId, { teamId, organizationId });
  const pid = `${participantId || ""}`.trim();
  const query = pid ? `?pid=${encodeURIComponent(pid)}` : "";

  if (!normalizedBase) {
    return `${path}${query}`;
  }

  return `${normalizedBase}${path}${query}`;
}
