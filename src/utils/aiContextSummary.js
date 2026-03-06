const EMPTY_VALUE_PATTERNS = [
  /^none\b/i,
  /^n\/?a\b/i,
  /^na\b/i,
  /^unknown\b/i,
  /^not\s+(?:mentioned|provided|specified|shared|available|clear|discussed|stated)\b/i,
  /^no\b/i,
  /^\(?\s*no answer\s*\)?$/i,
];

function stripMarkdownLine(line) {
  return `${line || ""}`
    .replace(/^\s*[-*•]+\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function normalizeWhitespace(value) {
  return `${value || ""}`.replace(/\s+/g, " ").trim();
}

export function isMeaningfulSummaryValue(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return false;
  return !EMPTY_VALUE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildFlexibleSummaryItems(rawSummary) {
  if (typeof rawSummary !== "string") {
    return [];
  }

  const lines = rawSummary
    .split(/\r?\n+/)
    .map(stripMarkdownLine)
    .map(normalizeWhitespace)
    .filter(Boolean);

  const items = [];
  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex > 0) {
      const label = normalizeWhitespace(line.slice(0, separatorIndex));
      const value = normalizeWhitespace(line.slice(separatorIndex + 1));
      if (!isMeaningfulSummaryValue(value)) {
        continue;
      }
      items.push(`${label}: ${value}`);
      continue;
    }

    if (isMeaningfulSummaryValue(line)) {
      items.push(line);
    }
  }

  return Array.from(new Set(items));
}
