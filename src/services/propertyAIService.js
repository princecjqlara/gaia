// Property AI Service for Gaia
// Provides property matching and Q&A capabilities using NVIDIA AI
// Uses server-side proxy to avoid CORS issues

const nvidiaChat = async (messages, options = {}) => {
    try {
        const response = await fetch('/api/webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'ai_chat',
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

export const queryProperties = async (question, properties = []) => {
    if (properties.length === 0) {
        return "I don't have any properties in the database to answer your question.";
    }

    const propertiesContext = properties.slice(0, 20).map(p => ({
        title: p.title,
        type: p.type,
        status: p.status,
        address: p.address,
        price: p.price,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        floorArea: p.floorArea,
        lotArea: p.lotArea,
        description: p.description?.substring(0, 200)
    }));

    const messages = [
        {
            role: 'system',
            content: `You are a real estate assistant with knowledge of the property portfolio. Answer questions about properties accurately and professionally. When referring to prices, format them as "₱X,XXX,XXX". Use the property data provided to answer questions. If you don't have enough information to answer a specific question, say so politely.

Property Portfolio:
${JSON.stringify(propertiesContext, null, 2)}`
        },
        {
            role: 'user',
            content: question
        }
    ];

    return await nvidiaChat(messages, { temperature: 0.5, maxTokens: 1024 });
};

export const matchProperties = async (criteria, properties = []) => {
    if (properties.length === 0) {
        return { matches: [], reason: 'No properties available for matching.' };
    }

    const prompt = `
Given the following buyer preferences and property portfolio, find the best matching properties.

Buyer Preferences:
${JSON.stringify(criteria, null, 2)}

Available Properties:
${JSON.stringify(properties.map(p => ({
        id: p.id,
        title: p.title,
        type: p.type,
        status: p.status,
        address: p.address,
        price: p.price,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        floorArea: p.floorArea,
        lotArea: p.lotArea
    })), null, 2)}

Return a JSON response with this structure:
{
    "matches": ["property_id_1", "property_id_2", "property_id_3"],
    "reason": "Brief explanation of why these properties match"
}

Consider:
- Price range matching
- Property type matching
- Location preferences
- Size requirements (bedrooms, floor area)
- Any other specified criteria

Only return matching property IDs that are available (not Sold).
`;

    const messages = [
        {
            role: 'system',
            content: 'You are a real estate matching assistant. Always respond with valid JSON only. No extra text outside the JSON object.'
        },
        {
            role: 'user',
            content: prompt
        }
    ];

    const response = await nvidiaChat(messages, { temperature: 0.3, maxTokens: 512 });

    if (response) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const matchedProperties = parsed.matches
                    .map(id => properties.find(p => p.id === id))
                    .filter(p => p !== undefined);
                return {
                    matches: matchedProperties,
                    reason: parsed.reason || 'These properties match your criteria.'
                };
            }
        } catch (e) {
            console.warn('Failed to parse property match response:', e);
        }
    }

    return { matches: [], reason: 'Could not find matching properties.' };
};

export const getPropertyInsights = async (property, allProperties = []) => {
    if (!property) {
        return 'No property selected.';
    }

    const comparableProperties = allProperties
        .filter(p => p.id !== property.id && p.type === property.type)
        .slice(0, 5);

    const messages = [
        {
            role: 'system',
            content: 'You are a real estate analyst. Provide professional, insightful analysis of properties.'
        },
        {
            role: 'user',
            content: `
Analyze this property and provide insights:

Property:
${JSON.stringify({
                title: property.title,
                type: property.type,
                status: property.status,
                address: property.address,
                price: property.price,
                bedrooms: property.bedrooms,
                bathrooms: property.bathrooms,
                floorArea: property.floorArea,
                lotArea: property.lotArea,
                description: property.description?.substring(0, 300)
            }, null, 2)}

Comparable Properties:
${JSON.stringify(comparableProperties.map(p => ({
                title: p.title,
                price: p.price,
                bedrooms: p.bedrooms,
                floorArea: p.floorArea
            })), null, 2)}

Provide insights on:
1. Price competitiveness
2. Key selling points
3. Target market
4. Recommendations for marketing
`
        }
    ];

    return await nvidiaChat(messages, { temperature: 0.6, maxTokens: 1024 });
};

export const generatePropertyDescription = async (propertyData) => {
    const messages = [
        {
            role: 'system',
            content: 'You are a professional real estate copywriter. Write compelling, engaging property descriptions that highlight key features and create emotional appeal. Use clear, descriptive language.'
        },
        {
            role: 'user',
            content: `
Write a professional property description for the following property:

${JSON.stringify(propertyData, null, 2)}

Requirements:
- Start with an attention-grabbing opening
- Highlight key features (bedrooms, bathrooms, size, amenities)
- Create emotional appeal
- End with a call to action
- Keep it under 300 words
- Be welcoming and professional
`
        }
    ];

    return await nvidiaChat(messages, { temperature: 0.8, maxTokens: 512 });
};

export default {
    queryProperties,
    matchProperties,
    getPropertyInsights,
    generatePropertyDescription
};
