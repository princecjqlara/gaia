import React, { useState, useRef, useEffect } from 'react';

const PropertyAISidebar = ({ properties, selectedProperty, onMatchFound, onPropertySelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [tab, setTab] = useState('qa');
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hi! I\'m your Property AI Assistant. I can:\n\n💬 Answer questions about your properties\n🎯 Match properties to buyer preferences\n📊 Provide property insights and analysis\n\nHow can I help you today?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
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

    const { matchProperties, queryProperties, getPropertyInsights } = require('../services/propertyAIService');

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (selectedProperty && isOpen && tab === 'insights') {
            loadPropertyInsights(selectedProperty);
        }
    }, [selectedProperty, isOpen, tab]);

    const loadPropertyInsights = async (property) => {
        setLoading(true);
        try {
            const insights = await getPropertyInsights(property, properties);
            setMessages(prev => [...prev, { role: 'assistant', content: `**📊 Insights for ${property.title}**\n\n${insights}` }]);
        } catch (err) {
            console.error('Error loading insights:', err);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t load the property insights at this time.' }]);
        } finally {
            setLoading(false);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            const response = await queryProperties(userMessage, properties);
            if (response) {
                setMessages(prev => [...prev, { role: 'assistant', content: response }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: 'I couldn\'t process your request. Please try again.' }]);
            }
        } catch (err) {
            console.error('Error:', err);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again later.' }]);
        } finally {
            setLoading(false);
        }
    };

    const handlePropertyMatch = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const result = await matchProperties(matchCriteria, properties);
            setMatches(result.matches);
            setMatchReason(result.reason);

            if (result.matches.length > 0 && onMatchFound) {
                onMatchFound(result.matches);
            }
        } catch (err) {
            console.error('Error matching properties:', err);
            setMatchReason('Could not find matching properties. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleQuickAction = (action) => {
        setInput(action);
    };

    const quickActions = properties.length > 0 ? [
        `What's the cheapest property?`,
        `How many ${properties[0]?.type || 'properties'} do you have?`,
        `Show me properties in ${properties[0]?.address?.split(',')[0] || 'Makati'}`,
        `What's the average price per bedroom?`
    ] : [];

    return (
        <>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(16, 185, 129, 0.5)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.4rem',
                    zIndex: 9999,
                    transition: 'all 0.3s'
                }}
                title="Property AI Assistant"
            >
                {isOpen ? '✕' : '🏠'}
            </button>

            {isOpen && (
                <div style={{
                    position: 'fixed',
                    bottom: '90px',
                    right: '20px',
                    width: '420px',
                    maxHeight: '70vh',
                    background: 'var(--bg-primary, #1a1a2e)',
                    borderRadius: '16px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    zIndex: 9998,
                    border: '1px solid var(--border-color, #333)'
                }}>
                    <div style={{
                        padding: '1rem',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '1.3rem' }}>🏠</span>
                                <div>
                                    <div style={{ fontWeight: '600', fontSize: '1rem' }}>Property AI</div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>{properties.length} properties in database</div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.15)', borderRadius: '20px', padding: '2px' }}>
                            <button
                                onClick={() => setTab('qa')}
                                style={{
                                    flex: 1,
                                    padding: '0.5rem',
                                    border: 'none',
                                    background: tab === 'qa' ? 'white' : 'transparent',
                                    color: tab === 'qa' ? '#059669' : 'white',
                                    borderRadius: '18px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                💬 Q&A
                            </button>
                            <button
                                onClick={() => setTab('match')}
                                style={{
                                    flex: 1,
                                    padding: '0.5rem',
                                    border: 'none',
                                    background: tab === 'match' ? 'white' : 'transparent',
                                    color: tab === 'match' ? '#059669' : 'white',
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
                                    if (selectedProperty) {
                                        loadPropertyInsights(selectedProperty);
                                    } else {
                                        setMessages([
                                            { role: 'assistant', content: 'Please select a property first to get insights.' }
                                        ]);
                                    }
                                }}
                                style={{
                                    flex: 1,
                                    padding: '0.5rem',
                                    border: 'none',
                                    background: tab === 'insights' ? 'white' : 'transparent',
                                    color: tab === 'insights' ? '#059669' : 'white',
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

                    {tab === 'qa' && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                                : 'var(--bg-secondary, #252542)',
                                            color: 'white',
                                            fontSize: '0.85rem',
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
                                            fontSize: '0.85rem'
                                        }}>
                                            Thinking...
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
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary, #252542)'}
                                            >
                                                {action}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <form onSubmit={handleSendMessage} style={{
                                padding: '0.75rem',
                                borderTop: '1px solid var(--border-color, #333)',
                                display: 'flex',
                                gap: '0.5rem'
                            }}>
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask about properties..."
                                    disabled={loading}
                                    style={{
                                        flex: 1,
                                        padding: '0.6rem 1rem',
                                        borderRadius: '20px',
                                        border: '1px solid var(--border-color, #333)',
                                        background: 'var(--bg-secondary, #252542)',
                                        color: 'var(--text-primary, white)',
                                        fontSize: '0.85rem',
                                        outline: 'none'
                                    }}
                                />
                                <button
                                    type="submit"
                                    disabled={loading || !input.trim()}
                                    style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '50%',
                                        border: 'none',
                                        background: loading || !input.trim() ? 'var(--border-color, #333)' : '#10b981',
                                        color: 'white',
                                        fontSize: '0.9rem',
                                        cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    📤
                                </button>
                            </form>
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
                                        background: loading ? 'var(--border-color, #333)' : '#10b981',
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
                                    <div style={{ fontSize: '0.8rem', color: '#10b981', marginBottom: '0.5rem', fontWeight: '600' }}>
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
                                                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#10b981'}
                                                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color, #333)'}
                                            >
                                                <div style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.25rem' }}>{property.title}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#10b981' }}>₱ {parseFloat(property.price).toLocaleString()}</div>
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

                    {tab === 'insights' && (
                        <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                            {!selectedProperty ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏠</div>
                                    <div style={{ fontSize: '0.85rem' }}>Select a property from the list to get AI-powered insights</div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div style={{ padding: '0.75rem', background: 'var(--bg-secondary, #252542)', borderRadius: '8px', border: '1px solid var(--primary)' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Analyzing:</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>{selectedProperty.title}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#10b981' }}>₱ {parseFloat(selectedProperty.price).toLocaleString()}</div>
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
                                        {loading ? 'Analyzing property...' : 'Insights will appear here'}
                                    </div>
                                    <button
                                        onClick={() => loadPropertyInsights(selectedProperty)}
                                        disabled={loading}
                                        style={{
                                            padding: '0.75rem',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: loading ? 'var(--border-color, #333)' : '#10b981',
                                            color: 'white',
                                            fontSize: '0.85rem',
                                            fontWeight: '600',
                                            cursor: loading ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        🔄 Refresh Insights
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </>
    );
};

export default PropertyAISidebar;
