const QUESTION_STOP_WORDS = new Set([
  "ano",
  "anong",
  "saan",
  "saang",
  "kailan",
  "po",
  "ba",
  "ang",
  "ng",
  "mga",
  "kayo",
  "ninyo",
  "niyo",
  "mo",
  "your",
  "what",
  "where",
  "when",
  "how",
  "or",
  "and",
  "priority",
  "prioritizing",
  "important",
]);

const CLARIFICATION_PATTERNS = [
  /what\s+do\s+you\s+mean/i,
  /ano\s+(ang|yung|yun|ibig\s+sabihin)/i,
  /paano\s+po/i,
  /di\s+ko\s+gets/i,
  /hindi\s+ko\s+gets/i,
  /can\s+you\s+clarify/i,
];

function normalizeEvalText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuestionKeywords(question) {
  return normalizeEvalText(question)
    .split(" ")
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 2 && !QUESTION_STOP_WORDS.has(token),
    );
}

function scoreQuestionMatch(question, message) {
  const normalizedQuestion = normalizeEvalText(question);
  const normalizedMessage = normalizeEvalText(message);

  if (!normalizedQuestion || !normalizedMessage) {
    return 0;
  }

  if (normalizedMessage.includes(normalizedQuestion)) {
    return 1;
  }

  const keywords = extractQuestionKeywords(question);
  if (keywords.length === 0) {
    return 0;
  }

  const matchedKeywords = keywords.filter((keyword) =>
    normalizedMessage.includes(keyword),
  ).length;

  return matchedKeywords / keywords.length;
}

function sanitizeAnsweredNumbers(answeredQuestionNumbers, totalQuestions) {
  if (!Array.isArray(answeredQuestionNumbers)) {
    return [];
  }

  const unique = new Set();
  for (const raw of answeredQuestionNumbers) {
    const number = Number(raw);
    if (
      Number.isInteger(number) &&
      number >= 1 &&
      number <= totalQuestions
    ) {
      unique.add(number);
    }
  }

  return Array.from(unique).sort((a, b) => a - b);
}

function getLatestCustomerReplyAfter(recentMessages, index) {
  if (index < 0) {
    return "";
  }

  for (let i = recentMessages.length - 1; i > index; i -= 1) {
    const message = recentMessages[i];
    if (!message?.is_from_page) {
      const normalized = normalizeEvalText(message?.message_text);
      if (normalized) {
        return `${message.message_text || ""}`.trim();
      }
    }
  }

  return "";
}

function isClarificationReply(replyText) {
  if (typeof replyText !== "string" || !replyText.trim()) {
    return false;
  }

  return CLARIFICATION_PATTERNS.some((pattern) => pattern.test(replyText));
}

function isLikelyDirectAnswer(questionText, replyText) {
  const normalizedReply = normalizeEvalText(replyText);
  if (!normalizedReply) {
    return false;
  }

  if (isClarificationReply(replyText)) {
    return false;
  }

  const replyTokens = normalizedReply.split(" ").filter(Boolean);
  if (replyTokens.length === 0) {
    return false;
  }

  const questionKeywords = extractQuestionKeywords(questionText);
  if (questionKeywords.length === 0) {
    return false;
  }

  const matchedCount = questionKeywords.filter((keyword) =>
    normalizedReply.includes(keyword),
  ).length;

  if (matchedCount === 0) {
    return false;
  }

  if (replyTokens.length === 1) {
    return true;
  }

  return normalizedReply.length <= 40 && replyTokens.length <= 5;
}

export function mergeAnsweredQuestionNumbers({
  totalQuestions,
  rememberedQuestionNumbers,
  aiAnsweredQuestionNumbers,
  keywordAnsweredQuestionNumbers,
} = {}) {
  const safeTotal = Number.isInteger(totalQuestions) ? totalQuestions : 0;
  const combined = [
    ...(Array.isArray(rememberedQuestionNumbers)
      ? rememberedQuestionNumbers
      : []),
    ...(Array.isArray(aiAnsweredQuestionNumbers)
      ? aiAnsweredQuestionNumbers
      : []),
    ...(Array.isArray(keywordAnsweredQuestionNumbers)
      ? keywordAnsweredQuestionNumbers
      : []),
  ];

  return sanitizeAnsweredNumbers(combined, safeTotal);
}

