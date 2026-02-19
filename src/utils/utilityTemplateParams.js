function sanitizeParamText(text, maxChars) {
  if (!text || typeof text !== "string") return "";

  let cleaned = text.replace(/[{}]/g, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  if (
    Number.isFinite(maxChars)
    && maxChars > 0
    && cleaned.length > maxChars
  ) {
    cleaned = cleaned.slice(0, maxChars).trim();
  }

  return cleaned;
}

function extractHeader(bodyText, maxHeaderChars) {
  if (!bodyText) return "Quick follow-up";

  const firstSentence = bodyText.split(/(?<=[.!?])\s+/)[0] || bodyText;
  let header = firstSentence.replace(/[.!?]+$/g, "").trim();

  if (!header) {
    header = bodyText;
  }

  if (
    Number.isFinite(maxHeaderChars)
    && maxHeaderChars > 0
    && header.length > maxHeaderChars
  ) {
    const truncated = header.slice(0, maxHeaderChars);
    const lastSpace = truncated.lastIndexOf(" ");
    header = (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated).trim();
  }

  return header || "Quick follow-up";
}

export function countTemplatePlaceholders(templateBody) {
  if (!templateBody || typeof templateBody !== "string") return 1;

  const matches = [...templateBody.matchAll(/{{(\d+)}}/g)];
  if (matches.length === 0) return 1;

  const highestIndex = Math.max(
    ...matches
      .map((match) => Number.parseInt(match[1], 10))
      .filter((value) => Number.isFinite(value) && value > 0),
  );

  return Number.isFinite(highestIndex) && highestIndex > 0 ? highestIndex : 1;
}

export function buildUtilityTemplateParameters({
  templateBody,
  messageText,
  maxBodyChars = 320,
  maxHeaderChars = 80,
} = {}) {
  const bodyText = sanitizeParamText(messageText, maxBodyChars);
  const headerText = extractHeader(bodyText, maxHeaderChars);
  const safeBody = bodyText || headerText;
  const placeholderCount = countTemplatePlaceholders(templateBody);

  if (placeholderCount <= 1) {
    return [safeBody];
  }

  const params = [];
  for (let index = 1; index <= placeholderCount; index += 1) {
    if (index === 1) {
      params.push(headerText);
    } else {
      params.push(safeBody);
    }
  }

  return params;
}
