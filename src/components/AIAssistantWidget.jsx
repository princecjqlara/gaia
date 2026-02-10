import React, { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { matchProperties, queryProperties, getPropertyInsights } from '../services/propertyAIService';

/**
 * AI Assistant Widget - Admin Only
 * Floating chat widget with access to all database data
 */
const AIAssistantWidget = ({ currentUser, properties, onMatchFound, onPropertySelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [tab, setTab] = useState('chat');
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hello! I\'m your AI assistant. I have access to all your business data including clients, conversations, bookings, properties, and more. How can I help you today?\n\n💬 Ask questions about your properties\n🎯 Find properties matching buyer preferences\n📊 Get AI-powered property analysis' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [context, setContext] = useState(null);
    const [matchCriteria, setMatchCriteria] = useState({
        type: '',
        maxPrice: '',
        minPrice: '',
        bedrooms: '',
        location: '',
        preferences: ''
    });
    const [matches, setMatches] = useState([]);
    const [matchReason, setMatchReason] = useState('');
    const messagesEndRef = useRef(null);

    // Check if user is admin
    const isAdmin = currentUser?.email === 'admin@gaia.com' ||
        currentUser?.role === 'admin' ||
        currentUser?.user_metadata?.role === 'admin';

    // Don't render for non-admin users
    if (!isAdmin) return null;

    // Load context data on mount
    useEffect(() => {
        if (isOpen && !context) {
            loadContextData();
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const getSelectedProperty = () => {
        return properties?.find(p => p.selected) || null;
    };

    useEffect(() => {
        const selectedProperty = getSelectedProperty();
        if (selectedProperty && isOpen && tab === 'insights') {
            loadPropertyInsights(selectedProperty);
        }
    }, [tab, isOpen, properties]);

    const loadContextData = async () => {
        try {
            const supabase = getSupabaseClient();

            // Load all relevant data for context
            const [
                { data: clients },
                { data: conversations },
                { data: bookings },
                { data: users },
                { data: properties },
                { data: events }
            ] = await Promise.all([
                supabase.from('clients').select('*').limit(100),
                supabase.from('facebook_conversations').select('*').limit(100),
                supabase.from('bookings').select('*').limit(100),
                supabase.from('users').select('id, name, email, role').limit(50),
                supabase.from('properties').select('*').limit(50),
                supabase.from('events').select('*').limit(100)
            ]);

            setContext({
                clients: clients || [],
                conversations: conversations || [],
                bookings: bookings || [],
                users: users || [],
                properties: properties || [],
                events: events || [],
                summary: {
                    totalClients: clients?.length || 0,
                    totalConversations: conversations?.length || 0,
                    totalBookings: bookings?.length || 0,
                    totalUsers: users?.length || 0,
                    totalProperties: properties?.length || 0,
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
            // Sanitize context to remove any image/data that AI can't process
            const sanitizedContext = context ? {
                ...context,
                clients: (context.clients || []).map(c => ({
                    ...c,
                    profile_image: undefined,
                    avatar: undefined
                })),
                properties: (context.properties || []).map(p => ({
                    ...p,
                    images: undefined,
                    videos: undefined
                }))
            } : null;

            // Send to AI endpoint with context
            const response = await fetch('/api/ai/assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    context: sanitizedContext,
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

    const loadPropertyInsights = async (property) => {
        setLoading(true);
        try {
            const insights = await getPropertyInsights(property, properties || []);
            setMessages(prev => [...prev, { role: 'assistant', content: `**📊 Insights for ${property.title}**\n\n${insights}` }]);
        } catch (err) {
            console.error('Error loading insights:', err);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t load the property insights at this time.' }]);
        } finally {
            setLoading(false);
        }
    };

    const handlePropertyMatch = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const result = await matchProperties(matchCriteria, properties || []);
            setMatches(result.matches);
            setMatchReason(result.reason);

            if (result.matches.length > 0 && onMatchFound) {
                onMatchFound(result.matches);
            }

            const matchResults = result.matches.length > 0
                ? `**🎯 Found ${result.matches.length} matching properties:**\n\n${result.reason}\n\n` +
                  result.matches.map(p => `• ${p.title} - ₱${parseFloat(p.price).toLocaleString()}`).join('\n')
                : '**No matches found**\n\nTry adjusting your search criteria.';

            setMessages(prev => [...prev, { role: 'assistant', content: matchResults }]);
        } catch (err) {
            console.error('Error matching properties:', err);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Could not find matching properties. Please try again.' }]);
        } finally {
            setLoading(false);
        }
    };

    const handleQuickAction = (action) => {
        setInput(action);
    };

    const quickActions = (properties || []).length > 0 ? [
        `What's the cheapest property?`,
        `How many ${properties[0]?.type || 'properties'} do you have?`,
        `Show me properties in ${properties[0]?.address?.split(',')[0] || 'Makati'}`,
        `What's the average price per bedroom?`
    ] : [];

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
                        flexDirection: 'column',
                        gap: '0.5rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '1.5rem' }}>🤖</span>
                                <div>
                                    <div style={{ fontWeight: '600' }}>AI Assistant</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                                        Admin Access • All Data
                                    </div>
                                </div>
                            </div>
                            {context && (
                                <div style={{ fontSize: '0.7rem', textAlign: 'right' }}>
                                    <div>{context.summary.totalClients} clients</div>
                                    <div>{context.summary.totalConversations} convos</div>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.15)', borderRadius: '20px', padding: '2px' }}>
                            <button
                                onClick={() => setTab('chat')}
                                style={{
                                    flex: 1,
                                    padding: '0.5rem',
                                    border: 'none',
                                    background: tab === 'chat' ? 'white' : 'transparent',
                                    color: tab === 'chat' ? '#764ba2' : 'white',
                                    borderRadius: '18px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                💬 Chat
                            </button>
                            <button
                                onClick={() => setTab('match')}
                                style={{
                                    flex: 1,
                                    padding: '0.5rem',
                                    border: 'none',
                                    background: tab === 'match' ? 'white' : 'transparent',
                                    color: tab === 'match' ? '#764ba2' : 'white',
                                    borderRadius: '18px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                🎯 Match
                            </button>
                            <button
                                onClick={() => {
                                    setTab('insights');
                                    const selectedProperty = getSelectedProperty();
                                    if (selectedProperty) {
                                        loadPropertyInsights(selectedProperty);
                                    } else {
                                        setMessages(prev => [...prev, { role: 'assistant', content: 'Please select a property first to get insights.' }]);
                                    }
                                }}
                                style={{
                                    flex: 1,
                                    padding: '0.5rem',
                                    border: 'none',
                                    background: tab === 'insights' ? 'white' : 'transparent',
                                    color: tab === 'insights' ? '#764ba2' : 'white',
                                    borderRadius: '18px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                📊 Insights
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    {tab === 'chat' && (
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
                            {quickActions.length > 0 && messages.length < 3 && !loading && (
                                <div style={{ marginTop: '0.5rem' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Quick questions:</div>
                                    {quickActions.map((action, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => handleQuickAction(action)}
                                            style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 0.75rem',
                                                marginBottom: '0.3rem',
                                                border: '1px solid var(--border-color, #333)',
                                                background: 'var(--bg-secondary, #252542)',
                                                color: 'var(--text-primary, white)',
                                                borderRadius: '8px',
                                                fontSize: '0.75rem',
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(102, 126, 234, 0.2)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary, #252542)'}
                                        >
                                            {action}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}

                    {tab === 'match' && (
                        <div style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
                            <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                Enter buyer preferences to find matching properties
                            </div>

                            <form onSubmit={handlePropertyMatch} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Property Type</label>
                                    <select
                                        value={matchCriteria.type}
                                        onChange={(e) => setMatchCriteria({ ...matchCriteria, type: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '0.6rem',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-color, #333)',
                                            background: 'var(--bg-secondary, #252542)',
                                            color: 'var(--text-primary, white)',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    >
                                        <option value="">Any</option>
                                        <option>House & Lot</option>
                                        <option>Condominium</option>
                                        <option>Townhouse</option>
                                        <option>Lot Only</option>
                                        <option>Commercial</option>
                                    </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Min Price (₱)</label>
                                        <input
                                            type="number"
                                            value={matchCriteria.minPrice}
                                            onChange={(e) => setMatchCriteria({ ...matchCriteria, minPrice: e.target.value })}
                                            placeholder="Min..."
                                            style={{
                                                width: '100%',
                                                padding: '0.6rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-color, #333)',
                                                background: 'var(--bg-secondary, #252542)',
                                                color: 'var(--text-primary, white)',
                                                fontSize: '0.85rem',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Max Price (₱)</label>
                                        <input
                                            type="number"
                                            value={matchCriteria.maxPrice}
                                            onChange={(e) => setMatchCriteria({ ...matchCriteria, maxPrice: e.target.value })}
                                            placeholder="Max..."
                                            style={{
                                                width: '100%',
                                                padding: '0.6rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-color, #333)',
                                                background: 'var(--bg-secondary, #252542)',
                                                color: 'var(--text-primary, white)',
                                                fontSize: '0.85rem',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Bedrooms</label>
                                        <input
                                            type="number"
                                            value={matchCriteria.bedrooms}
                                            onChange={(e) => setMatchCriteria({ ...matchCriteria, bedrooms: e.target.value })}
                                            placeholder="Any..."
                                            min="1"
                                            style={{
                                                width: '100%',
                                                padding: '0.6rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-color, #333)',
                                                background: 'var(--bg-secondary, #252542)',
                                                color: 'var(--text-primary, white)',
                                                fontSize: '0.85rem',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Location</label>
                                        <input
                                            type="text"
                                            value={matchCriteria.location}
                                            onChange={(e) => setMatchCriteria({ ...matchCriteria, location: e.target.value })}
                                            placeholder="e.g., Makati"
                                            style={{
                                                width: '100%',
                                                padding: '0.6rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-color, #333)',
                                                background: 'var(--bg-secondary, #252542)',
                                                color: 'var(--text-primary, white)',
                                                fontSize: '0.85rem',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Additional Preferences</label>
                                    <textarea
                                        value={matchCriteria.preferences}
                                        onChange={(e) => setMatchCriteria({ ...matchCriteria, preferences: e.target.value })}
                                        placeholder="e.g., near schools, with pool, modern design..."
                                        rows="2"
                                        style={{
                                            width: '100%',
                                            padding: '0.6rem',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-color, #333)',
                                            background: 'var(--bg-secondary, #252542)',
                                            color: 'var(--text-primary, white)',
                                            fontSize: '0.85rem',
                                            outline: 'none',
                                            resize: 'none'
                                        }}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    style={{
                                        padding: '0.75rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: loading ? 'var(--border-color, #333)' : '#667eea',
                                        color: 'white',
                                        fontSize: '0.9rem',
                                        fontWeight: '600',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem'
                                    }}
                                >
                                    {loading ? '⏳ Finding matches...' : '🎯 Find Matching Properties'}
                                </button>
                            </form>

                            {matches.length > 0 && (
                                <div style={{ marginTop: '1.5rem' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#667eea', marginBottom: '0.5rem', fontWeight: '600' }}>
                                        {matchReason}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {matches.map((property) => (
                                            <div
                                                key={property.id}
                                                onClick={() => onPropertySelect && onPropertySelect(property)}
                                                style={{
                                                    padding: '0.75rem',
                                                    borderRadius: '8px',
                                                    background: 'var(--bg-secondary, #252542)',
                                                    border: '1px solid var(--border-color, #333)',
                                                    cursor: 'pointer',
                                                    transition: 'border-color 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#667eea'}
                                                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color, #333)'}
                                            >
                                                <div style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.25rem' }}>{property.title}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#667eea' }}>₱ {parseFloat(property.price).toLocaleString()}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                    {property.bedrooms} bed • {property.bathrooms} bath • {property.floorArea} sqm
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Input - only for chat tab */}
                    {tab === 'chat' && (
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
                    )}
                        </div>
                    )}

                    {tab === 'insights' && (
                        <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                            {!(properties) || properties.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏠</div>
                                    <div style={{ fontSize: '0.85rem' }}>No properties available. Add properties to get AI-powered insights.</div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div style={{ padding: '0.75rem', background: 'var(--bg-secondary, #252542)', borderRadius: '8px', border: '1px solid var(--primary)' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            {getSelectedProperty() ? 'Analyzing:' : 'Total Properties:'}
                                        </div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>
                                            {getSelectedProperty()?.title || `${properties.length} properties available`}
                                        </div>
                                        {getSelectedProperty() && (
                                            <div style={{ fontSize: '0.75rem', color: '#667eea' }}>₱ {parseFloat(getSelectedProperty().price).toLocaleString()}</div>
                                        )}
                                    </div>
                                    <div style={{
                                        padding: '1rem',
                                        background: 'var(--bg-secondary, #252542)',
                                        borderRadius: '8px',
                                        minHeight: '200px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--text-muted)',
                                        fontSize: '0.85rem',
                                        textAlign: 'center'
                                    }}>
                                        {loading ? 'Analyzing property...' : 'Insights will appear in the chat tab'}
                                    </div>
                                    {getSelectedProperty() && (
                                        <button
                                            onClick={() => loadPropertyInsights(getSelectedProperty())}
                                            disabled={loading}
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '10px',
                                                border: 'none',
                                                background: loading ? 'var(--border-color, #333)' : '#667eea',
                                                color: 'white',
                                                fontSize: '0.85rem',
                                                fontWeight: '600',
                                                cursor: loading ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            🔄 Refresh Insights
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
        </>
    );
};

export default AIAssistantWidget;

