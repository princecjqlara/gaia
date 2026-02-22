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

    test('step 1 uses thompson-winner selection mode', () => {
        const ranked = rankPromptsByReplyPerformance([
            { id: 'a', label: 'Winner', prompt_text: 'Use social proof', total_sent: 12, total_replies: 9 },
            { id: 'b', label: 'Second', prompt_text: 'Use urgency', total_sent: 10, total_replies: 5 }
        ]);

        const selected = selectPromptForRealtimeStep(ranked, 1);
        expect(selected.selectionMode).toBe('thompson-winner');
        expect(selected.followUpInstruction).toBeTruthy();
    });

    test('step 2 uses thompson-runner-up selection mode', () => {
        const ranked = rankPromptsByReplyPerformance([
            { id: 'a', prompt_text: 'Base prompt', total_sent: 10, total_replies: 7 },
            { id: 'b', prompt_text: 'Second prompt', total_sent: 10, total_replies: 6 }
        ]);

        const selected = selectPromptForRealtimeStep(ranked, 2);
        expect(selected.selectionMode).toBe('thompson-runner-up');
    });

    test('step 3+ creates thompson-variation', () => {
        const ranked = rankPromptsByReplyPerformance([
            { id: 'a', prompt_text: 'Champion prompt', total_sent: 12, total_replies: 10 },
            { id: 'b', prompt_text: 'Runner-up prompt', total_sent: 12, total_replies: 7 },
            { id: 'c', prompt_text: 'Alternative angle', total_sent: 12, total_replies: 5 }
        ]);

        const selected = selectPromptForRealtimeStep(ranked, 3);
        expect(selected.selectionMode).toBe('thompson-variation');
        expect(selected.followUpInstruction).toContain('step 3');
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
