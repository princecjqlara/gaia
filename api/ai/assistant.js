import { createClient } from '@supabase/supabase-js';

let supabase = null;
function getSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        if (!url || !key) {
            console.error('[AI Assistant] Supabase not configured:', { url: !!url, key: !!key });
            return null;
        }
        supabase = createClient(url, key);
    }
    return supabase;
}

/**
 * AI Assistant API - Admin Only
 * Processes queries with full database context
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // TEST CHAT MODE: Test AI chatbot without sending to Facebook
        if (req.body?.mode === 'test_chat') {
            const { message, conversation_history, config } = req.body;
            if (!message) return res.status(400).json({ error: 'Message is required' });

            const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
            if (!NVIDIA_API_KEY) return res.status(500).json({ error: 'AI API key not configured' });

            const systemPrompt = config?.system_prompt || 'You are a friendly AI sales assistant for a business. Be helpful, professional, and concise.';
            const knowledgeBase = config?.knowledge_base || '';
            const language = config?.language || 'Taglish';
            const faqContent = config?.faq || '';

            let aiPrompt = `## Role\n${systemPrompt}\n\n## 🗣️ LANGUAGE\nYou MUST respond in ${language}.\n\n## Platform: Facebook Messenger (TEST MODE)\nContact Name: Test User\n`;

            if (knowledgeBase) aiPrompt += `\n## 📚 Knowledge Base\n${knowledgeBase}\n`;
            if (faqContent) aiPrompt += `\n## ❓ FAQ\n${faqContent}\n`;
            if (config?.bot_rules_dos) aiPrompt += `\n## ✅ DO's\n${config.bot_rules_dos}\n`;
            if (config?.bot_rules_donts) aiPrompt += `\n## ❌ DON'Ts\n${config.bot_rules_donts}\n`;
            if (config?.booking_url) aiPrompt += `\n## 📅 Booking Link\n${config.booking_url}\nShare this when relevant.\n`;

            aiPrompt += `\n## RULES\n- Customer name: "Test User"\n- Split responses with ||| (1-2 sentences per part, like texting)\n- This is a TEST conversation — respond naturally as you would to a real customer.\n`;

            const aiMessages = [{ role: 'system', content: aiPrompt }];
            if (conversation_history && Array.isArray(conversation_history)) {
                for (const msg of conversation_history) {
                    aiMessages.push({ role: msg.role, content: msg.content });
                }
            }
            aiMessages.push({ role: 'user', content: message });

            const aiResp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NVIDIA_API_KEY}` },
                body: JSON.stringify({ model: 'meta/llama-3.1-70b-instruct', messages: aiMessages, max_tokens: 400, temperature: 0.7 }),
            });

            if (!aiResp.ok) {
                const errData = await aiResp.json().catch(() => ({}));
                return res.status(500).json({ error: `AI API error: ${errData.error?.message || aiResp.status}` });
            }

            const aiData = await aiResp.json();
            const reply = aiData.choices?.[0]?.message?.content || 'No response generated';
            return res.status(200).json({ reply, model: 'meta/llama-3.1-70b-instruct' });
        }

        // NORMAL ASSISTANT MODE
        const { message, context, conversationHistory } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Sanitize context - remove any image fields to prevent API errors
        const sanitizedContext = context ? {
            summary: context.summary,
            clients: (context.clients || []).map(c => ({
                id: c.id,
                client_name: c.client_name || c.clientName,
                clientName: c.clientName,
                business_name: c.business_name || c.businessName,
                businessName: c.businessName,
                email: c.email,
                phone: c.phone,
                status: c.status,
                pipeline_status: c.pipeline_status || c.pipelineStatus,
                pipelineStatus: c.pipelineStatus,
                niche: c.niche
            })),
            conversations: (context.conversations || []).map(c => ({
                id: c.id,
                participant_name: c.participant_name,
                last_message_text: c.last_message_text,
                unread_count: c.unread_count
            })),
            users: context.users,
            properties: (context.properties || []).map(p => ({
                id: p.id,
                title: p.title,
                type: p.type,
                status: p.status,
                address: p.address,
                price: p.price,
                bedrooms: p.bedrooms,
                bathrooms: p.bathrooms,
                floorArea: p.floor_area,
                lotArea: p.lot_area,
                description: p.description
            })),
            bookings: context.bookings,
            events: context.events
        } : null;

        // Try to use OpenAI if available
        if (process.env.OPENAI_API_KEY) {
            const aiResponse = await callOpenAI(message, sanitizedContext, conversationHistory);
            return res.status(200).json({ response: aiResponse, actionPerformed: false });
        }

        // Fallback to local processing
        const response = processQuery(message, sanitizedContext);
        return res.status(200).json({ response, actionPerformed: false });

    } catch (error) {
        console.error('AI Assistant error:', error);
        return res.status(500).json({ error: error.message });
    }
}

async function callOpenAI(message, context, history) {
    const systemPrompt = `You are an AI assistant for a business management platform called Gaia. You have access to the following data:

SUMMARY:
- Total Clients: ${context?.summary?.totalClients || 0}
- Total Conversations: ${context?.summary?.totalConversations || 0}
- Total Bookings: ${context?.summary?.totalBookings || 0}
- Total Team Members: ${context?.summary?.totalUsers || 0}
- Total Properties: ${context?.summary?.totalProperties || 0}
- Total Events: ${context?.summary?.totalEvents || 0}

RECENT CLIENTS (up to 10):
${(context?.clients || []).slice(0, 10).map(c =>
        `- ${c.client_name || c.clientName || 'Unknown'}: ${c.business_name || c.businessName || 'N/A'} | ${c.email || 'No email'}`
    ).join('\n') || 'No clients'}

RECENT CONVERSATIONS (up to 10):
${(context?.conversations || []).slice(0, 10).map(c =>
        `- ${c.participant_name || 'Unknown'}: "${(c.last_message_text || '').substring(0, 50)}..."`
    ).join('\n') || 'No conversations'}

TEAM MEMBERS:
${(context?.users || []).map(u =>
        `- ${u.name || u.email} (${u.role || 'member'})`
    ).join('\n') || 'No team members'}

Be helpful, concise, and friendly. Format responses with bullet points when listing items.`;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...(history || []).map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            max_tokens: 500,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        throw new Error('OpenAI API error');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

function processQuery(message, context) {
    const q = message.toLowerCase();

    if (!context) {
        return "I'm still loading the data. Please wait a moment and try again.";
    }

    // Stats queries
    if (q.includes('how many') || q.includes('total') || q.includes('count') || q.includes('stats') || q.includes('summary')) {
        if (q.includes('client')) {
            return `You have **${context.summary.totalClients}** clients in your database.`;
        }
        if (q.includes('conversation') || q.includes('message')) {
            return `You have **${context.summary.totalConversations}** conversations in your inbox.`;
        }
        if (q.includes('booking')) {
            return `You have **${context.summary.totalBookings}** bookings recorded.`;
        }
        if (q.includes('user') || q.includes('team') || q.includes('member')) {
            return `You have **${context.summary.totalUsers}** team members.`;
        }
        if (q.includes('property') || q.includes('properties')) {
            return `You have **${context.summary.totalProperties || 0}** properties listed.`;
        }
        if (q.includes('event')) {
            return `You have **${context.summary.totalEvents}** events scheduled.`;
        }

        return `📊 **Business Summary**

• **${context.summary.totalClients}** clients
• **${context.summary.totalConversations}** conversations  
• **${context.summary.totalBookings}** bookings
• **${context.summary.totalUsers}** team members
• **${context.summary.totalProperties || 0}** properties
• **${context.summary.totalEvents}** events`;
    }

    // List queries
    if (q.includes('list') || q.includes('show') || q.includes('all')) {
        if (q.includes('client')) {
            const clientList = context.clients.slice(0, 10).map(c =>
                `• **${c.client_name || c.clientName || 'Unknown'}** - ${c.business_name || c.businessName || 'N/A'}`
            ).join('\n');
            return `👥 **Recent Clients:**\n${clientList}${context.clients.length > 10 ? `\n\n...and ${context.clients.length - 10} more` : ''}`;
        }
        if (q.includes('conversation')) {
            const convList = context.conversations.slice(0, 10).map(c =>
                `• **${c.participant_name || 'Unknown'}** - "${(c.last_message_text || 'No message').substring(0, 40)}..."`
            ).join('\n');
            return `💬 **Recent Conversations:**\n${convList}${context.conversations.length > 10 ? `\n\n...and ${context.conversations.length - 10} more` : ''}`;
        }
        if (q.includes('user') || q.includes('team')) {
            const userList = context.users.map(u =>
                `• **${u.name || u.email}** (${u.role || 'member'})`
            ).join('\n');
            return `👤 **Team Members:**\n${userList}`;
        }
    }

    // Search queries
    if (q.includes('find') || q.includes('search') || q.includes('where is') || q.includes('who is')) {
        const searchTerms = q.replace(/find|search|where is|who is|the|client|named|called/gi, '').trim().split(' ');
        const searchTerm = searchTerms.filter(t => t.length > 2).join(' ').toLowerCase();

        if (searchTerm) {
            const matchingClients = context.clients.filter(c =>
                (c.client_name || c.clientName || '').toLowerCase().includes(searchTerm) ||
                (c.business_name || c.businessName || '').toLowerCase().includes(searchTerm) ||
                (c.email || '').toLowerCase().includes(searchTerm)
            );

            if (matchingClients.length > 0) {
                const results = matchingClients.slice(0, 5).map(c =>
                    `• **${c.client_name || c.clientName}** - ${c.business_name || c.businessName || 'No business'}\n  📧 ${c.email || 'No email'} | 📱 ${c.phone || 'No phone'}`
                ).join('\n');
                return `🔍 Found **${matchingClients.length}** matching client(s):\n\n${results}`;
            }

            const matchingConvs = context.conversations.filter(c =>
                (c.participant_name || '').toLowerCase().includes(searchTerm)
            );

            if (matchingConvs.length > 0) {
                const results = matchingConvs.slice(0, 5).map(c =>
                    `• **${c.participant_name}** - "${(c.last_message_text || 'No message').substring(0, 40)}..."`
                ).join('\n');
                return `🔍 Found **${matchingConvs.length}** matching conversation(s):\n\n${results}`;
            }

            return `❌ No results found for "${searchTerm}". Try a different search term.`;
        }
    }

    // Recent activity
    if (q.includes('recent') || q.includes('latest') || q.includes('new') || q.includes('last')) {
        if (q.includes('booking')) {
            const recent = context.bookings.slice(0, 5).map(b =>
                `• **${b.client_name || 'Unknown'}** - ${new Date(b.booking_date || b.created_at).toLocaleDateString()}`
            ).join('\n');
            return `📅 **Recent Bookings:**\n${recent || 'No bookings found'}`;
        }
        if (q.includes('conversation') || q.includes('message')) {
            const recent = context.conversations.slice(0, 5).map(c =>
                `• **${c.participant_name || 'Unknown'}** - "${(c.last_message_text || 'No message').substring(0, 40)}..."`
            ).join('\n');
            return `💬 **Recent Conversations:**\n${recent || 'No conversations found'}`;
        }
        if (q.includes('client')) {
            const recent = context.clients.slice(0, 5).map(c =>
                `• **${c.client_name || c.clientName || 'Unknown'}** - ${c.business_name || c.businessName || 'N/A'}`
            ).join('\n');
            return `👥 **Recent Clients:**\n${recent || 'No clients found'}`;
        }
    }

    // Help
    if (q.includes('help') || q.includes('what can you do')) {
        return `🤖 **AI Assistant Commands:**

**📊 Statistics:**
• "How many clients do I have?"
• "Show me a summary"
• "Total bookings"

**📋 Lists:**
• "List all clients"
• "Show team members"
• "All conversations"

**🔍 Search:**
• "Find client named John"
• "Search for ABC Company"

**📅 Recent Activity:**
• "Recent bookings"
• "Latest conversations"
• "New clients"

Just ask naturally and I'll help!`;
    }

    // Default response
    return `I can help you with:

• 📊 **Stats**: "How many clients?" or "Summary"
• 📋 **Lists**: "Show all clients" or "Team members"
• 🔍 **Search**: "Find client named..."
• 📅 **Recent**: "Recent bookings"

What would you like to know?`;
}

