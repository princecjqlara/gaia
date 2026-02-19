function toFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function normalizePrompt(prompt, index) {
    const sentCount = Math.max(0, toFiniteNumber(prompt?.total_sent));
    const replyCount = Math.max(0, toFiniteNumber(prompt?.total_replies));
    const clampedReplies = Math.min(replyCount, sentCount || replyCount);
    const replyRate = sentCount > 0 ? clampedReplies / sentCount : 0;
    const bayesScore = (clampedReplies + 1) / (sentCount + 2);

    return {
        ...prompt,
        sentCount,
        replyCount: clampedReplies,
        replyRate,
        bayesScore,
        rankIndex: index
    };
}

export function rankPromptsByReplyPerformance(prompts = []) {
    if (!Array.isArray(prompts)) return [];

    return prompts
        .filter((prompt) => typeof prompt?.prompt_text === 'string' && prompt.prompt_text.trim().length > 0)
        .map((prompt, index) => normalizePrompt(prompt, index))
        .sort((a, b) => {
            if (b.replyRate !== a.replyRate) return b.replyRate - a.replyRate;
            if (b.replyCount !== a.replyCount) return b.replyCount - a.replyCount;
            if (b.sentCount !== a.sentCount) return b.sentCount - a.sentCount;
            if (b.bayesScore !== a.bayesScore) return b.bayesScore - a.bayesScore;
            return a.rankIndex - b.rankIndex;
        });
}

export function selectPromptForRealtimeStep(rankedPrompts = [], stepNumber = 1) {
    const safeStep = Math.max(1, Number.parseInt(stepNumber, 10) || 1);
    if (!Array.isArray(rankedPrompts) || rankedPrompts.length === 0) {
        return null;
    }

    const basePrompt = rankedPrompts[0];
    const secondaryPrompt = rankedPrompts[1] || null;

    if (safeStep === 1 || !secondaryPrompt) {
        return {
            selectedPrompt: basePrompt,
            followUpInstruction: basePrompt.prompt_text,
            selectionMode: 'base',
            variantLabel: basePrompt.label || 'base-winner',
            basePrompt,
            secondaryPrompt
        };
    }

    if (safeStep === 2) {
        return {
            selectedPrompt: secondaryPrompt,
            followUpInstruction: secondaryPrompt.prompt_text,
            selectionMode: 'runner-up',
            variantLabel: secondaryPrompt.label || 'runner-up',
            basePrompt,
            secondaryPrompt
        };
    }

    const additionalAngles = rankedPrompts
        .slice(2, 5)
        .map((prompt) => prompt.prompt_text?.trim())
        .filter(Boolean);

    const variationInstructions = [
        `Base winning prompt (highest reply rate): ${basePrompt.prompt_text}`,
        `Second-highest prompt angle: ${secondaryPrompt.prompt_text}`,
        `Create ONE fresh follow-up variation for step ${safeStep}.`,
        'Keep the base intent, but change hook/wording so it feels new and natural.'
    ];

    if (additionalAngles.length > 0) {
        variationInstructions.push('Optional extra high-performing angles to blend:');
        additionalAngles.forEach((angle, idx) => {
            variationInstructions.push(`${idx + 1}. ${angle}`);
        });
    }

    return {
        selectedPrompt: basePrompt,
        followUpInstruction: variationInstructions.join('\n'),
        selectionMode: 'base-variation',
        variantLabel: `base-variation-step-${safeStep}`,
        basePrompt,
        secondaryPrompt
    };
}
