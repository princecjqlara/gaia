const PLACEHOLDER_CONTACT_NAMES = new Set([
  "unknown",
  "customer",
  "friend",
  "lead",
  "not provided",
  "n/a",
  "na",
]);

function cleanName(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

export function needsParticipantNameLookup(name) {
  const cleaned = cleanName(name);
  if (!cleaned) {
    return true;
  }

  return PLACEHOLDER_CONTACT_NAMES.has(cleaned.toLowerCase());
}

export function resolveParticipantName({
  currentName,
  eventName,
  graphName,
  extractedName,
  fallback = "Customer",
} = {}) {
  const cleanedCurrentName = cleanName(currentName);
  if (!needsParticipantNameLookup(cleanedCurrentName)) {
    return cleanedCurrentName;
  }

  const candidates = [eventName, graphName, extractedName];
  for (const candidate of candidates) {
    const cleaned = cleanName(candidate);
    if (!needsParticipantNameLookup(cleaned)) {
      return cleaned;
    }
  }

  return cleanName(fallback) || "Customer";
}

export function getDisplayContactName(participantName, firstNameResolver) {
  const cleaned = cleanName(participantName);
  if (needsParticipantNameLookup(cleaned)) {
    return "";
  }

  if (typeof firstNameResolver === "function") {
    const firstName = cleanName(firstNameResolver(cleaned));
    if (!needsParticipantNameLookup(firstName)) {
      return firstName;
    }
  }

  return cleaned;
}