export function promoteLastAskedQuestionAsAnswered({
  evalQuestions,
  answeredQuestionNumbers,
  recentMessages,
} = {}) {
  const questionList = Array.isArray(evalQuestions)
    ? evalQuestions.filter((question) => normalizeEvalText(question))
    : [];
  const safeRecentMessages = Array.isArray(recentMessages)
    ? recentMessages
    : [];

  if (questionList.length === 0 || safeRecentMessages.length === 0) {
    return [];
  }

  const sanitizedAnswered = sanitizeAnsweredNumbers(
    answeredQuestionNumbers,
    questionList.length,
  );
  const answeredSet = new Set(sanitizedAnswered);

  const lastAiMessageIndex = findLastAiMessageIndex(safeRecentMessages);
  if (!hasCustomerReplyAfter(safeRecentMessages, lastAiMessageIndex)) {
    return sanitizedAnswered;
  }

  const lastAskedQuestionNumber = findLastAskedQuestionNumber(
    questionList,
    safeRecentMessages,
    lastAiMessageIndex,
  );

  if (!lastAskedQuestionNumber || answeredSet.has(lastAskedQuestionNumber)) {
    return sanitizedAnswered;
  }

  const latestCustomerReply = getLatestCustomerReplyAfter(
    safeRecentMessages,
    lastAiMessageIndex,
  );
  const lastQuestion = questionList[lastAskedQuestionNumber - 1] || "";

  if (!isLikelyDirectAnswer(lastQuestion, latestCustomerReply)) {
    return sanitizedAnswered;
  }

  answeredSet.add(lastAskedQuestionNumber);
  return Array.from(answeredSet).sort((a, b) => a - b);
}

function findLastAiMessageIndex(recentMessages) {
  for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
    if (recentMessages[i]?.is_from_page && recentMessages[i]?.message_text) {
      return i;
    }
  }
  return -1;
}

function hasCustomerReplyAfter(recentMessages, index) {
  if (index < 0) {
    return false;
  }

  for (let i = index + 1; i < recentMessages.length; i += 1) {
    const message = recentMessages[i];
    if (!message?.is_from_page && normalizeEvalText(message?.message_text)) {
      return true;
    }
  }

  return false;
}

function findLastAskedQuestionNumber(evalQuestions, recentMessages, lastAiMessageIndex) {
  if (lastAiMessageIndex < 0) {
    return null;
  }

  const aiMessage = recentMessages[lastAiMessageIndex]?.message_text || "";
  let bestScore = 0;
  let bestQuestionNumber = null;

  for (let i = 0; i < evalQuestions.length; i += 1) {
    const score = scoreQuestionMatch(evalQuestions[i], aiMessage);
    if (score > bestScore) {
      bestScore = score;
      bestQuestionNumber = i + 1;
    }
  }

  return bestScore >= 0.3 ? bestQuestionNumber : null;
}

export function getEvaluationQuestionPlan({
  evalQuestions,
  answeredQuestionNumbers,
  recentMessages,
} = {}) {
  const questionList = Array.isArray(evalQuestions)
    ? evalQuestions.filter((question) => normalizeEvalText(question))
    : [];
  const safeRecentMessages = Array.isArray(recentMessages) ? recentMessages : [];
  const answeredNumbers = sanitizeAnsweredNumbers(
    answeredQuestionNumbers,
    questionList.length,
  );
  const answeredSet = new Set(answeredNumbers);

  let nextQuestionNumber = null;
  for (let i = 1; i <= questionList.length; i += 1) {
    if (!answeredSet.has(i)) {
      nextQuestionNumber = i;
      break;
    }
  }

  const unansweredQuestionNumbers = [];
  for (let i = 1; i <= questionList.length; i += 1) {
    if (!answeredSet.has(i)) {
      unansweredQuestionNumbers.push(i);
    }
  }

  const lastAiMessageIndex = findLastAiMessageIndex(safeRecentMessages);
  const lastAskedQuestionNumber = findLastAskedQuestionNumber(
    questionList,
    safeRecentMessages,
    lastAiMessageIndex,
  );

  const shouldAskClarifyingFollowup =
    nextQuestionNumber !== null &&
    lastAskedQuestionNumber === nextQuestionNumber &&
    hasCustomerReplyAfter(safeRecentMessages, lastAiMessageIndex);

  return {
    answeredQuestionNumbers: answeredNumbers,
    unansweredQuestionNumbers,
    nextQuestionNumber,
    nextQuestion:
      nextQuestionNumber !== null
        ? questionList[nextQuestionNumber - 1]
        : null,
    lastAskedQuestionNumber,
    shouldAskClarifyingFollowup,
  };
}
