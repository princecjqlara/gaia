import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';
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

                    const supabase = getSupabaseClient();
                    if (!supabase) {
                        console.error('[VIEW TRACKING] Supabase client not available!');
                        return;
                    }

                    const { data: { session } } = await supabase.auth.getSession();

                    const insertData = {
                        property_id: selectedProperty.id,
                        property_title: selectedProperty.title,
                        viewer_id: session?.user?.id || null,
                        visitor_name: visitorName || null,
                        participant_id: participantId || null,
                        view_duration: 0,
                        viewed_at: new Date().toISOString(),
                        source: participantId ? 'fb_messenger' : (visitorName ? 'custom_link' : 'website')
                    };

                    console.log('[VIEW TRACKING] Insert data:', JSON.stringify(insertData));

                    const { data, error } = await supabase.from('property_views').insert(insertData).select();

                    if (error) {
                        console.error('[VIEW TRACKING] ❌ Error logging view:', error);
                    } else {
                        console.log('[VIEW TRACKING] ✅ Successfully logged view!', data);

                        // If this is from Messenger, schedule a follow-up message about the property click
                        if (participantId) {
                            try {
                                // Find the conversation for this participant
                                const { data: conv } = await supabase
                                    .from('facebook_conversations')
                                    .select('conversation_id, page_id')
                                    .eq('participant_id', participantId)
                                    .single();

                                if (conv) {
                                    // Schedule a quick follow-up message (2 minutes to ensure processor catches it)
                                    const scheduledFor = new Date(Date.now() + 2 * 60 * 1000).toISOString();
                                    const messageText = `👋 I noticed you're checking out "${selectedProperty.title}"! Great choice! 🏠\n\nIf you have any questions about this property or would like to schedule a viewing, just let me know. I'm here to help! 😊`;

                                    const { error: scheduleError } = await supabase.from('scheduled_messages').insert({
                                        page_id: conv.page_id,
                                        message_text: messageText,
                                        scheduled_for: scheduledFor,
                                        status: 'pending',
                                        filter_type: 'selected',
                                        recipient_ids: [participantId]
                                    });

                                    if (scheduleError) {
                                        console.error('[VIEW TRACKING] Error inserting scheduled message:', scheduleError);
                                    } else {
                                        console.log('[VIEW TRACKING] ✅ Scheduled property click follow-up message for', scheduledFor);
                                    }
                                }
                            } catch (scheduleError) {
                                console.error('[VIEW TRACKING] Error scheduling follow-up:', scheduleError);
                            }
                        }
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
        const media = [
            ...(selectedProperty.images || []),
            ...(selectedProperty.videos || [])
        ];

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

    // Client View: Listings Page
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
                .listing-grid {
                     display: grid;
                     grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                     gap: 2rem;
                }
                .hero-h1 { font-size: 3.5rem; }
                @media (max-width: 768px) {
                    .listing-grid {
                        grid-template-columns: 1fr;
                        gap: 1.5rem;
                        padding: 0 1rem;
                    }
                    .hero-h1 { font-size: 2.5rem !important; }
                    .listing-container {
                        padding: 2rem 1rem !important;
                    }
                }
                `}
            </style>

            {/* Banner */}
            <div style={{
                height: '400px',
                background: `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${branding.hero_image_url || DEFAULT_BRANDING.hero_image_url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: 'white'
            }}>
                <div style={{ maxWidth: '800px', padding: '0 2rem' }}>
                    <h1 className="hero-h1" style={{ fontWeight: '800', marginBottom: '1rem', textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>{branding.tagline}</h1>
                    <p style={{ fontSize: '1.25rem', opacity: 0.9 }}>{branding.subtitle}</p>

                    {/* Featured Quick Stats */}
                    {branding.stats && branding.stats.length > 0 && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            gap: '2rem',
                            marginTop: '2.5rem',
                            flexWrap: 'wrap'
                        }}>
                            {branding.stats.slice(0, 3).map((stat, idx) => (
                                <div key={idx} style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.75rem', fontWeight: '800', color: branding.primary_color }}>{stat.value}</div>
                                    <div style={{ fontSize: '0.875rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>



            {/* Floating Header with Search */}
            <div style={{
                position: 'sticky',
                top: 0,
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(10px)',
                padding: '1rem 2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {branding.logo_url && (
                        <img src={branding.logo_url} alt="Logo" style={{ height: '36px', width: 'auto', borderRadius: '6px' }} />
                    )}
                    <span style={{ fontWeight: '800', fontSize: '1.5rem', color: branding.primary_color }}>{branding.team_display_name}</span>
                </div>


                {/* Search Bar */}
                <div style={{ flex: 1, maxWidth: '500px', margin: '0 2rem' }}>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                        <input
                            type="text"
                            placeholder="Search location, title..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem 0.75rem 2.75rem',
                                borderRadius: '999px',
                                border: '1px solid #e5e7eb',
                                background: '#f9fafb',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>

                <button
                    onClick={onClose}
                    style={{
                        background: '#000',
                        color: '#fff',
                        border: 'none',
                        padding: '0.5rem 1.5rem',
                        borderRadius: '999px',
                        cursor: 'pointer',
                        fontWeight: '600'
                    }}
                >
                    Exit Preview
                </button>
            </div>

            {/* Listing Grid */}
            <div className="listing-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '4rem 1.5rem' }}>
                {/* Featured Listings Section */}
                {properties.some(p => p.is_featured) && (
                    <div style={{ marginBottom: '5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#111827' }}>⭐ Featured Properties</h2>
                            <div style={{ height: '2px', flex: 1, background: '#f3f4f6', margin: '0 2rem' }}></div>
                        </div>
                        <div className="listing-grid">
                            {properties.filter(p => p.is_featured).slice(0, 3).map(property => (
                                <div
                                    key={`featured-${property.id}`}
                                    onClick={() => setSelectedProperty(property)}
                                    style={{
                                        position: 'relative',
                                        background: 'white',
                                        borderRadius: '20px',
                                        overflow: 'hidden',
                                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                                        cursor: 'pointer',
                                        border: `2px solid ${branding.primary_color}22`
                                    }}
                                >
                                    <div style={{ height: '300px', position: 'relative' }}>
                                        <img
                                            src={property.images && property.images[0] ? property.images[0] : 'https://images.unsplash.com/photo-1600596542815-27bfef402399?q=80&w=2070'}
                                            alt={property.title}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                        <div style={{
                                            position: 'absolute',
                                            top: '1.25rem',
                                            right: '1.25rem',
                                            background: branding.primary_color,
                                            color: 'white',
                                            padding: '0.5rem 1rem',
                                            borderRadius: '999px',
                                            fontSize: '0.8rem',
                                            fontWeight: '700',
                                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                                        }}>
                                            FEATURED
                                        </div>
                                        {property.label && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '1.25rem',
                                                left: '1.25rem',
                                                background: '#000',
                                                color: 'white',
                                                padding: '0.5rem 1rem',
                                                borderRadius: '999px',
                                                fontSize: '0.8rem',
                                                fontWeight: '600'
                                            }}>
                                                {property.label}
                                            </div>
                                        )}
                                        <div style={{
                                            position: 'absolute',
                                            bottom: 0,
                                            left: 0,
                                            right: 0,
                                            padding: '2rem 1.5rem 1rem',
                                            background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                                            color: 'white'
                                        }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>₱ {parseFloat(property.price).toLocaleString()}</div>
                                            <div style={{ fontSize: '1rem', opacity: 0.9 }}>{property.address}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '2.25rem', fontWeight: 'bold', color: '#111827', marginBottom: '1rem' }}>Latest Listings</h2>
                    <div style={{ width: '80px', height: '4px', background: branding.primary_color, margin: '0 auto' }}></div>
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
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                                    transition: 'transform 0.2s',
                                    cursor: 'pointer',
                                    border: '1px solid #f3f4f6'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                {/* Image */}
                                <div style={{ height: '240px', position: 'relative' }}>
                                    <img
                                        src={property.images && property.images[0] ? property.images[0] : 'https://images.unsplash.com/photo-1600596542815-27bfef402399?q=80&w=2070'}
                                        alt={property.title}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        top: '1rem',
                                        left: '1rem',
                                        background: property.status === 'For Sale' ? '#10b981' : '#3b82f6',
                                        color: 'white',
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '999px',
                                        fontSize: '0.75rem',
                                        fontWeight: '600'
                                    }}>
                                        {property.status}
                                    </div>
                                    {property.videos && property.videos.length > 0 && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '1rem',
                                            right: '1rem',
                                            background: 'rgba(0,0,0,0.6)',
                                            color: 'white',
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.8rem'
                                        }}>
                                            ▶️
                                        </div>
                                    )}
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '0',
                                        left: '0',
                                        right: '0',
                                        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                                        padding: '1.5rem 1rem 0.75rem',
                                        color: 'white'
                                    }}>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>₱ {parseFloat(property.price).toLocaleString()}</div>
                                    </div>
                                </div>

                                {/* Info */}
                                <div style={{ padding: '1.5rem' }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {property.title}
                                    </h3>
                                    <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        📍 {property.address}
                                    </p>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
                                        <div style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                                            <div style={{ fontWeight: '600', color: '#374151' }}>{property.bedrooms}</div>
                                            <div style={{ color: '#9ca3af' }}>Beds</div>
                                        </div>
                                        <div style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                                            <div style={{ fontWeight: '600', color: '#374151' }}>{property.bathrooms}</div>
                                            <div style={{ color: '#9ca3af' }}>Baths</div>
                                        </div>
                                        <div style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                                            <div style={{ fontWeight: '600', color: '#374151' }}>{property.floorArea}</div>
                                            <div style={{ color: '#9ca3af' }}>sqm</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                </div>

                {properties.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '1.2rem', marginTop: '4rem' }}>
                        No properties listed at the moment.
                    </div>
                )}
            </div>

            {/* Footer */}
            <footer style={{ background: '#111827', color: 'white', padding: '4rem 2rem', textAlign: 'center' }}>
                {branding.logo_url && (
                    <img src={branding.logo_url} alt="Logo" style={{ height: '50px', marginBottom: '1rem', borderRadius: '8px' }} />
                )}
                <div style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', color: branding.primary_color }}>{branding.team_display_name}</div>
                <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>Premium Real Estate Portfolio</p>

                {/* Social Media Links */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    {branding.facebook_url && (
                        <a href={branding.facebook_url} target="_blank" rel="noopener noreferrer" style={{
                            width: '44px', height: '44px', borderRadius: '50%', background: '#3b5998', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
                            textDecoration: 'none', transition: 'transform 0.2s'
                        }} onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'} onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}>
                            📘
                        </a>
                    )}
                    {branding.instagram_url && (
                        <a href={branding.instagram_url} target="_blank" rel="noopener noreferrer" style={{
                            width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
                            textDecoration: 'none', transition: 'transform 0.2s'
                        }} onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'} onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}>
                            📸
                        </a>
                    )}
                    {branding.website_url && (
                        <a href={branding.website_url} target="_blank" rel="noopener noreferrer" style={{
                            width: '44px', height: '44px', borderRadius: '50%', background: '#6366f1', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
                            textDecoration: 'none', transition: 'transform 0.2s'
                        }} onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'} onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}>
                            🌐
                        </a>
                    )}
                </div>

                {/* Contact Info */}
                {(branding.contact_phone || branding.contact_email) && (
                    <div style={{ marginBottom: '1rem', opacity: 0.8, fontSize: '0.95rem' }}>
                        {branding.contact_phone && <span>📞 {branding.contact_phone}</span>}
                        {branding.contact_phone && branding.contact_email && <span style={{ margin: '0 0.75rem' }}>|</span>}
                        {branding.contact_email && <span>✉️ {branding.contact_email}</span>}
                    </div>
                )}
                {branding.address && (
                    <div style={{ marginBottom: '1rem', opacity: 0.7, fontSize: '0.9rem' }}>📍 {branding.address}</div>
                )}

                <div style={{ marginTop: '2rem', opacity: 0.5, fontSize: '0.875rem' }}>© 2026 {branding.team_display_name}. All rights reserved.</div>
            </footer>

            {/* Floating WhatsApp Button */}
            {branding.whatsapp_url && (
                <a
                    href={branding.whatsapp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        position: 'fixed',
                        bottom: '2rem',
                        right: '2rem',
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        background: '#25d366',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                        zIndex: 100,
                        transition: 'transform 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
                    onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                >
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="white">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.938 3.659 1.432 5.631 1.433h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                </a>
            )}
        </div>
    );
};


export default PropertyPreview;
