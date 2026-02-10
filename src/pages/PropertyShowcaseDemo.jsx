import React, { useState } from 'react';
import PropertyMediaShowcase from '../components/PropertyMediaShowcase';

/**
 * Demo page for Property Media Showcase
 * 
 * Use this page to test and preview the immersive property showcase UI
 * URL: /demo/property-showcase
 */

const DEMO_PROPERTIES = [
    {
        id: 'demo-1',
        title: 'Modern Condo in Makati',
        address: 'Ayala Avenue, Makati City',
        price: '8500000',
        bedrooms: 2,
        bathrooms: 2,
        floorArea: 65,
        lotArea: 0,
        yearBuilt: 2020,
        type: 'Condominium',
        garage: 1,
        description: 'Experience luxury living in the heart of Makati CBD. This modern 2-bedroom condo features floor-to-ceiling windows with stunning city views, designer kitchen, and access to world-class amenities including pool, gym, and sky lounge. Perfect for young professionals and investors.',
        downPayment: '1700000',
        monthlyAmortization: '45000',
        images: [
            'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800',
            'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
            'https://images.unsplash.com/photo-1484154218962-a1c002085d2f?w=800'
        ],
        videos: [
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
        ]
    },
    {
        id: 'demo-2',
        title: 'Luxury House in Alabang',
        address: 'Ayala Alabang Village, Muntinlupa',
        price: '25000000',
        bedrooms: 4,
        bathrooms: 3,
        floorArea: 350,
        lotArea: 500,
        yearBuilt: 2018,
        type: 'House & Lot',
        garage: 3,
        description: 'Stunning modern house in exclusive Ayala Alabang. Features 4 spacious bedrooms, high ceilings, designer finishes, and a beautiful garden. The gated community offers 24/7 security, clubhouse, and parks. Ideal for families seeking luxury and privacy.',
        downPayment: '5000000',
        monthlyAmortization: '125000',
        images: [
            'https://images.unsplash.com/photo-1600596542815-27bfef402399?w=800',
            'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
            'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
            'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800'
        ],
        videos: []
    },
    {
        id: 'demo-3',
        title: 'Beachfront Villa in Batangas',
        address: 'Nasugbu, Batangas',
        price: '18000000',
        bedrooms: 3,
        bathrooms: 2,
        floorArea: 200,
        lotArea: 800,
        yearBuilt: 2019,
        type: 'House & Lot',
        garage: 2,
        description: 'Your own paradise by the sea! This beachfront villa offers breathtaking ocean views, private beach access, and a spacious layout perfect for vacation or retirement. Features open-concept living, modern kitchen, and outdoor entertainment area.',
        downPayment: '3600000',
        monthlyAmortization: '90000',
        images: [
            'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=800',
            'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800',
            'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800'
        ],
        videos: [
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
        ]
    }
];

const DEMO_BRANDING = {
    primary_color: '#10b981',
    team_display_name: 'GAIA Properties',
    logo_url: null
};

const PropertyShowcaseDemo = () => {
    const [showShowcase, setShowShowcase] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    if (showShowcase) {
        return (
            <PropertyMediaShowcase
                properties={DEMO_PROPERTIES}
                branding={DEMO_BRANDING}
                initialPropertyIndex={currentIndex}
                onClose={() => setShowShowcase(false)}
                visitorName="Demo User"
                participantId="demo-participant-123"
                teamId="demo-team"
                organizationId="demo-org"
            />
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: '#f9fafb',
            padding: '2rem',
            fontFamily: "'Inter', sans-serif"
        }}>
            <div style={{
                maxWidth: '800px',
                margin: '0 auto',
                background: '#fff',
                borderRadius: '16px',
                padding: '2rem',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
            }}>
                <h1 style={{
                    fontSize: '2rem',
                    fontWeight: '800',
                    marginBottom: '0.5rem',
                    color: '#111827'
                }}>
                    Property Showcase Demo
                </h1>
                <p style={{
                    color: '#6b7280',
                    marginBottom: '2rem'
                }}>
                    Preview the TikTok-style immersive property viewing experience
                </p>

                <div style={{
                    display: 'grid',
                    gap: '1rem',
                    marginBottom: '2rem'
                }}>
                    {DEMO_PROPERTIES.map((property, index) => (
                        <div
                            key={property.id}
                            style={{
                                display: 'flex',
                                gap: '1rem',
                                padding: '1rem',
                                background: '#f9fafb',
                                borderRadius: '12px',
                                border: '2px solid transparent',
                                borderColor: currentIndex === index ? '#10b981' : 'transparent',
                                cursor: 'pointer'
                            }}
                            onClick={() => setCurrentIndex(index)}
                        >
                            <img
                                src={property.images[0]}
                                alt={property.title}
                                style={{
                                    width: '100px',
                                    height: '100px',
                                    objectFit: 'cover',
                                    borderRadius: '8px'
                                }}
                            />
                            <div style={{ flex: 1 }}>
                                <h3 style={{
                                    fontWeight: '700',
                                    marginBottom: '0.25rem',
                                    color: '#111827'
                                }}>
                                    {property.title}
                                </h3>
                                <p style={{
                                    fontSize: '0.875rem',
                                    color: '#6b7280',
                                    marginBottom: '0.5rem'
                                }}>
                                    {property.address}
                                </p>
                                <div style={{
                                    fontWeight: '700',
                                    color: '#10b981'
                                }}>
                                    ₱ {parseFloat(property.price).toLocaleString()}
                                </div>
                                <div style={{
                                    fontSize: '0.75rem',
                                    color: '#9ca3af',
                                    marginTop: '0.25rem'
                                }}>
                                    {property.images.length} images
                                    {property.videos?.length > 0 && ` • ${property.videos.length} videos`}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    onClick={() => setShowShowcase(true)}
                    style={{
                        width: '100%',
                        padding: '1rem',
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '1rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                    }}
                >
                    Launch Property Showcase
                </button>

                <div style={{
                    marginTop: '2rem',
                    padding: '1rem',
                    background: '#f3f4f6',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: '#4b5563'
                }}>
                    <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Features:</h4>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                        <li>Auto-play videos with mute toggle</li>
                        <li>Horizontal swipe to browse media</li>
                        <li>Vertical swipe to switch properties</li>
                        <li>Expandable/collapsible details</li>
                        <li>Lead capture form</li>
                        <li>Periodic scroll hints</li>
                    </ul>
                </div>

                <div style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    background: '#fef3c7',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: '#92400e'
                }}>
                    <strong>Note:</strong> This is a demo using sample data. In production, 
                    properties will be loaded from your Supabase database and the showcase 
                    will be triggered by clicking a button in Facebook Messenger.
                </div>
            </div>
        </div>
    );
};

export default PropertyShowcaseDemo;
