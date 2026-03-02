import {
    rankPromptsByReplyPerformance,
    selectPromptForRealtimeStep,
    thompsonSample,
    betaSample
} from '../utils/followupPromptStrategy.js';

describe('followupPromptStrategy — Thompson Sampling', () => {
    test('betaSample returns values between 0 and 1', () => {
        for (let i = 0; i < 50; i++) {
            const sample = betaSample(2, 5);
            expect(sample).toBeGreaterThanOrEqual(0);
            expect(sample).toBeLessThanOrEqual(1);
        }
    });

    test('thompsonSample returns values between 0 and 1', () => {
        const prompt = { total_sent: 10, total_replies: 7 };
        for (let i = 0; i < 30; i++) {
            const sample = thompsonSample(prompt);
            expect(sample).toBeGreaterThanOrEqual(0);
            expect(sample).toBeLessThanOrEqual(1);
        }
    });

    test('thompsonSample handles zero-send prompts (exploration)', () => {
        const newPrompt = { total_sent: 0, total_replies: 0 };
        const samples = Array.from({ length: 100 }, () => thompsonSample(newPrompt));
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        // Beta(1,1) = uniform, mean should be roughly 0.5
        expect(mean).toBeGreaterThan(0.2);
        expect(mean).toBeLessThan(0.8);
    });

    test('high-reply prompt tends to score higher than low-reply prompt', () => {
        const highReply = { total_sent: 50, total_replies: 45 };
        const lowReply = { total_sent: 50, total_replies: 5 };

        let highWins = 0;
        const trials = 200;
        for (let i = 0; i < trials; i++) {
            if (thompsonSample(highReply) > thompsonSample(lowReply)) {
                highWins++;
            }
        }
        // High-reply prompt should win majority of the time (>80%)
        expect(highWins / trials).toBeGreaterThan(0.80);
    });

    test('new untested prompt occasionally beats a moderate prompt (exploration)', () => {
        const moderate = { total_sent: 20, total_replies: 10 };
        const untested = { total_sent: 0, total_replies: 0 };

        let untestedWins = 0;
        const trials = 500;
        for (let i = 0; i < trials; i++) {
            if (thompsonSample(untested) > thompsonSample(moderate)) {
                untestedWins++;
            }
        }
        // Untested should win at least some of the time (exploration)
        expect(untestedWins).toBeGreaterThan(5);
        // But not most of the time
        expect(untestedWins / trials).toBeLessThan(0.8);
    });

    test('ranking is stochastic — same input can produce different orders', () => {
        const prompts = [
            { id: 'a', prompt_text: 'prompt A', total_sent: 10, total_replies: 5 },
            { id: 'b', prompt_text: 'prompt B', total_sent: 10, total_replies: 5 }
        ];

        const orderings = new Set();
        for (let i = 0; i < 50; i++) {
            const ranked = rankPromptsByReplyPerformance(prompts);
            orderings.add(ranked.map(p => p.id).join(','));
        }
        // With equal stats, we should see both orderings
        expect(orderings.size).toBe(2);
    });

    test('uses minimum exploration mode for under-tested prompts', () => {
        const selected = selectPromptForRealtimeStep([
            { id: 'a', label: 'Prompt A', prompt_text: 'A', sentCount: 7, thompsonScore: 0.9 },
            { id: 'b', label: 'Prompt B', prompt_text: 'B', sentCount: 1, thompsonScore: 0.2 }
        ], 4, { minExplorationSends: 2, randomFn: () => 0 });

        expect(selected.selectionMode).toBe('minimum-exploration');
        expect(selected.selectedPrompt.id).toBe('b');
    });

    test('ignores sequence step ordering once prompts are tested', () => {
        const ranked = [
            { id: 'a', label: 'Winner', prompt_text: 'Use social proof', sentCount: 12, thompsonScore: 0.7 },
            { id: 'b', label: 'Second', prompt_text: 'Use urgency', sentCount: 10, thompsonScore: 0.6 }
        ];

        const step1 = selectPromptForRealtimeStep(ranked, 1);
        const step5 = selectPromptForRealtimeStep(ranked, 5);
        expect(step1.selectionMode).toBe('thompson-live-pool');
        expect(step1.selectedPrompt.id).toBe('a');
        expect(step5.selectedPrompt.id).toBe('a');
    });

    test('filters out prompts with empty prompt_text', () => {
        const ranked = rankPromptsByReplyPerformance([
            { id: 'a', prompt_text: '', total_sent: 10, total_replies: 5 },
            { id: 'b', prompt_text: 'Valid prompt', total_sent: 5, total_replies: 3 }
        ]);

        expect(ranked.length).toBe(1);
        expect(ranked[0].id).toBe('b');
    });

    test('handles null and empty arrays gracefully', () => {
        expect(rankPromptsByReplyPerformance(null)).toEqual([]);
        expect(rankPromptsByReplyPerformance([])).toEqual([]);
        expect(selectPromptForRealtimeStep([], 1)).toBeNull();
    });
});
