// NVIDIA AI Service for Gaia
// Uses server-side proxy to avoid CORS issues

const AI_PROXY_URL = '/api/ai/chat';

// Base chat completion (routed through server-side proxy)
export const nvidiaChat = async (messages, options = {}) => {
    try {
        const response = await fetch(AI_PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: options.model || 'nvidia/llama-3.1-nemotron-70b-instruct',
                messages,
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || 1024,
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('NVIDIA API error:', error);
            return null;
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
    } catch (error) {
        console.error('NVIDIA chat error:', error);
        return null;
    }
};

// Correct captions with AI
export const correctCaptions = async (text, language = 'en') => {
    const langName = language === 'fil-PH' ? 'Tagalog/Filipino' : 'English';

    const messages = [
        {
            role: 'system',
            content: `You are a caption correction assistant. Fix grammar, spelling, and punctuation in ${langName} speech transcriptions. Keep the meaning intact. Only return the corrected text, nothing else. If the text is already correct, return it as-is.`
        },
        {
            role: 'user',
            content: text
        }
    ];

    return await nvidiaChat(messages, { temperature: 0.3, maxTokens: 256 });
};

// Generate reply suggestions (Cluely-style)
export const generateReplySuggestions = async (conversation, context = {}) => {
    const messages = [
        {
            role: 'system',
            content: `You are a meeting assistant helping a sales/account manager. Based on the conversation, suggest 3 helpful replies they could use next. Consider: ${context.businessInfo || 'professional sales context'}. Format as JSON array of strings.`
        },
        {
            role: 'user',
            content: `Recent conversation:\n${conversation}\n\nSuggest 3 replies:`
        }
    ];

    const result = await nvidiaChat(messages, { temperature: 0.8, maxTokens: 512 });

    try {
        // Parse JSON array from response
        const match = result?.match(/\[[\s\S]*\]/);
        if (match) {
            return JSON.parse(match[0]);
        }
    } catch (e) {
        console.warn('Failed to parse suggestions:', e);
    }

    return [];
};

// Score conversation move (like chess: brilliant, great, good, inaccuracy, mistake, blunder)
export const scoreConversationMove = async (message, context, previousMoves = []) => {
    const messages = [
        {
            role: 'system',
            content: `You are a sales conversation coach. Analyze the user's message and rate it like a chess move:
- BRILLIANT: Exceptional insight, perfectly addresses objection, creates new opportunity
- GREAT: Strong response, builds rapport, moves toward goal
- GOOD: Solid, appropriate response
- INACCURACY: Missed opportunity or slightly off-target
- MISTAKE: Could harm the relationship or lose the sale
- BLUNDER: Major error that likely loses the deal

Respond with JSON: {"score": "GREAT", "reason": "brief explanation", "suggestion": "what could be better"}`
        },
        {
            role: 'user',
            content: `Context: ${context}\n\nMessage to analyze: "${message}"\n\nPrevious moves: ${previousMoves.slice(-3).join(' | ')}`
        }
    ];

    const result = await nvidiaChat(messages, { temperature: 0.5, maxTokens: 256 });

    try {
        const match = result?.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
    } catch (e) {
        console.warn('Failed to parse score:', e);
    }

    return { score: 'GOOD', reason: 'Analysis unavailable', suggestion: '' };
};

// Web search enhancement (placeholder - needs search API)
export const searchWeb = async (query) => {
    // TODO: Integrate with search API (Serper, Tavily, etc.)
    console.log('Web search requested for:', query);
    return [];
};

// RAG: Query documents for context
export const queryDocuments = async (query, documents = []) => {
    if (documents.length === 0) return '';

    // Simple keyword matching for now
    // TODO: Replace with proper vector search
    const relevant = documents.filter(doc =>
        doc.content.toLowerCase().includes(query.toLowerCase())
    );

    return relevant.map(d => d.content).join('\n\n').slice(0, 2000);
};

export default {
    nvidiaChat,
    correctCaptions,
    generateReplySuggestions,
    scoreConversationMove,
    searchWeb,
    queryDocuments
};
