import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

const PropertyPreview = ({ properties = [], onClose }) => {
    const [selectedProperty, setSelectedProperty] = useState(null);
    const [activeImageIndex, setActiveImageIndex] = useState(0);

    // Log view when property is selected
    useEffect(() => {
        if (selectedProperty) {
            const logView = async () => {
                try {
                    const supabase = getSupabaseClient();
                    if (!supabase) return;

                    // Check if we have a session to get user_id (optional, or anonymous)
                    const { data: { session } } = await supabase.auth.getSession();

                    await supabase.from('property_views').insert({
                        property_id: selectedProperty.id,
                        property_title: selectedProperty.title,
                        viewer_id: session?.user?.id || null, // Null for anonymous
                        view_duration: 0,
                        viewed_at: new Date().toISOString()
                    });
                    console.log('Logged view for', selectedProperty.title);
                } catch (err) {
                    console.error('Error logging view:', err);
                }
            };
            logView();
        }
    }, [selectedProperty]);

    const [searchQuery, setSearchQuery] = useState('');

    // Helper to get suggested properties
    const getSuggestedProperties = () => {
        if (!selectedProperty) return [];
        return properties
            .filter(p => p.id !== selectedProperty.id)
            .sort(() => 0.5 - Math.random()) // Shuffle
            .slice(0, 3);
    };

    const suggested = getSuggestedProperties();

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
                                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#10b981' }}>
                                    ₱ {parseFloat(selectedProperty.price).toLocaleString()}
                                </div>
                            </div>

                            <button style={{
                                width: '100%',
                                padding: '1rem',
                                background: '#111827',
                                color: 'white',
                                borderRadius: '12px',
                                fontWeight: '600',
                                fontSize: '1.125rem',
                                border: 'none',
                                cursor: 'pointer',
                                marginBottom: '1rem',
                                transition: 'transform 0.1s'
                            }}>
                                Inquire Now
                            </button>

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
                background: 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=2070)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: 'white'
            }}>
                <div style={{ maxWidth: '800px', padding: '0 2rem' }}>
                    <h1 className="hero-h1" style={{ fontWeight: '800', marginBottom: '1rem', textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>Find Your Dream Home</h1>
                    <p style={{ fontSize: '1.25rem', opacity: 0.9 }}>Browse our exclusive portfolio of premium properties.</p>
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
                <div style={{ fontWeight: '800', fontSize: '1.5rem', color: '#10b981', tracking: '-0.025em' }}>GAIA</div>

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
                <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '2.25rem', fontWeight: 'bold', color: '#111827', marginBottom: '1rem' }}>Latest Listings</h2>
                    <div style={{ width: '80px', height: '4px', background: '#10b981', margin: '0 auto' }}></div>
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
                <div style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '1rem', color: '#10b981' }}>GAIA</div>
                <p style={{ opacity: 0.7 }}>Premium Real Estate Portfolio</p>
                <div style={{ marginTop: '2rem', opacity: 0.5, fontSize: '0.875rem' }}>© 2026 Gaia Properties. All rights reserved.</div>
            </footer>
        </div>
    );
};

export default PropertyPreview;
