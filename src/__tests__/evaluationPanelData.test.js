import {
  buildEvaluationMemoryAnswers,
  resolveEvaluationPanelData,
  sanitizeEvaluationQuestionNumbers,
} from "../utils/evaluationPanelData";

describe("evaluationPanelData", () => {
  test("uses linked client questions and answers when available", () => {
    const data = resolveEvaluationPanelData({
      linkedQuestions: ["Budget?", "Location?"],
      linkedAnswers: ["3M-4M", "Carmona"],
      memoryQuestions: ["Fallback question"],
      memoryAnswers: ["Fallback answer"],
      evaluationScore: 26,
    });

    expect(data.questions).toEqual(["Budget?", "Location?"]);
    expect(data.answers).toEqual(["3M-4M", "Carmona"]);
    expect(data.emptyMessage).toBe("");
  });

  test("falls back to conversation memory questions when linked data is missing", () => {
    const data = resolveEvaluationPanelData({
      linkedQuestions: [],
      linkedAnswers: [],
      memoryQuestions: ["Budget?", "Location?"],
      memoryAnswers: ["Captured in chat", "Captured in chat"],
      evaluationScore: 26,
    });

    expect(data.questions).toEqual(["Budget?", "Location?"]);
    expect(data.answers).toEqual(["Captured in chat", "Captured in chat"]);
    expect(data.emptyMessage).toBe("");
  });

  test("shows connected-memory message when score exists but no questions loaded", () => {
    const data = resolveEvaluationPanelData({
      linkedQuestions: [],
      linkedAnswers: [],
      memoryQuestions: [],
      memoryAnswers: [],
      evaluationScore: 26,
    });

    expect(data.questions).toEqual([]);
    expect(data.answers).toEqual([]);
    expect(data.emptyMessage).toMatch(/evaluation is in progress/i);
  });

  test("sanitizes answered question numbers against question count", () => {
    const sanitized = sanitizeEvaluationQuestionNumbers([1, "2", 2, 7, 0, -1], 3);
    expect(sanitized).toEqual([1, 2]);
  });

  test("builds memory answers from answered indices", () => {
    const answers = buildEvaluationMemoryAnswers(
      ["Budget?", "Location?", "Timeline?"],
      [1, 3],
    );

    expect(answers).toEqual(["Captured in chat", "", "Captured in chat"]);
  });
});
