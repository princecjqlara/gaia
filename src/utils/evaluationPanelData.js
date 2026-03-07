function cleanQuestionList(rawQuestions) {
  if (!Array.isArray(rawQuestions)) {
    return [];
  }

  return rawQuestions
    .map((question) => `${question || ""}`.trim())
    .filter(Boolean);
}

function cleanAnswerList(rawAnswers) {
  if (!Array.isArray(rawAnswers)) {
    return [];
  }

  return rawAnswers.map((answer) => `${answer || ""}`.trim());
}

export function isMeaningfulEvaluationAnswer(answer) {
  const cleaned = `${answer || ""}`.trim();
  if (!cleaned) {
    return false;
  }

  return !/^\(?\s*no answer\s*\)?$/i.test(cleaned);
}

export function buildAnsweredEvaluationEntries(questions, answers) {
  const safeQuestions = cleanQuestionList(questions);
  const safeAnswers = cleanAnswerList(answers);

  return safeQuestions
    .map((question, index) => ({
      question,
      answer: safeAnswers[index] || "",
      questionNumber: index + 1,
    }))
    .filter((entry) => isMeaningfulEvaluationAnswer(entry.answer));
}

export function sanitizeEvaluationQuestionNumbers(answeredNumbers, totalQuestions) {
  if (!Array.isArray(answeredNumbers)) {
    return [];
  }

  const max = Number.isInteger(totalQuestions) ? totalQuestions : 0;
  const unique = new Set();
  for (const rawNumber of answeredNumbers) {
    const number = Number(rawNumber);
    if (Number.isInteger(number) && number >= 1 && number <= max) {
      unique.add(number);
    }
  }

  return Array.from(unique).sort((a, b) => a - b);
}

export function buildEvaluationMemoryAnswers(
  questions,
  answeredQuestionNumbers,
  answeredLabel = "Captured in chat",
) {
  const safeQuestions = cleanQuestionList(questions);
  const answeredSet = new Set(
    sanitizeEvaluationQuestionNumbers(answeredQuestionNumbers, safeQuestions.length),
  );

  return safeQuestions.map((_, index) =>
    answeredSet.has(index + 1) ? answeredLabel : "",
  );
}

export function resolveEvaluationPanelData({
  linkedQuestions,
  linkedAnswers,
  memoryQuestions,
  memoryAnswers,
  evaluationScore,
} = {}) {
  const safeLinkedQuestions = cleanQuestionList(linkedQuestions);
  const safeLinkedAnswers = cleanAnswerList(linkedAnswers);

  if (safeLinkedQuestions.length > 0) {
    return {
      questions: safeLinkedQuestions,
      answers: safeLinkedQuestions.map((_, index) => safeLinkedAnswers[index] || ""),
      emptyMessage: "",
    };
  }

  const safeMemoryQuestions = cleanQuestionList(memoryQuestions);
  const safeMemoryAnswers = cleanAnswerList(memoryAnswers);
  if (safeMemoryQuestions.length > 0) {
    return {
      questions: safeMemoryQuestions,
      answers: safeMemoryQuestions.map((_, index) => safeMemoryAnswers[index] || ""),
      emptyMessage: "",
    };
  }

  const score = Number(evaluationScore);
  if (Number.isFinite(score) && score > 0) {
    return {
      questions: [],
      answers: [],
      emptyMessage:
        "Evaluation is in progress from chat memory. Question list is not connected yet.",
    };
  }

  return {
    questions: [],
    answers: [],
    emptyMessage: "No evaluation questions answered yet.",
  };
}
