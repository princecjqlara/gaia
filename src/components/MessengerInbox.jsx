import React, { useState, useRef, useEffect } from 'react';
import { useFacebookMessenger } from '../hooks/useFacebookMessenger';

const MessengerInbox = ({ clients = [], users = [], currentUserId }) => {
    const {
        conversations,
        selectedConversation,
        messages,
        loading,
        syncing,
        error,
        unreadCount,
        selectConversation,
        sendMessage,
        syncAllConversations,
        linkToClient,
        assignToUser,
        clearError
    } = useFacebookMessenger();

    const [messageText, setMessageText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showLinkModal, setShowLinkModal] = useState(false);
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Filter conversations by search
    const filteredConversations = conversations.filter(conv => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            conv.participant_name?.toLowerCase().includes(term) ||
            conv.last_message_text?.toLowerCase().includes(term)
        );
    });

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!messageText.trim() || loading) return;

        const success = await sendMessage(messageText);
        if (success) {
            setMessageText('');
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return date.toLocaleDateString([], { weekday: 'short' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    };

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '300px 1fr 280px',
            height: 'calc(100vh - 200px)',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            border: '1px solid var(--border-color)'
        }}>
            {/* Left Sidebar - Conversations List */}
            <div style={{
                borderRight: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-primary)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1rem',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <h3 style={{ margin: 0, fontSize: '1.125rem' }}>
                        💬 Messages
                        {unreadCount > 0 && (
                            <span style={{
                                marginLeft: '0.5rem',
                                background: 'var(--error)',
                                color: 'white',
                                padding: '0.125rem 0.5rem',
                                borderRadius: '999px',
                                fontSize: '0.75rem'
                            }}>
                                {unreadCount}
                            </span>
                        )}
                    </h3>
                    <button
                        className="btn btn-sm btn-secondary"
                        onClick={syncAllConversations}
                        disabled={syncing}
                        title="Sync with Facebook"
                    >
                        {syncing ? '⏳' : '🔄'}
                    </button>
                </div>

                {/* Search */}
                <div style={{ padding: '0.75rem' }}>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search conversations..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%' }}
                    />
                </div>

                {/* Conversations List */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filteredConversations.length === 0 ? (
                        <div style={{
                            padding: '2rem 1rem',
                            textAlign: 'center',
                            color: 'var(--text-muted)'
                        }}>
                            {conversations.length === 0
                                ? 'No conversations yet. Connect a Facebook page to get started.'
                                : 'No conversations match your search.'
                            }
                        </div>
                    ) : (
                        filteredConversations.map(conv => (
                            <div
                                key={conv.id}
                                onClick={() => selectConversation(conv)}
                                style={{
                                    padding: '0.75rem 1rem',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid var(--border-color)',
                                    background: selectedConversation?.id === conv.id
                                        ? 'var(--primary-alpha)'
                                        : 'transparent',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    if (selectedConversation?.id !== conv.id) {
                                        e.currentTarget.style.background = 'var(--bg-secondary)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (selectedConversation?.id !== conv.id) {
                                        e.currentTarget.style.background = 'transparent';
                                    }
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem'
                                }}>
                                    {/* Avatar */}
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '50%',
                                        background: 'var(--primary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        fontSize: '1rem',
                                        flexShrink: 0
                                    }}>
                                        {conv.participant_picture_url ? (
                                            <img
                                                src={conv.participant_picture_url}
                                                alt=""
                                                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                            />
                                        ) : (
                                            conv.participant_name?.charAt(0)?.toUpperCase() || '?'
                                        )}
                                    </div>

                                    {/* Details */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '0.25rem'
                                        }}>
                                            <span style={{
                                                fontWeight: conv.unread_count > 0 ? '600' : '500',
                                                color: 'var(--text-primary)',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {conv.participant_name || 'Unknown'}
                                            </span>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--text-muted)',
                                                flexShrink: 0
                                            }}>
                                                {formatTime(conv.last_message_time)}
                                            </span>
                                        </div>
                                        <div style={{
                                            fontSize: '0.875rem',
                                            color: conv.unread_count > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                                            fontWeight: conv.unread_count > 0 ? '500' : '400',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {conv.last_message_text || 'No messages'}
                                        </div>
                                        {conv.linked_client && (
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--primary)',
                                                marginTop: '0.25rem'
                                            }}>
                                                🔗 {conv.linked_client.client_name}
                                            </div>
                                        )}
                                    </div>

                                    {/* Unread Badge */}
                                    {conv.unread_count > 0 && (
                                        <div style={{
                                            background: 'var(--primary)',
                                            color: 'white',
                                            borderRadius: '999px',
                                            padding: '0.125rem 0.5rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold',
                                            flexShrink: 0
                                        }}>
                                            {conv.unread_count}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Center - Messages Thread */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-primary)'
            }}>
                {selectedConversation ? (
                    <>
                        {/* Conversation Header */}
                        <div style={{
                            padding: '1rem',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem'
                        }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: 'var(--primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontWeight: 'bold'
                            }}>
                                {selectedConversation.participant_name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                                <div style={{ fontWeight: '600' }}>
                                    {selectedConversation.participant_name || 'Unknown'}
                                </div>
                                {selectedConversation.linked_client && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>
                                        🔗 Linked to {selectedConversation.linked_client.client_name}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Messages */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem'
                        }}>
                            {messages.length === 0 ? (
                                <div style={{
                                    textAlign: 'center',
                                    color: 'var(--text-muted)',
                                    padding: '2rem'
                                }}>
                                    No messages yet
                                </div>
                            ) : (
                                messages.map(msg => (
                                    <div
                                        key={msg.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: msg.is_from_page ? 'flex-end' : 'flex-start'
                                        }}
                                    >
                                        <div style={{
                                            maxWidth: '70%',
                                            padding: '0.75rem 1rem',
                                            borderRadius: msg.is_from_page
                                                ? '1rem 1rem 0 1rem'
                                                : '1rem 1rem 1rem 0',
                                            background: msg.is_from_page
                                                ? 'var(--primary)'
                                                : 'var(--bg-secondary)',
                                            color: msg.is_from_page
                                                ? 'white'
                                                : 'var(--text-primary)'
                                        }}>
                                            <div style={{ wordBreak: 'break-word' }}>
                                                {msg.message_text}
                                            </div>
                                            <div style={{
                                                fontSize: '0.7rem',
                                                opacity: 0.7,
                                                marginTop: '0.25rem',
                                                textAlign: 'right'
                                            }}>
                                                {formatTime(msg.timestamp)}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Message Composer */}
                        <form onSubmit={handleSendMessage} style={{
                            padding: '1rem',
                            borderTop: '1px solid var(--border-color)',
                            display: 'flex',
                            gap: '0.5rem'
                        }}>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Type a message..."
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                style={{ flex: 1 }}
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={loading || !messageText.trim()}
                            >
                                {loading ? '⏳' : '📤'}
                            </button>
                        </form>
                    </>
                ) : (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)',
                        flexDirection: 'column',
                        gap: '1rem'
                    }}>
                        <div style={{ fontSize: '3rem' }}>💬</div>
                        <div>Select a conversation to view messages</div>
                    </div>
                )}
            </div>

            {/* Right Sidebar - Contact Details */}
            <div style={{
                borderLeft: '1px solid var(--border-color)',
                padding: '1rem',
                background: 'var(--bg-primary)',
                overflowY: 'auto'
            }}>
                {selectedConversation ? (
                    <>
                        {/* Contact Info */}
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '50%',
                                background: 'var(--primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontWeight: 'bold',
                                fontSize: '2rem',
                                margin: '0 auto 0.75rem'
                            }}>
                                {selectedConversation.participant_picture_url ? (
                                    <img
                                        src={selectedConversation.participant_picture_url}
                                        alt=""
                                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    selectedConversation.participant_name?.charAt(0)?.toUpperCase() || '?'
                                )}
                            </div>
                            <h4 style={{ margin: 0 }}>
                                {selectedConversation.participant_name || 'Unknown'}
                            </h4>
                            {selectedConversation.participant_email && (
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                    {selectedConversation.participant_email}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {/* Link to Client */}
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                                    Link to Client
                                </label>
                                <select
                                    className="form-select"
                                    value={selectedConversation.linked_client_id || ''}
                                    onChange={(e) => linkToClient(selectedConversation.conversation_id, e.target.value || null)}
                                    style={{ width: '100%' }}
                                >
                                    <option value="">Not linked</option>
                                    {clients.map(client => (
                                        <option key={client.id} value={client.id}>
                                            {client.clientName}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Assign to User */}
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                                    Assigned To
                                </label>
                                <select
                                    className="form-select"
                                    value={selectedConversation.assigned_to || ''}
                                    onChange={(e) => assignToUser(selectedConversation.conversation_id, e.target.value || null)}
                                    style={{ width: '100%' }}
                                >
                                    <option value="">Unassigned</option>
                                    {users.map(user => (
                                        <option key={user.id} value={user.id}>
                                            {user.name || user.email}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Linked Client Info */}
                        {selectedConversation.linked_client && (
                            <div style={{
                                marginTop: '1.5rem',
                                padding: '1rem',
                                background: 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-md)'
                            }}>
                                <h5 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem' }}>
                                    🔗 Linked Client
                                </h5>
                                <div style={{ fontWeight: '500' }}>
                                    {selectedConversation.linked_client.client_name}
                                </div>
                                {selectedConversation.linked_client.business_name && (
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                        {selectedConversation.linked_client.business_name}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        paddingTop: '2rem'
                    }}>
                        Select a conversation to view details
                    </div>
                )}
            </div>

            {/* Error Toast */}
            {error && (
                <div style={{
                    position: 'fixed',
                    bottom: '1rem',
                    right: '1rem',
                    background: 'var(--error)',
                    color: 'white',
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    zIndex: 1000
                }}>
                    <span>⚠️ {error}</span>
                    <button
                        onClick={clearError}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '1rem'
                        }}
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
};

export default MessengerInbox;
