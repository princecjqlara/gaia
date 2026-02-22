/**
 * Thompson Sampling-based prompt selection for follow-up messages.
 *
 * Instead of always picking the prompt with the highest observed reply rate
 * (pure greedy / Bayesian point-estimate), we draw a random sample from each
 * prompt's Beta(replies+1, sent-replies+1) posterior and pick the highest draw.
 * This naturally balances exploration (trying under-tested prompts) with
 * exploitation (favouring proven winners).
 */

function toFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

// ──────────────────────────────────────────────
// Beta-distribution sampling via Jöhnk's algorithm
// ──────────────────────────────────────────────
function gammaVariate(alpha) {
    // Marsaglia & Tsang's method for alpha >= 1
    // For alpha < 1 we use the Ahrens-Dieter boost
    if (alpha < 1) {
        return gammaVariate(alpha + 1) * Math.pow(Math.random(), 1 / alpha);
    }
    const d = alpha - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
        let x, v;
        do {
            x = randn();
            v = 1 + c * x;
        } while (v <= 0);
        v = v * v * v;
        const u = Math.random();
        if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
}

function randn() {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Draw a sample from Beta(alpha, beta).
 * Returns a value in [0, 1].
 */
export function betaSample(alpha, beta) {
    const a = Math.max(0.01, alpha);
    const b = Math.max(0.01, beta);
    const x = gammaVariate(a);
    const y = gammaVariate(b);
    return x / (x + y);
}

// ──────────────────────────────────────────────
// Thompson sample for a single prompt
// ──────────────────────────────────────────────
/**
 * Draw a Thompson sample for a prompt.
 * Uses Beta(replies + 1, failures + 1) as the posterior.
 * Returns a score in [0, 1].
 */
export function thompsonSample(prompt) {
    const sent = Math.max(0, toFiniteNumber(prompt?.total_sent));
    const replies = Math.min(Math.max(0, toFiniteNumber(prompt?.total_replies)), sent || 0);
    const failures = sent - replies;
    // Beta posterior: prior is Beta(1,1) = uniform
    return betaSample(replies + 1, failures + 1);
}

function normalizePrompt(prompt, index) {
    const sentCount = Math.max(0, toFiniteNumber(prompt?.total_sent));
    const replyCount = Math.max(0, toFiniteNumber(prompt?.total_replies));
    const clampedReplies = Math.min(replyCount, sentCount || replyCount);
    const replyRate = sentCount > 0 ? clampedReplies / sentCount : 0;
    // Thompson sample replaces static Bayesian score
    const thompsonScore = thompsonSample(prompt);

    return {
        ...prompt,
        sentCount,
        replyCount: clampedReplies,
        replyRate,
        thompsonScore,
        rankIndex: index
    };
}

/**
 * Rank prompts using Thompson sampling.
 *
 * Each call produces a *stochastic* ranking — prompts with few sends
 * will occasionally rank higher due to wide Beta posteriors, providing
 * natural exploration.
 */
export function rankPromptsByReplyPerformance(prompts = []) {
    if (!Array.isArray(prompts)) return [];

    return prompts
        .filter((prompt) => typeof prompt?.prompt_text === 'string' && prompt.prompt_text.trim().length > 0)
        .map((prompt, index) => normalizePrompt(prompt, index))
        .sort((a, b) => {
            // Primary: Thompson sample (stochastic)
            if (b.thompsonScore !== a.thompsonScore) return b.thompsonScore - a.thompsonScore;
            // Tiebreakers (rarely needed, samples almost never equal)
            if (b.replyRate !== a.replyRate) return b.replyRate - a.replyRate;
            if (b.replyCount !== a.replyCount) return b.replyCount - a.replyCount;
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
            selectionMode: 'thompson-winner',
            variantLabel: basePrompt.label || 'thompson-winner',
            basePrompt,
            secondaryPrompt
        };
    }

    if (safeStep === 2) {
        return {
            selectedPrompt: secondaryPrompt,
            followUpInstruction: secondaryPrompt.prompt_text,
            selectionMode: 'thompson-runner-up',
            variantLabel: secondaryPrompt.label || 'thompson-runner-up',
            basePrompt,
            secondaryPrompt
        };
    }

    const additionalAngles = rankedPrompts
        .slice(2, 5)
        .map((prompt) => prompt.prompt_text?.trim())
        .filter(Boolean);

    const variationInstructions = [
        `Base winning prompt (highest Thompson score): ${basePrompt.prompt_text}`,
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
        selectionMode: 'thompson-variation',
        variantLabel: `thompson-variation-step-${safeStep}`,
        basePrompt,
        secondaryPrompt
    };
}
