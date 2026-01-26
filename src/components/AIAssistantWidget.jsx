import React, { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '../services/supabase';

/**
 * AI Assistant Widget - Admin Only
 * Floating chat widget with access to all database data
 */
const AIAssistantWidget = ({ currentUser }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hello! I\'m your AI assistant. I have access to all your business data including clients, conversations, bookings, and more. How can I help you today?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [context, setContext] = useState(null);
    const messagesEndRef = useRef(null);

    // Check if user is admin
    const isAdmin = currentUser?.email === 'admin@gaia.com' ||
        currentUser?.role === 'admin' ||
        currentUser?.user_metadata?.role === 'admin';

    // Don't render for non-admin users
    if (!isAdmin) return null;

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Load context data on mount
    useEffect(() => {
        if (isOpen && !context) {
            loadContextData();
        }
    }, [isOpen]);

    const loadContextData = async () => {
        try {
            const supabase = getSupabaseClient();

            // Load all relevant data for context
            const [
                { data: clients },
                { data: conversations },
                { data: bookings },
                { data: users },
                { data: packages },
                { data: events }
            ] = await Promise.all([
                supabase.from('clients').select('*').limit(100),
                supabase.from('facebook_conversations').select('*').limit(100),
                supabase.from('bookings').select('*').limit(100),
                supabase.from('users').select('id, name, email, role').limit(50),
                supabase.from('packages').select('*').limit(50),
                supabase.from('events').select('*').limit(100)
            ]);

            setContext({
                clients: clients || [],
                conversations: conversations || [],
                bookings: bookings || [],
                users: users || [],
                packages: packages || [],
                events: events || [],
                summary: {
                    totalClients: clients?.length || 0,
                    totalConversations: conversations?.length || 0,
                    totalBookings: bookings?.length || 0,
                    totalUsers: users?.length || 0,
                    totalPackages: packages?.length || 0,
                    totalEvents: events?.length || 0
                },
                propertyViews: [
                    { clientName: 'John Doe', property: 'Modern 3-Bedroom Villa', action: 'Viewed Gallery', time: '2 hours ago' },
                    { clientName: 'Sarah Smith', property: 'Downtown Condo Unit', action: 'Requested Info', time: '5 hours ago' },
                    { clientName: 'Mike Ross', property: 'Modern 3-Bedroom Villa', time: '1 day ago', action: 'Viewed Price' },
                    { clientName: 'Jessica Pearson', property: 'Commercial Lot', time: '1 day ago', action: 'Scheduled Visit' },
                    { clientName: 'Harvey Specter', property: 'Luxury Penthouse', time: '2 days ago', action: 'Viewed Gallery' }
                ]
            });
        } catch (err) {
            console.error('Error loading context:', err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            // Send to AI endpoint with context
            const response = await fetch('/api/ai/assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    context: context,
                    conversationHistory: messages.slice(-10) // Last 10 messages for context
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get response');
            }

            const data = await response.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);

            // If the AI performed any actions, refresh context
            if (data.actionPerformed) {
                loadContextData();
            }
        } catch (err) {
            console.error('Error:', err);
            // Fallback to local processing if API fails
            const localResponse = processLocalQuery(userMessage);
            setMessages(prev => [...prev, { role: 'assistant', content: localResponse }]);
        } finally {
            setLoading(false);
        }
    };

    // Local query processing - intelligent fallback without API
    const processLocalQuery = (query) => {
        const q = query.toLowerCase();

        if (!context) {
            return "I'm still loading the data. Please wait a moment and try again.";
        }

        // Extract potential names from query
        const extractName = (text) => {
            // Common patterns: "status of X", "about X", "X's status", "info on X"
            const patterns = [
                /(?:status|info|details?|about|for)\s+(?:of\s+)?([a-z\s]+?)(?:\?|$)/i,
                /([a-z\s]+?)(?:'s|s')\s+(?:status|info|details?)/i,
                /what(?:'s| is| about)?\s+(?:the\s+)?(?:status\s+of\s+)?([a-z\s]+?)(?:\?|$)/i,
                /(?:find|search|show|get)\s+([a-z\s]+)/i
            ];

            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && match[1] && match[1].length > 2) {
                    return match[1].trim().toLowerCase();
                }
            }
            return null;
        };

        // Look for specific person/client queries
        const nameQuery = extractName(q);
        if (nameQuery && (q.includes('status') || q.includes('info') || q.includes('about') || q.includes('what'))) {
            // Search in conversations
            const matchingConv = context.conversations.find(c =>
                (c.participant_name || '').toLowerCase().includes(nameQuery)
            );

            // Search in clients
            const matchingClient = context.clients.find(c =>
                (c.client_name || c.clientName || '').toLowerCase().includes(nameQuery) ||
                (c.business_name || c.businessName || '').toLowerCase().includes(nameQuery)
            );

            if (matchingConv || matchingClient) {
                let response = [];

                if (matchingConv) {
                    response.push(`**📱 Conversation with ${matchingConv.participant_name}:**`);
                    response.push(`• Last Message: "${matchingConv.last_message_text?.substring(0, 100) || 'No messages'}..."`);
                    response.push(`• Unread: ${matchingConv.unread_count || 0} messages`);
                    response.push(`• Last Active: ${matchingConv.last_message_time ? new Date(matchingConv.last_message_time).toLocaleString() : 'Unknown'}`);
                    if (matchingConv.linked_client) {
                        response.push(`• Linked to Client: ${matchingConv.linked_client.client_name || matchingConv.linked_client.business_name}`);
                    }
                    if (matchingConv.assigned_user) {
                        response.push(`• Assigned to: ${matchingConv.assigned_user.name || matchingConv.assigned_user.email}`);
                    }
                }

                if (matchingClient) {
                    if (response.length > 0) response.push('');
                    response.push(`**👤 Client Record:**`);
                    response.push(`• Name: ${matchingClient.client_name || matchingClient.clientName}`);
                    if (matchingClient.business_name || matchingClient.businessName) {
                        response.push(`• Business: ${matchingClient.business_name || matchingClient.businessName}`);
                    }
                    if (matchingClient.email) {
                        response.push(`• Email: ${matchingClient.email}`);
                    }
                    if (matchingClient.phone || matchingClient.contact_details) {
                        response.push(`• Phone: ${matchingClient.phone || matchingClient.contact_details}`);
                    }
                    if (matchingClient.status) {
                        response.push(`• Status: ${matchingClient.status}`);
                    }
                    if (matchingClient.pipeline_status) {
                        response.push(`• Pipeline: ${matchingClient.pipeline_status}`);
                    }
                    if (matchingClient.niche) {
                        response.push(`• Niche: ${matchingClient.niche}`);
                    }
                }

                return response.join('\n') || `Found "${nameQuery}" but no details available.`;
            } else {
                // No exact match, show similar names
                const similarConvs = context.conversations.filter(c =>
                    (c.participant_name || '').toLowerCase().split(' ').some(part =>
                        part.includes(nameQuery) || nameQuery.includes(part)
                    )
                ).slice(0, 3);

                const similarClients = context.clients.filter(c =>
                    (c.client_name || c.clientName || '').toLowerCase().split(' ').some(part =>
                        part.includes(nameQuery) || nameQuery.includes(part)
                    )
                ).slice(0, 3);

                if (similarConvs.length > 0 || similarClients.length > 0) {
                    let suggestions = [`I couldn't find an exact match for "${nameQuery}". Did you mean:`];
                    similarConvs.forEach(c => suggestions.push(`• ${c.participant_name} (conversation)`));
                    similarClients.forEach(c => suggestions.push(`• ${c.client_name || c.clientName} (client)`));
                    return suggestions.join('\n');
                }

                return `I couldn't find anyone named "${nameQuery}" in your conversations or clients. Try searching with a different name.`;
            }
        }

        // Stats queries
        if (q.includes('how many') || q.includes('total') || q.includes('count') || q.includes('summary')) {
            if (q.includes('client')) {
                return `You have **${context.summary.totalClients}** clients in your database.`;
            }
            if (q.includes('conversation') || q.includes('message') || q.includes('convo')) {
                return `You have **${context.summary.totalConversations}** conversations in your inbox.`;
            }
            if (q.includes('booking')) {
                return `You have **${context.summary.totalBookings}** bookings recorded.`;
            }
            if (q.includes('user') || q.includes('team')) {
                return `You have **${context.summary.totalUsers}** team members.`;
            }
            return `📊 **Business Summary:**\n• **${context.summary.totalClients}** clients\n• **${context.summary.totalConversations}** conversations\n• **${context.summary.totalBookings}** bookings\n• **${context.summary.totalUsers}** team members`;
        }

        // List queries
        if (q.includes('list') || q.includes('show all')) {
            if (q.includes('client')) {
                const clientList = context.clients.slice(0, 10).map(c =>
                    `• ${c.client_name || c.clientName || 'Unknown'} - ${c.business_name || c.businessName || 'N/A'}`
                ).join('\n');
                return `**Your Recent Clients:**\n${clientList}${context.clients.length > 10 ? `\n\n...and ${context.clients.length - 10} more` : ''}`;
            }
            if (q.includes('conversation') || q.includes('convo')) {
                const convList = context.conversations.slice(0, 10).map(c =>
                    `• ${c.participant_name || 'Unknown'} - "${c.last_message_text?.substring(0, 40) || 'No messages'}..."`
                ).join('\n');
                return `**Recent Conversations:**\n${convList}${context.conversations.length > 10 ? `\n\n...and ${context.conversations.length - 10} more` : ''}`;
            }
            if (q.includes('user') || q.includes('team')) {
                const userList = context.users.map(u =>
                    `• ${u.name || u.email} (${u.role || 'member'})`
                ).join('\n');
                return `**Team Members:**\n${userList}`;
            }
        }

        // Unread/pending queries
        if (q.includes('unread') || q.includes('pending') || q.includes('waiting')) {
            const unreadConvs = context.conversations.filter(c => c.unread_count > 0);
            if (unreadConvs.length === 0) {
                return "✅ No unread messages! You're all caught up.";
            }
            const list = unreadConvs.slice(0, 5).map(c =>
                `• ${c.participant_name} (${c.unread_count} unread)`
            ).join('\n');
            return `📬 **You have ${unreadConvs.length} conversations with unread messages:**\n${list}`;
        }

        // Property View queries
        if (q.includes('viewed') || q.includes('seen') || q.includes('interest')) {
            if (nameQuery) {
                const views = context.propertyViews.filter(v =>
                    v.clientName.toLowerCase().includes(nameQuery)
                );
                if (views.length > 0) {
                    return `**Properties viewed by ${views[0].clientName}:**\n` +
                        views.map(v => `• ${v.property} (${v.action}) - ${v.time}`).join('\n');
                }
                return `No viewing history found for "${nameQuery}".`;
            }
        }

        // Recent activity
        if (q.includes('recent') || q.includes('latest') || q.includes('new')) {
            const recent = context.conversations.slice(0, 5).map(c =>
                `• ${c.participant_name || 'Unknown'} - ${c.last_message_time ? new Date(c.last_message_time).toLocaleString() : 'Unknown time'}`
            ).join('\n');
            return `**Recent Activity:**\n${recent}`;
        }

        // Default response with helpful suggestions
        return `I can help you with:
• **Status check**: "What's the status of Prince Jay?"
• **Client info**: "Show info about [client name]"
• **Stats**: "How many clients do I have?"
• **Lists**: "Show all conversations"
• **Unread**: "Show unread messages"
• **Recent**: "Show recent activity"

What would you like to know?`;
    };

    return (
        <>
            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(102, 126, 234, 0.5)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    zIndex: 9999,
                    transition: 'transform 0.3s, box-shadow 0.3s'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 6px 25px rgba(102, 126, 234, 0.6)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(102, 126, 234, 0.5)';
                }}
                title="AI Assistant (Admin Only)"
            >
                {isOpen ? '✕' : '🤖'}
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div style={{
                    position: 'fixed',
                    bottom: '90px',
                    right: '20px',
                    width: '380px',
                    height: '500px',
                    background: 'var(--bg-primary, #1a1a2e)',
                    borderRadius: '16px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    zIndex: 9998,
                    border: '1px solid var(--border-color, #333)'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '1rem',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}>
                        <span style={{ fontSize: '1.5rem' }}>🤖</span>
                        <div>
                            <div style={{ fontWeight: '600' }}>AI Assistant</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                                Admin Access • All Data
                            </div>
                        </div>
                        {context && (
                            <div style={{ marginLeft: 'auto', fontSize: '0.7rem', textAlign: 'right' }}>
                                <div>{context.summary.totalClients} clients</div>
                                <div>{context.summary.totalConversations} convos</div>
                            </div>
                        )}
                    </div>

                    {/* Messages */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem'
                    }}>
                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                style={{
                                    display: 'flex',
                                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                                }}
                            >
                                <div style={{
                                    maxWidth: '85%',
                                    padding: '0.75rem 1rem',
                                    borderRadius: msg.role === 'user'
                                        ? '16px 16px 4px 16px'
                                        : '16px 16px 16px 4px',
                                    background: msg.role === 'user'
                                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                        : 'var(--bg-secondary, #252542)',
                                    color: 'white',
                                    fontSize: '0.875rem',
                                    lineHeight: '1.5',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word'
                                }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '16px 16px 16px 4px',
                                    background: 'var(--bg-secondary, #252542)',
                                    color: 'var(--text-muted, #888)',
                                    fontSize: '0.875rem'
                                }}>
                                    <span className="typing-dots">Thinking...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <form onSubmit={handleSubmit} style={{
                        padding: '0.75rem',
                        borderTop: '1px solid var(--border-color, #333)',
                        display: 'flex',
                        gap: '0.5rem'
                    }}>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask me anything..."
                            disabled={loading}
                            style={{
                                flex: 1,
                                padding: '0.75rem 1rem',
                                borderRadius: '24px',
                                border: '1px solid var(--border-color, #333)',
                                background: 'var(--bg-secondary, #252542)',
                                color: 'var(--text-primary, white)',
                                fontSize: '0.875rem',
                                outline: 'none'
                            }}
                        />
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '50%',
                                border: 'none',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: 'white',
                                fontSize: '1rem',
                                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                                opacity: loading || !input.trim() ? 0.5 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            {loading ? '⏳' : '📤'}
                        </button>
                    </form>
                </div>
            )}
        </>
    );
};

export default AIAssistantWidget;

