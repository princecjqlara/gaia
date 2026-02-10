import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPropertyLead } from '../services/leadService';
import { showToast } from '../utils/toast';

const PropertyMediaShowcase = ({ 
    properties = [], 
    branding = {}, 
    initialPropertyIndex = 0,
    onClose,
    visitorName,
    participantId,
    teamId,
    organizationId
}) => {
    const [currentPropertyIndex, setCurrentPropertyIndex] = useState(initialPropertyIndex);
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
    const [showDetails, setShowDetails] = useState(false);
    const [showInquiryModal, setShowInquiryModal] = useState(false);
    const [inquiryComplete, setInquiryComplete] = useState(false);
    const [sendingInquiryMessage, setSendingInquiryMessage] = useState(false);
    const [showScrollHint, setShowScrollHint] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', message: '' });
    const [submittingLead, setSubmittingLead] = useState(false);
    const [hasShownScrollHint, setHasShownScrollHint] = useState(false);
    
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const touchStartY = useRef(0);
    const touchStartX = useRef(0);

    const currentProperty = properties[currentPropertyIndex] || null;
    
    // Get media array for current property
    const getMedia = (property) => {
        if (!property) return [];
        const images = property.images || [];
        const videos = property.videos || [];
        let media = [...images, ...videos];

        const primaryUrl = property.primary_media_url || property.primaryMediaUrl || null;
        if (primaryUrl) {
            media = [primaryUrl, ...media.filter((url) => url !== primaryUrl)];
        }

        return media.length > 0
            ? media
            : ['https://images.unsplash.com/photo-1600596542815-27bfef402399?q=80&w=2070'];
    };

    const currentMedia = currentProperty ? getMedia(currentProperty) : [];

    // Check if URL is video
    const isVideo = (url) => {
        if (!url) return false;
        return url.includes('/video/') || url.match(/\.(mp4|webm|mov|ogg)$/i);
    };

    // Auto-play video when property or media changes
    useEffect(() => {
        if (videoRef.current && isVideo(currentMedia[currentMediaIndex])) {
            const attemptPlay = async () => {
                try {
                    await videoRef.current.play();
                } catch (err) {
                    console.log('Autoplay with sound prevented:', err);
                    setIsMuted(true);
                    try {
                        await videoRef.current.play();
                    } catch (errMuted) {
                        console.log('Autoplay muted prevented:', errMuted);
                    }
                }
            };
            attemptPlay();
        }
    }, [currentPropertyIndex, currentMediaIndex, currentMedia]);

    // Show scroll hint periodically
    useEffect(() => {
        if (properties.length <= 1) return;
        
        const interval = setInterval(() => {
            if (!hasShownScrollHint && currentPropertyIndex < properties.length - 1) {
                setShowScrollHint(true);
                setTimeout(() => setShowScrollHint(false), 3000);
                setHasShownScrollHint(true);
            }
        }, 15000); // Show every 15 seconds

        return () => clearInterval(interval);
    }, [currentPropertyIndex, properties.length, hasShownScrollHint]);

    // Log view when property changes
    useEffect(() => {
        if (currentProperty && participantId) {
            const logView = async () => {
                try {
                    const webhookUrl = `${window.location.origin}/api/webhook`;
                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'property_click',
                            participantId,
                            propertyId: currentProperty.id,
                            propertyTitle: currentProperty.title
                        })
                    });
                } catch (err) {
                    console.warn('Webhook failed:', err);
                }
            };
            logView();
        }
    }, [currentProperty, participantId]);

    // Touch handlers for vertical swiping (between properties)
    const handleTouchStart = (e) => {
        touchStartY.current = e.touches[0].clientY;
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e) => {
        const touchEndY = e.changedTouches[0].clientY;
        const touchEndX = e.changedTouches[0].clientX;
        const diffY = touchStartY.current - touchEndY;
        const diffX = touchStartX.current - touchEndX;

        // Vertical swipe (change property) - must be more vertical than horizontal
        if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 50) {
            if (diffY > 0 && currentPropertyIndex < properties.length - 1) {
                // Swipe up - next property
                setCurrentPropertyIndex(prev => prev + 1);
                setCurrentMediaIndex(0);
                setShowDetails(false);
            } else if (diffY < 0 && currentPropertyIndex > 0) {
                // Swipe down - previous property
                setCurrentPropertyIndex(prev => prev - 1);
                setCurrentMediaIndex(0);
                setShowDetails(false);
            }
            return;
        }

        // Horizontal swipe (change media) - must be more horizontal than vertical
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
            if (diffX > 0) {
                // Swipe left - next media
                handleMediaScroll('next');
            } else {
                // Swipe right - previous media
                handleMediaScroll('prev');
            }
        }
    };

    // Horizontal scroll for media
    const handleMediaScroll = (direction) => {
        if (direction === 'next' && currentMediaIndex < currentMedia.length - 1) {
            setCurrentMediaIndex(prev => prev + 1);
        } else if (direction === 'prev' && currentMediaIndex > 0) {
            setCurrentMediaIndex(prev => prev - 1);
        }
    };

    const handleLeadSubmit = async (e) => {
        e.preventDefault();
        setSubmittingLead(true);
        try {
            const { error } = await createPropertyLead({
                ...leadForm,
                property_id: currentProperty.id,
                team_id: teamId,
                organization_id: organizationId
            });

            if (error) throw error;

            showToast('Thank you! We will contact you shortly.', 'success');
            setLeadForm({ name: '', email: '', phone: '', message: '' });
            setInquiryComplete(true);
        } catch (err) {
            console.error('Error submitting lead:', err);
            showToast('Failed to send inquiry. Please try again.', 'error');
        } finally {
            setSubmittingLead(false);
        }
    };

    const handleInquireClick = async () => {
        if (!participantId) {
            setInquiryComplete(false);
            setShowInquiryModal(true);
            return;
        }

        if (!currentProperty) return;

        setSendingInquiryMessage(true);
        try {
            const response = await fetch('/api/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'inquiry_click',
                    participantId,
                    propertyId: currentProperty.id,
                    propertyTitle: currentProperty.title,
                    scheduleUrl: branding?.schedule_meeting_url || null
                })
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok || result?.error) {
                throw new Error(result?.error || 'Failed to send message');
            }

            showToast('Message sent to contact!', 'success');
        } catch (err) {
            console.error('Error sending inquiry message:', err);
            showToast('Failed to send message. Opening inquiry form...', 'error');
            setInquiryComplete(false);
            setShowInquiryModal(true);
        } finally {
            setSendingInquiryMessage(false);
        }
    };

    if (!currentProperty) {
        return (
            <div style={{
                position: 'fixed',
                inset: 0,
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                zIndex: 9999
            }}>
                <div>No properties available</div>
            </div>
        );
    }

    return (
        <div 
            ref={containerRef}
            className="property-showcase"
            style={{
                position: 'fixed',
                inset: 0,
                background: '#000',
                zIndex: 9999,
                overflow: 'hidden',
                fontFamily: "'Inter', sans-serif",
                '--action-bar-height': '64px',
                '--action-bar-gap': '12px',
                '--action-btn-padding': '16px 24px',
                '--action-btn-font': '16px'
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Media Display */}
            <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#000',
                boxSizing: 'border-box',
                paddingTop: isVideo(currentMedia[currentMediaIndex])
                    ? '0px'
                    : 'calc(56px + env(safe-area-inset-top, 0px))',
                paddingBottom: isVideo(currentMedia[currentMediaIndex])
                    ? '0px'
                    : (showDetails
                        ? 'clamp(220px, 48vh, 520px)'
                        : 'clamp(150px, 32vh, 360px)')
            }}>
                {isVideo(currentMedia[currentMediaIndex]) ? (
                    <video
                        ref={videoRef}
                        src={currentMedia[currentMediaIndex]}
                        autoPlay
                        muted={isMuted}
                        loop
                        playsInline
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            background: '#000'
                        }}
                        onClick={() => setIsMuted(!isMuted)}
                    />
                ) : (
                    <img
                        src={currentMedia[currentMediaIndex]}
                        alt={currentProperty.title}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            background: '#000'
                        }}
                    />
                )}

                {/* Media indicator dots */}
                {currentMedia.length > 1 && (
                    <div style={{
                        position: 'absolute',
                        top: '60px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: '6px',
                        zIndex: 10
                    }}>
                        {currentMedia.map((_, idx) => (
                            <div
                                key={idx}
                                style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: idx === currentMediaIndex ? '#fff' : 'rgba(255,255,255,0.4)',
                                    transition: 'all 0.3s'
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Horizontal scroll arrows for media */}
                {currentMedia.length > 1 && (
                    <>
                        {currentMediaIndex > 0 && (
                            <button
                                onClick={() => handleMediaScroll('prev')}
                                style={{
                                    position: 'absolute',
                                    left: '10px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'rgba(0,0,0,0.5)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '40px',
                                    height: '40px',
                                    color: '#fff',
                                    fontSize: '20px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 10
                                }}
                            >
                                ‹
                            </button>
                        )}
                        {currentMediaIndex < currentMedia.length - 1 && (
                            <button
                                onClick={() => handleMediaScroll('next')}
                                style={{
                                    position: 'absolute',
                                    right: '10px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'rgba(0,0,0,0.5)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '40px',
                                    height: '40px',
                                    color: '#fff',
                                    fontSize: '20px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 10
                                }}
                            >
                                ›
                            </button>
                        )}
                    </>
                )}

                {/* Mute indicator */}
                {isVideo(currentMedia[currentMediaIndex]) && (
                    <button
                        onClick={() => setIsMuted(!isMuted)}
                        style={{
                            position: 'absolute',
                            top: '60px',
                            right: '15px',
                            background: 'rgba(0,0,0,0.5)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            color: '#fff',
                            fontSize: '16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 10
                        }}
                    >
                        {isMuted ? '🔇' : '🔊'}
                    </button>
                )}
            </div>

            {/* Property Counter */}
            <div style={{
                position: 'absolute',
                top: '15px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.6)',
                padding: '6px 16px',
                borderRadius: '20px',
                color: '#fff',
                fontSize: '13px',
                fontWeight: '600',
                zIndex: 20
            }}>
                {currentPropertyIndex + 1} / {properties.length}
            </div>

            {/* Close Button */}
            <button
                onClick={onClose}
                style={{
                    position: 'absolute',
                    top: '15px',
                    left: '15px',
                    background: 'rgba(0,0,0,0.5)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    color: '#fff',
                    fontSize: '20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 20
                }}
            >
                ✕
            </button>

            {/* Scroll Up Hint */}
            {showScrollHint && properties.length > 1 && currentPropertyIndex < properties.length - 1 && (
                <div style={{
                    position: 'absolute',
                    top: '80px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(16, 185, 129, 0.9)',
                    padding: '10px 20px',
                    borderRadius: '25px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    zIndex: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    animation: 'bounce 2s infinite',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
                }}>
                    <span style={{ fontSize: '18px' }}>↑</span>
                    Scroll up for more properties
                </div>
            )}

            {/* Details Overlay */}
            <div
                className="property-details-overlay"
                style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: showDetails 
                    ? 'linear-gradient(transparent, rgba(0,0,0,0.95) 20%)' 
                    : 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                padding: showDetails
                    ? '100px 20px calc(var(--action-bar-height, 64px) + 64px + env(safe-area-inset-bottom, 0px))'
                    : '60px 20px calc(var(--action-bar-height, 64px) + 32px + env(safe-area-inset-bottom, 0px))',
                color: '#fff',
                transition: 'all 0.3s ease',
                zIndex: 15,
                maxHeight: showDetails ? 'calc(100vh - 20px - env(safe-area-inset-top, 0px))' : 'auto',
                overflowY: showDetails ? 'auto' : 'hidden'
            }}>
                {/* Property Title */}
                <h2 style={{
                    fontSize: 'clamp(20px, 4.2vw, 26px)',
                    fontWeight: '800',
                    margin: '0 0 8px 0',
                    lineHeight: 1.2
                }}>
                    {currentProperty.title}
                </h2>

                {/* Price */}
                <div style={{
                    fontSize: 'clamp(18px, 3.6vw, 22px)',
                    fontWeight: '700',
                    color: '#10b981',
                    marginBottom: '12px'
                }}>
                    ₱ {parseFloat(currentProperty.price).toLocaleString()}
                </div>

                {/* Location */}
                <div style={{
                    fontSize: 'clamp(13px, 3vw, 15px)',
                    opacity: 0.9,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                }}>
                    📍 {currentProperty.address}
                </div>

                {/* Quick Stats */}
                <div style={{
                    display: 'flex',
                    gap: '20px',
                    flexWrap: 'wrap',
                    rowGap: '10px',
                    marginBottom: showDetails ? '20px' : '0',
                    fontSize: '14px'
                }}>
                    <span>🛏️ {currentProperty.bedrooms} Beds</span>
                    <span>🚿 {currentProperty.bathrooms} Baths</span>
                    <span>📐 {currentProperty.floorArea} sqm</span>
                </div>

                {/* Expanded Details */}
                {showDetails && (
                    <div style={{
                        marginTop: '20px',
                        paddingTop: '20px',
                        borderTop: '1px solid rgba(255,255,255,0.2)'
                    }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>
                            About this property
                        </h3>
                        <p style={{
                            fontSize: '14px',
                            lineHeight: 1.6,
                            opacity: 0.9,
                            marginBottom: '20px'
                        }}>
                            {currentProperty.description || 'No description available.'}
                        </p>

                        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>
                            Key Features
                        </h3>
                        <div
                            className="property-key-features"
                            style={{
                                fontSize: '14px',
                                marginBottom: '20px'
                            }}
                        >
                            <div>✓ Lot Area: {currentProperty.lotArea} sqm</div>
                            <div>✓ Year Built: {currentProperty.yearBuilt}</div>
                            <div>✓ Type: {currentProperty.type}</div>
                            <div>✓ Garage: {currentProperty.garage} cars</div>
                        </div>

                        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>
                            Financials
                        </h3>
                        <div style={{
                            background: 'rgba(255,255,255,0.1)',
                            padding: '15px',
                            borderRadius: '12px',
                            fontSize: '14px'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '8px'
                            }}>
                                <span>Down Payment:</span>
                                <span>₱ {parseFloat(currentProperty.downPayment || 0).toLocaleString()}</span>
                            </div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between'
                            }}>
                                <span>Monthly:</span>
                                <span>₱ {parseFloat(currentProperty.monthlyAmortization || 0).toLocaleString()}</span>
                            </div>
                        </div>

                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div
                className="property-action-bar"
                style={{
                position: 'absolute',
                bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
                left: 'calc(16px + env(safe-area-inset-left, 0px))',
                right: 'calc(16px + env(safe-area-inset-right, 0px))',
                display: 'flex',
                gap: 'var(--action-bar-gap, 12px)',
                zIndex: 20
            }}>
                <button
                    onClick={handleInquireClick}
                    disabled={sendingInquiryMessage}
                    style={{
                        flex: 1,
                        padding: 'var(--action-btn-padding, 16px 24px)',
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '14px',
                        fontSize: 'var(--action-btn-font, 16px)',
                        fontWeight: '700',
                        cursor: sendingInquiryMessage ? 'not-allowed' : 'pointer',
                        opacity: sendingInquiryMessage ? 0.8 : 1,
                        minHeight: '44px',
                        boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
                    }}
                >
                    {sendingInquiryMessage ? 'Sending...' : 'Inquire Now'}
                </button>
                <button
                    onClick={() => setShowDetails(!showDetails)}
                    style={{
                        flex: 1,
                        padding: 'var(--action-btn-padding, 16px 24px)',
                        background: showDetails ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.9)',
                        color: showDetails ? '#fff' : '#111',
                        border: 'none',
                        borderRadius: '14px',
                        fontSize: 'var(--action-btn-font, 16px)',
                        fontWeight: '700',
                        cursor: 'pointer',
                        minHeight: '44px'
                    }}
                >
                    {showDetails ? 'Hide Details' : 'See Details'}
                </button>
            </div>

            {/* Inquiry Modal */}
            {showInquiryModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    zIndex: 100
                }}>
                    <div style={{
                        background: '#fff',
                        width: '100%',
                        maxWidth: '500px',
                        maxHeight: '85vh',
                        borderRadius: '24px 24px 0 0',
                        padding: '24px',
                        overflowY: 'auto',
                        animation: 'slideUp 0.3s ease'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '20px'
                        }}>
                            <h3 style={{
                                fontSize: '20px',
                                fontWeight: '700',
                                color: '#111',
                                margin: 0
                            }}>
                                Inquire about this property
                            </h3>
                            <button
                                onClick={() => {
                                    setShowInquiryModal(false);
                                    setInquiryComplete(false);
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '24px',
                                    color: '#666',
                                    cursor: 'pointer'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {inquiryComplete ? (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '16px'
                            }}>
                                <div style={{
                                    background: '#ecfdf5',
                                    border: '1px solid #d1fae5',
                                    padding: '16px',
                                    borderRadius: '14px',
                                    color: '#065f46',
                                    fontSize: '14px'
                                }}>
                                    Thank you! Your inquiry has been sent.
                                </div>

                                {branding?.schedule_meeting_url && (
                                    <a
                                        href={branding.schedule_meeting_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            width: '100%',
                                            padding: '16px',
                                            background: '#10b981',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '14px',
                                            fontSize: '16px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            textDecoration: 'none'
                                        }}
                                    >
                                        Schedule a Meeting
                                    </a>
                                )}

                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowInquiryModal(false);
                                        setInquiryComplete(false);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '14px',
                                        background: '#f3f4f6',
                                        color: '#111',
                                        border: 'none',
                                        borderRadius: '14px',
                                        fontSize: '15px',
                                        fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Close
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleLeadSubmit} style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '16px'
                            }}>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        color: '#374151',
                                        marginBottom: '6px'
                                    }}>
                                        Full Name *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={leadForm.name}
                                        onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '14px',
                                            borderRadius: '12px',
                                            border: '1px solid #e5e7eb',
                                            fontSize: '16px',
                                            outline: 'none'
                                        }}
                                        placeholder="John Doe"
                                    />
                                </div>

                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        color: '#374151',
                                        marginBottom: '6px'
                                    }}>
                                        Email Address *
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        value={leadForm.email}
                                        onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '14px',
                                            borderRadius: '12px',
                                            border: '1px solid #e5e7eb',
                                            fontSize: '16px',
                                            outline: 'none'
                                        }}
                                        placeholder="john@example.com"
                                    />
                                </div>

                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        color: '#374151',
                                        marginBottom: '6px'
                                    }}>
                                        Phone Number
                                    </label>
                                    <input
                                        type="tel"
                                        value={leadForm.phone}
                                        onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '14px',
                                            borderRadius: '12px',
                                            border: '1px solid #e5e7eb',
                                            fontSize: '16px',
                                            outline: 'none'
                                        }}
                                        placeholder="+63 912 345 6789"
                                    />
                                </div>

                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        color: '#374151',
                                        marginBottom: '6px'
                                    }}>
                                        Message
                                    </label>
                                    <textarea
                                        rows="4"
                                        value={leadForm.message}
                                        onChange={(e) => setLeadForm({ ...leadForm, message: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '14px',
                                            borderRadius: '12px',
                                            border: '1px solid #e5e7eb',
                                            fontSize: '16px',
                                            outline: 'none',
                                            resize: 'none'
                                        }}
                                        placeholder="I'm interested in this property..."
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={submittingLead}
                                    style={{
                                        width: '100%',
                                        padding: '16px',
                                        background: '#10b981',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '14px',
                                        fontSize: '16px',
                                        fontWeight: '700',
                                        cursor: submittingLead ? 'not-allowed' : 'pointer',
                                        opacity: submittingLead ? 0.7 : 1,
                                        marginTop: '8px'
                                    }}
                                >
                                    {submittingLead ? 'Sending...' : 'Send Inquiry'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* CSS Animations */}
            <style>{`
                .property-showcase {
                    -webkit-font-smoothing: antialiased;
                }
                .property-action-bar {
                    display: flex;
                }
                .property-action-bar button {
                    min-width: 0;
                }
                .property-key-features {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }
                @media (max-width: 720px) {
                    .property-showcase {
                        --action-bar-height: 60px;
                    }
                }
                @media (max-width: 520px) {
                    .property-showcase {
                        --action-bar-height: 56px;
                        --action-bar-gap: 10px;
                        --action-btn-padding: 14px 18px;
                        --action-btn-font: 15px;
                    }
                    .property-key-features {
                        grid-template-columns: 1fr;
                    }
                }
                @media (max-width: 420px) {
                    .property-action-bar {
                        flex-direction: column;
                    }
                    .property-action-bar button {
                        width: 100%;
                    }
                }
                @media (max-width: 360px) {
                    .property-showcase {
                        --action-btn-padding: 12px 16px;
                        --action-btn-font: 14px;
                    }
                }
                @keyframes bounce {
                    0%, 20%, 50%, 80%, 100% {
                        transform: translateX(-50%) translateY(0);
                    }
                    40% {
                        transform: translateX(-50%) translateY(-10px);
                    }
                    60% {
                        transform: translateX(-50%) translateY(-5px);
                    }
                }
                @keyframes slideUp {
                    from {
                        transform: translateY(100%);
                    }
                    to {
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
};

export default PropertyMediaShowcase;
