import React from 'react';
import MessengerPropertyButton from './MessengerPropertyButton';

/**
 * Example: How to integrate the Property Showcase Button into Messenger
 * 
 * Add this component to your Messenger interface where you want to send
 * properties to contacts. This could be:
 * - In the conversation header/actions
 * - In a property selection modal
 * - As quick action buttons
 */

const MessengerPropertyIntegration = ({ 
    properties = [], 
    selectedConversation,
    currentProperty = null 
}) => {
    // Get participant ID from conversation
    const participantId = selectedConversation?.participant_id;

    // If no conversation selected, don't show
    if (!selectedConversation) {
        return null;
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '12px',
            background: 'var(--bg-tertiary)',
            borderTop: '1px solid var(--border-color)'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'var(--text-primary)'
                }}>
                    Quick Actions
                </span>
                
                {/* Send Property Button - Shows current property or allows selection */}
                {currentProperty ? (
                    <MessengerPropertyButton
                        property={currentProperty}
                        participantId={participantId}
                        onSend={(property) => {
                            console.log('Property sent to contact:', property.title);
                            // You can add additional logic here (e.g., log to CRM)
                        }}
                    />
                ) : (
                    <button
                        onClick={() => {
                            // Open property selector modal
                            console.log('Open property selector');
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            background: 'var(--primary)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        <span style={{ fontSize: '16px' }}>🏠</span>
                        Select Property
                    </button>
                )}
            </div>

            {/* Quick Property List (optional) */}
            {properties.length > 0 && !currentProperty && (
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    overflowX: 'auto',
                    padding: '4px 0'
                }}>
                    {properties.slice(0, 5).map(property => (
                        <button
                            key={property.id}
                            onClick={() => {
                                // Send this property
                                console.log('Send property:', property.title);
                            }}
                            style={{
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '20px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            <img 
                                src={property.images?.[0] || 'https://via.placeholder.com/30'} 
                                alt=""
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '4px',
                                    objectFit: 'cover'
                                }}
                            />
                            <span style={{
                                maxWidth: '120px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                {property.title}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MessengerPropertyIntegration;
