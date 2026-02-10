import React, { useState } from 'react';

const MessengerPropertyButton = ({ property, participantId, onSend }) => {
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSendPropertyCard = async () => {
        if (!participantId || !property) return;
        
        setSending(true);
        try {
            // Call the webhook to send the property showcase button to Messenger
            const webhookUrl = `${window.location.origin}/api/webhook`;
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'send_property_showcase',
                    participantId,
                    propertyId: property.id,
                    propertyTitle: property.title,
                    propertyImage: property.images?.[0] || null,
                    propertyPrice: property.price,
                    teamId: property.team_id
                })
            });

            const result = await response.json();
            
            if (result.success) {
                setSent(true);
                if (onSend) onSend(property);
                setTimeout(() => setSent(false), 3000);
            } else {
                throw new Error(result.error || 'Failed to send');
            }
        } catch (err) {
            console.error('Error sending property button:', err);
            alert('Failed to send property showcase button. Please try again.');
        } finally {
            setSending(false);
        }
    };

    return (
        <button
            onClick={handleSendPropertyCard}
            disabled={sending || sent || !participantId}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                background: sent ? '#10b981' : 'var(--primary, #3b82f6)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: sending || !participantId ? 'not-allowed' : 'pointer',
                opacity: sending ? 0.7 : 1,
                transition: 'all 0.2s'
            }}
        >
            {sending ? (
                <>
                    <span style={{ 
                        width: '16px', 
                        height: '16px', 
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTop: '2px solid #fff',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite'
                    }} />
                    Sending...
                </>
            ) : sent ? (
                <>
                    <span>✓</span>
                    Sent!
                </>
            ) : (
                <>
                    <span style={{ fontSize: '16px' }}>🏠</span>
                    Send Property
                </>
            )}
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </button>
    );
};

export default MessengerPropertyButton;
