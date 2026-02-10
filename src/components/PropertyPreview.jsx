import React, { useState, useEffect } from 'react';
import { initSupabase, getSupabaseClient } from '../services/supabase';
import { createPropertyLead } from '../services/leadService';
import { showToast } from '../utils/toast';



const DEFAULT_BRANDING = {
    logo_url: null,
    team_display_name: 'GAIA',
    tagline: 'Find Your Dream Home',
    subtitle: 'Browse our exclusive portfolio of premium properties.',
    hero_image_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=2070',
    primary_color: '#10b981',
    contact_phone: null,
    contact_email: null,
    facebook_url: null,
    instagram_url: null,
    whatsapp_url: null,
    website_url: null,
    address: null,
    bio: '',
    stats: []
};

const PropertyPreview = ({ properties = [], onClose, branding: propBranding, teamId, organizationId, initialProperty = null, onPropertySelect, visitorName, participantId }) => {
    const branding = { ...DEFAULT_BRANDING, ...propBranding };
    const [selectedProperty, setSelectedPropertyState] = useState(initialProperty);

    const setSelectedProperty = (property) => {
        setSelectedPropertyState(property);
        if (onPropertySelect) {
            onPropertySelect(property);
        }
    };
    const [searchQuery, setSearchQuery] = useState('');
    const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', message: '' });
    const [submittingLead, setSubmittingLead] = useState(false);

    const [activeImageIndex, setActiveImageIndex] = useState(0);

    // Log view when property is selected
    useEffect(() => {
        if (selectedProperty) {
            const logView = async () => {
                try {
                    console.log('[VIEW TRACKING] Starting view log for:', selectedProperty.title);
                    console.log('[VIEW TRACKING] Participant ID:', participantId);
                    console.log('[VIEW TRACKING] Visitor Name:', visitorName);
                    console.log('[VIEW TRACKING] Property ID:', selectedProperty.id);

                    // For Messenger contacts (have participantId), use webhook to send immediate message
                    if (participantId) {
                        console.log('[VIEW TRACKING] Calling webhook for immediate message...');
                        try {
                            const webhookUrl = `${window.location.origin}/api/webhook`;
                            const response = await fetch(webhookUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    action: 'property_click',
                                    participantId,
                                    propertyId: selectedProperty.id,
                                    propertyTitle: selectedProperty.title
                                })
                            });

                            const result = await response.json();
                            console.log('[VIEW TRACKING] Webhook result:', result);

                            if (result.messageSent) {
                                console.log('[VIEW TRACKING] ✅ Message sent to contact!');
                            }
                            if (result.viewLogged) {
                                console.log('[VIEW TRACKING] ✅ View logged via webhook');
                            }
                            return; // Done - webhook handled everything
                        } catch (webhookError) {
                            console.warn('[VIEW TRACKING] Webhook failed, falling back to local:', webhookError.message);
                        }
                    }

                    // Fallback: Log directly to Supabase (for non-Messenger traffic or webhook failures)
                    initSupabase();
                    const supabase = getSupabaseClient();

                    if (!supabase) {
                        console.error('[VIEW TRACKING] Supabase client not available!');
                        return;
                    }

                    const insertData = {
                        property_id: selectedProperty.id,
                        property_title: selectedProperty.title,
                        visitor_name: visitorName || null,
                        participant_id: participantId || null,
                        view_duration: 0,
                        viewed_at: new Date().toISOString(),
                        source: participantId ? 'fb_messenger' : (visitorName ? 'custom_link' : 'website')
                    };

                    console.log('[VIEW TRACKING] Direct insert:', JSON.stringify(insertData));

                    const { data, error } = await supabase.from('property_views').insert(insertData).select();

                    if (error) {
                        console.error('[VIEW TRACKING] ❌ Error logging view:', error.message, error.code);
                    } else {
                        console.log('[VIEW TRACKING] ✅ Successfully logged view!', data);
                    }
                } catch (err) {
                    console.error('[VIEW TRACKING] Exception:', err);
                }
            };
            logView();
        }
    }, [selectedProperty, visitorName, participantId]);

    // Helper to get suggested properties
    const getSuggestedProperties = () => {
        if (!selectedProperty) return [];
        return properties
            .filter(p => p.id !== selectedProperty.id)
            .sort(() => 0.5 - Math.random()) // Shuffle
            .slice(0, 3);
    };

    const suggested = getSuggestedProperties();

    async function handleLeadSubmit(e) {
        e.preventDefault();
        setSubmittingLead(true);
        try {
            const { error } = await createPropertyLead({
                ...leadForm,
                property_id: selectedProperty.id,
                team_id: teamId,
                organization_id: organizationId
            });

            if (error) throw error;

            showToast('Thank you! We will contact you shortly.', 'success');
            setLeadForm({ name: '', email: '', phone: '', message: '' });
        } catch (err) {
            console.error('Error submitting lead:', err);
            showToast('Failed to send inquiry. Please try again.', 'error');
        } finally {
            setSubmittingLead(false);
        }
    }


    // Helper to check if URL is video
    const isVideo = (url) => {
        if (!url) return false;
        return url.includes('/video/') || url.match(/\.(mp4|webm|mov|ogg)$/i);
    };

    // Client View: Property Details Page
    if (selectedProperty) {
        const primaryUrl = selectedProperty.primary_media_url || selectedProperty.primaryMediaUrl || null;
        let media = [
            ...(selectedProperty.images || []),
            ...(selectedProperty.videos || [])
        ];
        if (primaryUrl) {
            media = [primaryUrl, ...media.filter((url) => url !== primaryUrl)];
        }

        const safeMedia = media.length > 0
            ? media
            : ['https://images.unsplash.com/photo-1600596542815-27bfef402399?q=80&w=2070'];

        return (
            <div style={{
                position: 'fixed',
                inset: 0,
                background: '#fff',
                zIndex: 2000,
                overflowY: 'auto',
                fontFamily: "'Inter', sans-serif"
            }}>
                <style>
                    {`
                    .details-container {
                        display: grid;
                        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
                        gap: 4rem;
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 3rem 1.5rem;
                    }
                    .hero-h1 { font-size: 3.5rem; }
                    .listing-grid {
                         display: grid;
                         grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                         gap: 2rem;
                    }
                    @media (max-width: 768px) {
                        .details-container {
                            grid-template-columns: 1fr;
                            gap: 2rem;
                            padding: 1.5rem;
                        }
                        .hero-h1 { font-size: 2.25rem !important; }
                        .listing-grid {
                            grid-template-columns: 1fr;
                        }
                        .sidebar-sticky {
                            position: static !important;
                        }
                    }
                    `}
                </style>

                {/* Navigation Bar */}
                <div style={{
                    position: 'sticky',
                    top: 0,
                    background: 'rgba(255,255,255,0.9)',
                    backdropFilter: 'blur(10px)',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                    zIndex: 50
                }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: '#111827' }}>GAIA Properties</div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => setSelectedProperty(null)}
                            style={{
                                background: 'transparent',
                                border: '1px solid #e5e7eb',
                                padding: '0.5rem 1rem',
                                borderRadius: '999px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '0.875rem'
                            }}
                        >
                            ← <span className="hidden-mobile">Listings</span>
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                background: '#000',
                                color: '#fff',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '999px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.875rem'
                            }}
                        >
                            Exit
                        </button>
                    </div>
                </div>

                {/* Hero Gallery */}
                <div style={{ height: '60vh', minHeight: '400px', position: 'relative', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isVideo(safeMedia[activeImageIndex]) ? (
                        <video
                            src={safeMedia[activeImageIndex]}
                            controls
                            autoPlay
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                    ) : (
                        <img
                            src={safeMedia[activeImageIndex]}
                            alt="Property"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    )}

                    {safeMedia.length > 1 && (
                        <div style={{
                            position: 'absolute',
                            bottom: '1rem',
                            right: '1rem',
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.9)',
                            borderRadius: '1rem',
                            display: 'flex',
                            gap: '0.5rem',
                            maxWidth: '90%',
                            overflowX: 'auto',
                            zIndex: 10
                        }}>
                            {safeMedia.map((mediaUrl, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setActiveImageIndex(idx)}
                                    style={{
                                        width: '60px',
                                        height: '40px',
                                        flexShrink: 0,
                                        border: activeImageIndex === idx ? '2px solid #000' : 'none',
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        opacity: activeImageIndex === idx ? 1 : 0.7,
                                        padding: 0,
                                        position: 'relative',
                                        background: '#000'
                                    }}
                                >
                                    {isVideo(mediaUrl) ? (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px' }}>▶️</div>
                                    ) : (
                                        <img src={mediaUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Content Container */}
                <div className="details-container">

                    {/* Main Info */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <div>
                                <span style={{
                                    background: selectedProperty.status === 'For Sale' ? '#dcfce7' : '#dbeafe',
                                    color: selectedProperty.status === 'For Sale' ? '#166534' : '#1e40af',
                                    padding: '4px 12px',
                                    borderRadius: '999px',
                                    fontSize: '0.875rem',
                                    fontWeight: '600',
                                    marginBottom: '0.5rem',
                                    display: 'inline-block'
                                }}>
                                    {selectedProperty.status}
                                </span>
                                <h1 style={{ lineHeight: 1.2, fontWeight: '800', color: '#111827', margin: 0 }} className="hero-h1">
                                    {selectedProperty.title}
                                </h1>
                                <p style={{ fontSize: '1.25rem', color: '#6b7280', marginTop: '0.5rem' }}>📍 {selectedProperty.address}</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', padding: '2rem 0', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', margin: '2rem 0', justifyContent: 'space-between', overflowX: 'auto' }}>
                            <div style={{ textAlign: 'center', minWidth: '60px' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>{selectedProperty.bedrooms}</div>
                                <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Beds</div>
                            </div>
                            <div style={{ borderLeft: '1px solid #e5e7eb' }} />
                            <div style={{ textAlign: 'center', minWidth: '60px' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>{selectedProperty.bathrooms}</div>
                                <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Baths</div>
                            </div>
                            <div style={{ borderLeft: '1px solid #e5e7eb' }} />
                            <div style={{ textAlign: 'center', minWidth: '80px' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>{selectedProperty.floorArea}</div>
                                <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>sqm</div>
                            </div>
                            <div style={{ borderLeft: '1px solid #e5e7eb' }} />
                            <div style={{ textAlign: 'center', minWidth: '60px' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>{selectedProperty.garage}</div>
                                <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Car</div>
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem' }}>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>About property</h3>
                            <p style={{ fontSize: '1.125rem', lineHeight: '1.8', color: '#4b5563', whiteSpace: 'pre-wrap' }}>
                                {selectedProperty.description || 'No description available.'}
                            </p>
                        </div>

                        <div style={{ marginTop: '3rem' }}>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#111827' }}>Key Features</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#374151' }}>
                                    <span style={{ color: '#10b981' }}>✓</span> Lot Area: {selectedProperty.lotArea} sqm
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#374151' }}>
                                    <span style={{ color: '#10b981' }}>✓</span> Year Built: {selectedProperty.yearBuilt}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#374151' }}>
                                    <span style={{ color: '#10b981' }}>✓</span> Property Type: {selectedProperty.type}
                                </div>
                            </div>
                        </div>

                        {/* Location Map */}
                        <div style={{ marginTop: '3rem' }}>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#111827' }}>Location</h3>
                            <div style={{
                                height: '300px',
                                background: '#e5e7eb',
                                borderRadius: '1rem',
                                overflow: 'hidden',
                                border: '1px solid #e5e7eb'
                            }}>
                                <iframe
                                    width="100%"
                                    height="100%"
                                    id="gmap_canvas"
                                    src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedProperty.address)}&t=&z=13&ie=UTF8&iwloc=&output=embed`}
                                    frameBorder="0"
                                    scrolling="no"
                                    marginHeight="0"
                                    marginWidth="0"
                                    title="Property Location"
                                ></iframe>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar - Contacts/Financials */}
                    <div className="sidebar-sticky" style={{ position: 'sticky', top: '100px', height: 'fit-content' }}>
                        <div style={{
                            background: '#fff',
                            borderRadius: '1.5rem',
                            padding: '1.5rem',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            border: '1px solid #e5e7eb'
                        }}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ fontSize: '0.875rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Listing Price</div>
                                <div style={{ fontSize: '2rem', fontWeight: '800', color: branding.primary_color }}>
                                    ₱ {parseFloat(selectedProperty.price).toLocaleString()}
                                </div>
                            </div>

                            <form onSubmit={handleLeadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <input
                                    type="text"
                                    placeholder="Full Name"
                                    required
                                    value={leadForm.name}
                                    onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
                                    style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                                />
                                <input
                                    type="email"
                                    placeholder="Email Address"
                                    required
                                    value={leadForm.email}
                                    onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                                    style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                                />
                                <input
                                    type="tel"
                                    placeholder="Phone Number"
                                    value={leadForm.phone}
                                    onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                                    style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                                />
                                <textarea
                                    placeholder="I'm interested in this property..."
                                    rows="3"
                                    value={leadForm.message}
                                    onChange={(e) => setLeadForm({ ...leadForm, message: e.target.value })}
                                    style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb', resize: 'none' }}
                                />
                                <button
                                    type="submit"
                                    disabled={submittingLead}
                                    style={{
                                        width: '100%',
                                        padding: '1rem',
                                        background: branding.primary_color,
                                        color: 'white',
                                        borderRadius: '12px',
                                        fontWeight: '600',
                                        fontSize: '1.125rem',
                                        border: 'none',
                                        cursor: 'pointer',
                                        marginTop: '0.5rem',
                                        transition: 'opacity 0.2s'
                                    }}
                                >
                                    {submittingLead ? 'Sending...' : 'Inquire Now'}
                                </button>
                            </form>

                            {/* Team Bio / Profile */}
                            {branding.bio && (
                                <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {branding.logo_url && <img src={branding.logo_url} style={{ height: '20px' }} alt="" />}
                                        Meet the Team
                                    </h4>
                                    <p style={{
                                        fontSize: '0.9rem',
                                        lineHeight: '1.6',
                                        color: '#4b5563',
                                        fontStyle: 'italic',
                                        background: '#f9fafb',
                                        padding: '1rem',
                                        borderRadius: '8px',
                                        border: '1px solid #f3f4f6'
                                    }}>
                                        "{branding.bio}"
                                    </p>
                                </div>
                            )}

                            <button style={{
                                width: '100%',
                                padding: '1rem',
                                background: '#fff',
                                color: '#111827',
                                borderRadius: '12px',
                                fontWeight: '600',
                                fontSize: '1.125rem',
                                border: '1px solid #111827',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem'
                            }}>
                                📞 Schedule
                            </button>

                            {/* Financials Breakdown */}
                            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#111827' }}>Estimation</h4>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#374151' }}>
                                    <span style={{ color: '#6b7280' }}>Down Payment</span>
                                    <span style={{ fontWeight: '500', color: '#111827' }}>₱ {parseFloat(selectedProperty.downPayment).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#374151' }}>
                                    <span style={{ color: '#6b7280' }}>Monthly</span>
                                    <span style={{ fontWeight: '500', color: '#111827' }}>₱ {parseFloat(selectedProperty.monthlyAmortization).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', background: '#f9fafb', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #e5e7eb' }}>
                            <h4 style={{ margin: '0 0 0.5rem 0', color: '#111827' }}>Agent Notes</h4>
                            <p style={{ fontSize: '0.9rem', color: '#6b7280', fontStyle: 'italic' }}>
                                Payment Terms: {selectedProperty.paymentTerms}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Similar Properties Section */}
                <div style={{ background: '#f9fafb', padding: '4rem 1.5rem', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem', color: '#111827' }}>You might also like</h2>
                        <div className="listing-grid">
                            {suggested.map(property => (
                                <div
                                    key={property.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedProperty(property);
                                        window.scrollTo(0, 0);
                                    }}
                                    style={{
                                        background: 'white',
                                        borderRadius: '16px',
                                        overflow: 'hidden',
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                        cursor: 'pointer',
                                        border: '1px solid #e5e7eb'
                                    }}
                                >
                                    <div style={{ height: '200px', position: 'relative' }}>
                                        <img
                                            src={property.images && property.images[0] ? property.images[0] : 'https://images.unsplash.com/photo-1600596542815-27bfef402399?q=80&w=2070'}
                                            alt={property.title}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                        <span style={{
                                            position: 'absolute', top: '1rem', left: '1rem',
                                            padding: '0.25rem 0.75rem', background: 'rgba(0,0,0,0.7)',
                                            color: 'white', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold'
                                        }}>
                                            ₱ {parseFloat(property.price).toLocaleString()}
                                        </span>
                                    </div>
                                    <div style={{ padding: '1.5rem' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{property.title}</h3>
                                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                            {property.bedrooms} Bed • {property.bathrooms} Bath • {property.floorArea} sqm
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Client View: Listings Page - Instagram Style
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: '#fff',
            zIndex: 2000,
            overflowY: 'auto',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        }}>
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
                
                .listing-grid {
                     display: grid;
                     grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                     gap: 1.5rem;
                }
                .featured-grid {
                     display: grid;
                     grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                     gap: 1.5rem;
                }
                @media (max-width: 768px) {
                    .listing-grid, .featured-grid {
                        grid-template-columns: 1fr;
                        gap: 1rem;
                    }
                }
                `}
            </style>

            {/* Hero Banner */}
            <div style={{
                height: '420px',
                background: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.5)), url(${branding.hero_image_url || DEFAULT_BRANDING.hero_image_url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: 'white',
                position: 'relative'
            }}>
                <div style={{ maxWidth: '800px', padding: '0 2rem' }}>
                    <h1 style={{ 
                        fontSize: 'clamp(2rem, 5vw, 3rem)', 
                        fontWeight: '800', 
                        marginBottom: '0.75rem',
                        textShadow: '0 2px 10px rgba(0,0,0,0.3)'
                    }}>
                        {branding.tagline || 'Find Your Dream Home'}
                    </h1>
                    <p style={{ 
                        fontSize: '1rem', 
                        opacity: 0.9,
                        marginBottom: '2rem',
                        maxWidth: '500px',
                        margin: '0 auto 2rem'
                    }}>
                        {branding.subtitle || 'Browse our exclusive portfolio of premium properties.'}
                    </p>

                    {/* Stats Row */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '3rem',
                        flexWrap: 'wrap'
                    }}>
                        {(branding.stats && branding.stats.length > 0 ? branding.stats.slice(0, 3) : [
                            { value: '10+', label: 'Years of Experience' },
                            { value: '500+', label: 'Properties Sold' },
                            { value: '1000+', label: 'Happy Clients' }
                        ]).map((stat, idx) => (
                            <div key={idx} style={{ textAlign: 'center' }}>
                                <div style={{ 
                                    fontSize: '1.75rem', 
                                    fontWeight: '800', 
                                    color: '#10b981',
                                    marginBottom: '0.25rem'
                                }}>
                                    {stat.value}
                                </div>
                                <div style={{ 
                                    fontSize: '0.75rem', 
                                    opacity: 0.8,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    fontWeight: '500'
                                }}>
                                    {stat.label}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'rgba(0,0,0,0.5)',
                        color: '#fff',
                        border: 'none',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backdropFilter: 'blur(10px)'
                    }}
                >
                    ✕
                </button>
            </div>

            {/* Search Bar Section */}
            <div style={{
                background: '#fff',
                padding: '1.5rem 2rem',
                borderBottom: '1px solid #e5e7eb'
            }}>
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <div style={{ position: 'relative' }}>
                        <span style={{ 
                            position: 'absolute', 
                            left: '1rem', 
                            top: '50%', 
                            transform: 'translateY(-50%)',
                            color: '#9ca3af',
                            fontSize: '1rem'
                        }}>🔍</span>
                        <input
                            type="text"
                            placeholder="Search location, title..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.875rem 1rem 0.875rem 3rem',
                                borderRadius: '999px',
                                border: '1px solid #e5e7eb',
                                background: '#f9fafb',
                                outline: 'none',
                                fontSize: '0.95rem',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                
                {/* Featured Properties Section */}
                {properties.some(p => p.is_featured) && (
                    <div style={{ marginBottom: '3rem' }}>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.75rem',
                            marginBottom: '1.5rem'
                        }}>
                            <span style={{ fontSize: '1.25rem' }}>⭐</span>
                            <h2 style={{ 
                                fontSize: '1.25rem', 
                                fontWeight: '700', 
                                color: '#111827' 
                            }}>
                                Featured Properties
                            </h2>
                        </div>
                        
                        <div className="featured-grid">
                            {properties.filter(p => p.is_featured).slice(0, 3).map(property => (
                                <div
                                    key={`featured-${property.id}`}
                                    onClick={() => setSelectedProperty(property)}
                                    style={{
                                        position: 'relative',
                                        background: 'white',
                                        borderRadius: '16px',
                                        overflow: 'hidden',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                        cursor: 'pointer',
                                        border: '1px solid #e5e7eb'
                                    }}
                                >
                                    <div style={{ height: '240px', position: 'relative' }}>
                                        <img
                                            src={property.images && property.images[0] ? property.images[0] : 'https://images.unsplash.com/photo-1600596542815-27bfef402399?q=80&w=2070'}
                                            alt={property.title}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                        <div style={{
                                            position: 'absolute',
                                            top: '0.75rem',
                                            right: '0.75rem',
                                            background: '#10b981',
                                            color: 'white',
                                            padding: '0.375rem 0.875rem',
                                            borderRadius: '999px',
                                            fontSize: '0.75rem',
                                            fontWeight: '700'
                                        }}>
                                            FEATURED
                                        </div>
                                        <div style={{
                                            position: 'absolute',
                                            bottom: 0,
                                            left: 0,
                                            right: 0,
                                            padding: '2rem 1rem 0.75rem',
                                            background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                                            color: 'white'
                                        }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: '700' }}>
                                                ₱ {parseFloat(property.price).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '1rem' }}>
                                        <h3 style={{ 
                                            fontSize: '0.9rem', 
                                            fontWeight: '600', 
                                            color: '#111827',
                                            marginBottom: '0.25rem',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {property.title}
                                        </h3>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                            {property.address}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Latest Listings Section */}
                <div style={{ marginBottom: '3rem' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <h2 style={{ 
                            fontSize: '1.5rem', 
                            fontWeight: '700', 
                            color: '#111827',
                            marginBottom: '0.5rem'
                        }}>
                            Latest Listings
                        </h2>
                        <div style={{ 
                            width: '50px', 
                            height: '3px', 
                            background: '#10b981', 
                            margin: '0 auto',
                            borderRadius: '2px'
                        }}></div>
                    </div>

                    <div className="listing-grid">
                        {properties
                            .filter(p =>
                                !searchQuery ||
                                p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                p.address.toLowerCase().includes(searchQuery.toLowerCase())
                            )
                            .map(property => (
                                <div
                                    key={property.id}
                                    onClick={() => setSelectedProperty(property)}
                                    style={{
                                        background: 'white',
                                        borderRadius: '16px',
                                        overflow: 'hidden',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                        cursor: 'pointer',
                                        border: '1px solid #e5e7eb',
                                        transition: 'transform 0.2s, box-shadow 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-4px)';
                                        e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.15)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                                    }}
                                >
                                    {/* Image */}
                                    <div style={{ height: '200px', position: 'relative' }}>
                                        <img
                                            src={property.images && property.images[0] ? property.images[0] : 'https://images.unsplash.com/photo-1600596542815-27bfef402399?q=80&w=2070'}
                                            alt={property.title}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                        <div style={{
                                            position: 'absolute',
                                            top: '0.75rem',
                                            left: '0.75rem',
                                            background: '#10b981',
                                            color: 'white',
                                            padding: '0.25rem 0.625rem',
                                            borderRadius: '999px',
                                            fontSize: '0.7rem',
                                            fontWeight: '600'
                                        }}>
                                            {property.status || 'For Sale'}
                                        </div>
                                        {property.videos && property.videos.length > 0 && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '0.75rem',
                                                right: '0.75rem',
                                                background: 'rgba(0,0,0,0.6)',
                                                color: 'white',
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.7rem'
                                            }}>
                                                ▶
                                            </div>
                                        )}
                                        <div style={{
                                            position: 'absolute',
                                            bottom: 0,
                                            left: 0,
                                            right: 0,
                                            padding: '1.5rem 1rem 0.5rem',
                                            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                                            color: 'white'
                                        }}>
                                            <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                                                ₱ {parseFloat(property.price).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div style={{ padding: '1rem' }}>
                                        <h3 style={{ 
                                            fontSize: '1rem', 
                                            fontWeight: '600', 
                                            color: '#111827',
                                            marginBottom: '0.25rem',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {property.title}
                                        </h3>
                                        <p style={{ 
                                            color: '#ef4444', 
                                            fontSize: '0.8rem', 
                                            marginBottom: '0.75rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                        }}>
                                            📍 {property.address}
                                        </p>

                                        <div style={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-around',
                                            borderTop: '1px solid #f3f4f6', 
                                            paddingTop: '0.75rem'
                                        }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ 
                                                    fontWeight: '600', 
                                                    color: '#374151',
                                                    fontSize: '0.9rem'
                                                }}>
                                                    {property.bedrooms}
                                                </div>
                                                <div style={{ 
                                                    color: '#9ca3af',
                                                    fontSize: '0.7rem'
                                                }}>
                                                    Beds
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ 
                                                    fontWeight: '600', 
                                                    color: '#374151',
                                                    fontSize: '0.9rem'
                                                }}>
                                                    {property.bathrooms}
                                                </div>
                                                <div style={{ 
                                                    color: '#9ca3af',
                                                    fontSize: '0.7rem'
                                                }}>
                                                    Baths
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ 
                                                    fontWeight: '600', 
                                                    color: '#374151',
                                                    fontSize: '0.9rem'
                                                }}>
                                                    {property.floorArea}
                                                </div>
                                                <div style={{ 
                                                    color: '#9ca3af',
                                                    fontSize: '0.7rem'
                                                }}>
                                                    sqm
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </div>

                    {properties.length === 0 && (
                        <div style={{ 
                            textAlign: 'center', 
                            color: '#6b7280', 
                            fontSize: '1.1rem', 
                            marginTop: '3rem',
                            padding: '3rem'
                        }}>
                            No properties listed at the moment.
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <footer style={{ 
                background: '#1f2937', 
                color: 'white', 
                padding: '2rem',
                textAlign: 'center'
            }}>
                <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: '500',
                    marginBottom: '0.5rem',
                    opacity: 0.9
                }}>
                    Premium Real Estate Portfolio
                </div>
                <div style={{ 
                    fontSize: '0.75rem',
                    opacity: 0.6
                }}>
                    © 2026 {branding.team_display_name || 'GAIA'}. All rights reserved.
                </div>
            </footer>
        </div>
    );
};


export default PropertyPreview;
