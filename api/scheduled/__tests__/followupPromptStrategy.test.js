import {
    rankPromptsByReplyPerformance,
    selectPromptForRealtimeStep
} from '../followupPromptStrategy.js';

describe('followupPromptStrategy', () => {
    test('ranks prompts by highest reply rate first', () => {
        const ranked = rankPromptsByReplyPerformance([
            { id: 'p1', prompt_text: 'Base prompt', total_sent: 10, total_replies: 5 },
            { id: 'p2', prompt_text: 'Top prompt', total_sent: 8, total_replies: 6 },
            { id: 'p3', prompt_text: 'Low prompt', total_sent: 20, total_replies: 2 }
        ]);

        expect(ranked.map((p) => p.id)).toEqual(['p2', 'p1', 'p3']);
        expect(ranked[0].replyRate).toBeCloseTo(0.75, 5);
    });

    test('step 1 uses highest-reply prompt as base', () => {
        const ranked = rankPromptsByReplyPerformance([
            { id: 'base', label: 'Best', prompt_text: 'Use social proof', total_sent: 12, total_replies: 9 },
            { id: 'second', label: 'Second', prompt_text: 'Use urgency', total_sent: 10, total_replies: 5 }
        ]);

        const selected = selectPromptForRealtimeStep(ranked, 1);
        expect(selected.selectedPrompt.id).toBe('base');
        expect(selected.selectionMode).toBe('base');
        expect(selected.followUpInstruction).toBe('Use social proof');
    });

    test('step 2 uses second-highest prompt', () => {
        const ranked = rankPromptsByReplyPerformance([
            { id: 'base', prompt_text: 'Base prompt', total_sent: 10, total_replies: 7 },
            { id: 'second', prompt_text: 'Second prompt', total_sent: 10, total_replies: 6 }
        ]);

        const selected = selectPromptForRealtimeStep(ranked, 2);
        expect(selected.selectedPrompt.id).toBe('second');
        expect(selected.selectionMode).toBe('runner-up');
        expect(selected.followUpInstruction).toBe('Second prompt');
    });

    test('step 3+ creates variation guidance from base winner', () => {
        const ranked = rankPromptsByReplyPerformance([
            { id: 'base', prompt_text: 'Champion prompt', total_sent: 12, total_replies: 10 },
            { id: 'second', prompt_text: 'Runner-up prompt', total_sent: 12, total_replies: 7 },
            { id: 'third', prompt_text: 'Alternative angle', total_sent: 12, total_replies: 5 }
        ]);

        const selected = selectPromptForRealtimeStep(ranked, 3);
        expect(selected.selectedPrompt.id).toBe('base');
        expect(selected.selectionMode).toBe('base-variation');
        expect(selected.followUpInstruction).toContain('Champion prompt');
        expect(selected.followUpInstruction).toContain('Runner-up prompt');
        expect(selected.followUpInstruction).toContain('step 3');
    });
});
