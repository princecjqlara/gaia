import {
  getEvaluationQuestionPlan,
  mergeAnsweredQuestionNumbers,
  promoteLastAskedQuestionAsAnswered,
} from "../utils/evaluationQuestionFlow";

describe("evaluationQuestionFlow", () => {
  test("selects the next unanswered question", () => {
    const plan = getEvaluationQuestionPlan({
      evalQuestions: [
        "Ano po budget range ninyo?",
        "Saang location po kayo naghahanap?",
        "Kailan po timeline ng pagbili?",
      ],
      answeredQuestionNumbers: [1],
      recentMessages: [],
    });

    expect(plan.nextQuestionNumber).toBe(2);
    expect(plan.nextQuestion).toBe("Saang location po kayo naghahanap?");
    expect(plan.shouldAskClarifyingFollowup).toBe(false);
  });

  test("flags clarification when same unanswered question was already asked", () => {
    const plan = getEvaluationQuestionPlan({
      evalQuestions: [
        "Ano po budget range ninyo?",
        "Saang location po kayo naghahanap?",
      ],
      answeredQuestionNumbers: [1],
      recentMessages: [
        { is_from_page: true, message_text: "Saan area po kayo naghahanap?" },
        { is_from_page: false, message_text: "di ko sure" },
      ],
    });

    expect(plan.nextQuestionNumber).toBe(2);
    expect(plan.lastAskedQuestionNumber).toBe(2);
    expect(plan.shouldAskClarifyingFollowup).toBe(true);
  });

  test("does not force clarification when next question has not been asked yet", () => {
    const plan = getEvaluationQuestionPlan({
      evalQuestions: [
        "Ano po budget range ninyo?",
        "Saang location po kayo naghahanap?",
      ],
      answeredQuestionNumbers: [1],
      recentMessages: [
        { is_from_page: true, message_text: "Ano po budget range ninyo?" },
        { is_from_page: false, message_text: "3M to 4M" },
      ],
    });

    expect(plan.nextQuestionNumber).toBe(2);
    expect(plan.lastAskedQuestionNumber).toBe(1);
    expect(plan.shouldAskClarifyingFollowup).toBe(false);
  });

  test("merges remembered, ai, and keyword answered question numbers", () => {
    const merged = mergeAnsweredQuestionNumbers({
      totalQuestions: 5,
      rememberedQuestionNumbers: [1, 2],
      aiAnsweredQuestionNumbers: [2, 4],
      keywordAnsweredQuestionNumbers: [3],
    });

    expect(merged).toEqual([1, 2, 3, 4]);
  });

  test("promotes last asked location-priority question when reply is short direct answer", () => {
    const promoted = promoteLastAskedQuestionAsAnswered({
      evalQuestions: [
        "Are you prioritizing space, budget, or location?",
        "Anong feature po ang hinahanap ninyo?",
      ],
      answeredQuestionNumbers: [],
      recentMessages: [
        { is_from_page: true, message_text: "Are you prioritizing space, budget, or location?" },
        { is_from_page: false, message_text: "Location" },
      ],
    });

    expect(promoted).toEqual([1]);
  });

  test("does not promote last asked question for clarification-type reply", () => {
    const promoted = promoteLastAskedQuestionAsAnswered({
      evalQuestions: [
        "Anong feature po ang hinahanap ninyo sa bahay?",
      ],
      answeredQuestionNumbers: [],
      recentMessages: [
        { is_from_page: true, message_text: "Anong feature po ang hinahanap ninyo sa bahay?" },
        { is_from_page: false, message_text: "What do you mean feature?" },
      ],
    });

    expect(promoted).toEqual([]);
  });
});
