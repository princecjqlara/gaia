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
]);

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
