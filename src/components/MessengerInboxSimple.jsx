import React, { useState, useEffect } from 'react';
import ErrorBoundary from './ErrorBoundary';

const MessengerInboxSimple = ({ clients = [], users = [], currentUserId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectedPages, setConnectedPages] = useState([]);
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => {
      setLoading(false);
      setConnectedPages([]); // No pages connected by default
      setConversations([]); // No conversations by default
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem',
        minHeight: '400px',
        color: 'var(--text-secondary)'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>💬</div>
        <div>Loading Messenger...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '2rem',
        color: 'var(--error)',
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        margin: '1rem'
      }}>
        <h3>Error Loading Messenger</h3>
        <p>{error.message || 'Unknown error'}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            marginTop: '1rem'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (connectedPages.length === 0) {
    return (
      <div style={{
        padding: '2rem',
        color: 'var(--text-secondary)',
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        margin: '1rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
        <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
          Facebook Messenger
        </h3>
        <p style={{ marginBottom: '1.5rem', lineHeight: '1.5' }}>
          Connect your Facebook Page to start managing Messenger conversations.
        </p>
        <button
          onClick={() => alert('Facebook connection would open here')}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '1rem',
          }}
        >
          Connect Facebook Page
        </button>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div style={{
        padding: '2rem',
        color: 'var(--text-secondary)',
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        margin: '1rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
        <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
          No Conversations
        </h3>
        <p style={{ marginBottom: '1.5rem', lineHeight: '1.5' }}>
          {connectedPages.length > 0
            ? `Connected to ${connectedPages.length} Facebook page${connectedPages.length > 1 ? 's' : ''}, but no conversations found.`
            : 'No conversations available.'}
        </p>
        <button
          onClick={() => setLoading(true)}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '1rem',
          }}
        >
          Refresh Conversations
        </button>
      </div>
    );
  }

  // Simple conversations list
  return (
    <div style={{ padding: '1rem' }}>
      <h3 style={{ marginBottom: '1rem' }}>Messenger Conversations</h3>
      <div style={{
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '1rem'
      }}>
        <p style={{ color: 'var(--text-muted)' }}>
          Messenger functionality loaded successfully.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Full Messenger interface would show here with Facebook integration.
        </p>
      </div>
    </div>
  );
};

// Wrap with ErrorBoundary for safety
export default function SafeMessengerInbox(props) {
  return (
    <ErrorBoundary>
      <MessengerInboxSimple {...props} />
    </ErrorBoundary>
  );
}