import React, { useState, useEffect, useRef } from 'react';
import { initSupabase, getSupabaseClient } from '../services/supabase';
import { getPublicTeamBranding } from '../services/teamBrandingService';
import { normalizeHighlightMedia, normalizeHighlights } from '../utils/highlights';
import HighlightViewer from './HighlightViewer';

/**
 * TeamProfilePage - Instagram-style public profile page for teams
 * URL: /:teamId
 */
const TeamProfilePage = ({ teamId, onClose }) => {
    const [branding, setBranding] = useState(null);
    const [properties, setProperties] = useState([]);
    const [loading, setLoading] = useState(true);

    const profileRef = useRef(null);
    const actionsRef = useRef(null);
    const propertiesRef = useRef(null);
    const footerRef = useRef(null);

    const DEFAULT_BRANDING = {
        team_display_name: 'GAIA Properties',
        bio: '🏠 Find Your Dream Home\n📍 Serving Metro Manila & Beyond\n💼 Premium Real Estate Services\n📞 Contact us for inquiries',
        logo_url: null,
        website_url: '',
        schedule_meeting_url: ''
    };

    const brandingData = { ...DEFAULT_BRANDING, ...branding };

    const normalizedHighlights = normalizeHighlights(brandingData.highlights || []);

    const [isHighlightViewerOpen, setIsHighlightViewerOpen] = useState(false);
    const [activeHighlightIndex, setActiveHighlightIndex] = useState(null);
    const [activeHighlightMediaIndex, setActiveHighlightMediaIndex] = useState(0);

    const scrollToRef = (ref) => {
        if (ref?.current) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const handleContactClick = () => {
        if (brandingData.contact_email) {
            window.location.href = `mailto:${brandingData.contact_email}`;
            return;
        }
        if (brandingData.contact_phone) {
            window.location.href = `tel:${brandingData.contact_phone}`;
            return;
        }
        if (brandingData.schedule_meeting_url) {
            window.open(brandingData.schedule_meeting_url, '_blank', 'noopener,noreferrer');
            return;
        }
        if (brandingData.website_url) {
            window.open(brandingData.website_url, '_blank', 'noopener,noreferrer');
            return;
        }
        scrollToRef(footerRef);
        alert('Contact details are not set yet. Add them in Branding settings.');
    };

    const isSafeExternalUrl = (value) => {
        if (!value) return false;
        try {
            const parsed = new URL(value);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    };

    const handleHighlightTarget = (highlight) => {
        const target = typeof highlight?.target === 'string' ? highlight.target : 'none';
        if (target === 'services') {
            scrollToRef(actionsRef);
            return;
        }
        if (target === 'portfolio') {
            scrollToRef(propertiesRef);
            return;
        }
        if (target === 'contact') {
            scrollToRef(footerRef);
            return;
        }
        if (target === 'custom') {
            const customUrl = typeof highlight?.custom_url === 'string' ? highlight.custom_url.trim() : '';
            if (isSafeExternalUrl(customUrl)) {
                window.open(customUrl, '_blank', 'noopener,noreferrer');
            }
        }
    };

    const handleHighlightClick = (highlight, index) => {
        const media = normalizeHighlightMedia(highlight?.media || []);
        if (media.length > 0) {
            setActiveHighlightIndex(index);
            setActiveHighlightMediaIndex(0);
            setIsHighlightViewerOpen(true);
            return;
        }

        if (highlight?.target && highlight.target !== 'none') {
            handleHighlightTarget(highlight);
        }
    };

    const closeHighlightViewer = () => {
        setIsHighlightViewerOpen(false);
        setActiveHighlightIndex(null);
        setActiveHighlightMediaIndex(0);
    };

    const activeHighlight = activeHighlightIndex != null ? normalizedHighlights[activeHighlightIndex] : null;
    const activeHighlightMedia = normalizeHighlightMedia(activeHighlight?.media || []);
    const hasCustomHighlightUrl = Boolean(
        activeHighlight?.target === 'custom' && typeof activeHighlight.custom_url === 'string' && activeHighlight.custom_url.trim()
    );
    const showGoToSection = Boolean(
        activeHighlight?.target && activeHighlight.target !== 'none' && (activeHighlight.target !== 'custom' || hasCustomHighlightUrl)
    );
    const hasPrevHighlightMedia = activeHighlightMediaIndex > 0;
    const hasNextHighlightMedia = activeHighlightMediaIndex < activeHighlightMedia.length - 1;

    const visibleHighlights = normalizedHighlights;

    useEffect(() => {
        loadData();
    }, [teamId]);

    const loadData = async () => {
        setLoading(true);
        try {
            initSupabase();
            const supabase = getSupabaseClient();

            // Load team branding
            if (teamId) {
                const brand = await getPublicTeamBranding(teamId);
                if (brand) setBranding(brand);
                
                // Load team properties - try team_id first, fall back to all properties
                let props = [];
                
                // First try with team_id filter
                const { data: teamProps, error: teamError } = await supabase
                    .from('properties')
                    .select('*')
                    .eq('team_id', teamId)
                    .order('created_at', { ascending: false });
                
                if (teamError) {
                    console.error('Error loading team properties:', teamError);
                }
                
                if (teamProps && teamProps.length > 0) {
                    props = teamProps;
                } else {
                    // If no team_id properties, try organization_id
                    const { data: orgProps, error: orgError } = await supabase
                        .from('properties')
                        .select('*')
                        .eq('organization_id', teamId)
                        .order('created_at', { ascending: false });
                    
                    if (orgError) {
                        console.error('Error loading org properties:', orgError);
                    }
                    
                    if (orgProps && orgProps.length > 0) {
                        props = orgProps;
                    } else {
                        // Last resort: load all properties (like PropertyManagement does)
                        const { data: allProps, error: allError } = await supabase
                            .from('properties')
                            .select('*')
                            .order('created_at', { ascending: false });
                        
                        if (allError) {
                            console.error('Error loading all properties:', allError);
                        } else {
                            props = allProps || [];
                        }
                    }
                }
                
                console.log('Loaded properties:', props.length, 'for team:', teamId);
                setProperties(props || []);
            }
        } catch (err) {
            console.error('Error loading team profile:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff'
            }}>
                <div>Loading profile...</div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100svh',
            width: '100%',
            background: '#fff',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            margin: 0
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderBottom: '1px solid #dbdbdb',
                position: 'sticky',
                top: 0,
                background: '#fff',
                zIndex: 100
            }}>
                <div style={{ fontSize: '22px', cursor: 'pointer', color: '#262626' }} onClick={onClose}>←</div>
                <div style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#262626',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                }}>
                    {(brandingData.team_display_name || 'company').toLowerCase().replace(/\s+/g, '.')}
                    <span style={{
                        width: '18px',
                        height: '18px',
                        background: '#3897f0',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        color: '#fff'
                    }}>✓</span>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '22px', color: '#262626' }}>
                    <span style={{ cursor: 'pointer' }}>⊕</span>
                    <span style={{ cursor: 'pointer' }}>☰</span>
                </div>
            </div>

            {/* Profile Section */}
            <div style={{ padding: '16px' }}>
                {/* Profile Header */}
                <div style={{ display: 'flex', marginBottom: '20px' }}>
                    {/* Profile Picture */}
                    <div style={{
                        width: '77px',
                        height: '77px',
                        borderRadius: '50%',
                        padding: '3px',
                        background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                        marginRight: '28px',
                        flexShrink: 0
                    }}>
                        <div style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            border: '2px solid #fff',
                            overflow: 'hidden'
                        }}>
                            <img
                                src={brandingData.logo_url || 'https://via.placeholder.com/77/10b981/fff?text=G'}
                                alt="Profile"
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                }}
                            />
                        </div>
                    </div>

                    {/* Stats */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '30px',
                        flex: 1
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: '600', color: '#262626' }}>{properties.length}</div>
                            <div style={{ fontSize: '13px', color: '#8e8e8e' }}>properties</div>
                        </div>
                    </div>
                </div>

                {/* Profile Info */}
                <div ref={profileRef} style={{ marginBottom: '16px' }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#262626',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        {brandingData.team_display_name}
                        <span style={{
                            width: '14px',
                            height: '14px',
                            background: '#3897f0',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '8px',
                            color: '#fff'
                        }}>✓</span>
                    </div>
                    <div style={{
                        fontSize: '14px',
                        color: '#8e8e8e',
                        marginTop: '2px'
                    }}>
                        Real Estate & Property Management
                    </div>
                    <div style={{
                        fontSize: '14px',
                        color: '#262626',
                        lineHeight: '1.5',
                        marginTop: '4px',
                        whiteSpace: 'pre-line'
                    }}>
                        {brandingData.bio}
                    </div>
                    {brandingData.website_url && (
                        <div style={{
                            fontSize: '14px',
                            color: '#00376b',
                            marginTop: '4px',
                            fontWeight: '600'
                        }}>
                            {brandingData.website_url.replace(/^https?:\/\//, '')}
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div ref={actionsRef} style={{
                    display: 'flex',
                    gap: '8px',
                    marginBottom: '20px',
                    flexWrap: 'wrap'
                }}>
                    <a
                        href={brandingData.schedule_meeting_url || '#'}
                        target={brandingData.schedule_meeting_url ? "_blank" : undefined}
                        rel={brandingData.schedule_meeting_url ? "noopener noreferrer" : undefined}
                        style={{
                            flex: '1 1 140px',
                            padding: '8px 14px',
                            background: '#0095f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            textAlign: 'center',
                            textDecoration: 'none'
                        }}
                    >
                        Schedule Meeting
                    </a>
                    <a
                        href={`/${teamId}/properties`}
                        style={{
                            flex: '1 1 120px',
                            padding: '8px 14px',
                            background: '#efefef',
                            color: '#000',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            textAlign: 'center',
                            textDecoration: 'none'
                        }}
                    >
                        Inquire
                    </a>
                    <button
                        onClick={handleContactClick}
                        style={{
                        flex: '1 1 110px',
                        padding: '8px 12px',
                        background: '#efefef',
                        color: '#000',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer'
                    }}>
                        Contact
                    </button>
                </div>

                {visibleHighlights.length > 0 && (
                    <div style={{
                        display: 'flex',
                        gap: '16px',
                        overflowX: 'auto',
                        paddingBottom: '8px',
                        marginBottom: '16px'
                    }}>
                        {visibleHighlights.map((highlight, index) => {
                            const media = normalizeHighlightMedia(highlight?.media || []);
                            const cover = media[0]?.url || (brandingData.logo_url || 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=100');
                            const title = highlight?.title || highlight?.name || 'Highlight';
                            return (
                                <button
                                    key={highlight.id}
                                    type="button"
                                    onClick={() => handleHighlightClick(highlight, index)}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '6px',
                                        cursor: 'pointer',
                                        flexShrink: 0,
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0
                                    }}
                                >
                                    <div style={{
                                        width: '64px',
                                        height: '64px',
                                        borderRadius: '50%',
                                        padding: '2px',
                                        background: '#dbdbdb'
                                    }}>
                                        <div style={{
                                            width: '100%',
                                            height: '100%',
                                            borderRadius: '50%',
                                            border: '2px solid #fff',
                                            overflow: 'hidden'
                                        }}>
                                            <img
                                                src={cover}
                                                alt={title}
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover'
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: '12px',
                                        color: '#262626',
                                        maxWidth: '64px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {title}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Section Label */}
                <div ref={propertiesRef} style={{
                    padding: '12px 0',
                    borderTop: '1px solid #dbdbdb',
                    textAlign: 'center'
                }}>
                    <span style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#262626'
                    }}>
                        Properties
                    </span>
                </div>

                {/* Content Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '3px',
                    marginTop: '4px'
                }}>
                    {properties.slice(0, 9).map((property, idx) => (
                        <div
                            key={property.id}
                            onClick={() => window.location.href = `/${teamId}/property/${property.id}?mode=showcase`}
                            style={{
                                position: 'relative',
                                aspectRatio: '1',
                                background: '#f0f0f0',
                                cursor: 'pointer',
                                overflow: 'hidden'
                            }}
                        >
                            <img
                                src={property.primary_media_url || property.primaryMediaUrl || property.images?.[0] || 'https://images.unsplash.com/photo-1600596542815-27bfef402399?w=300'}
                                alt={property.title}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                }}
                            />
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0,0,0,0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: 0,
                                transition: 'opacity 0.2s',
                                color: '#fff',
                                fontWeight: '600'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                            >
                                <span>₱ {parseFloat(property.price).toLocaleString()}</span>
                            </div>
                        </div>
                    ))}
                    {properties.length === 0 && (
                        <div style={{
                            gridColumn: '1 / -1',
                            textAlign: 'center',
                            padding: '3rem',
                            color: '#8e8e8e'
                        }}>
                            No properties yet
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div ref={footerRef} style={{
                padding: '20px 16px',
                textAlign: 'center',
                borderTop: '1px solid #dbdbdb',
                marginTop: '20px'
            }}>
                <div style={{
                    fontSize: '12px',
                    color: '#8e8e8e',
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '16px',
                    marginBottom: '12px',
                    flexWrap: 'wrap'
                }}>
                    <span style={{ cursor: 'pointer', color: '#8e8e8e' }}>About</span>
                    <span style={{ cursor: 'pointer', color: '#8e8e8e' }}>Privacy</span>
                    <span style={{ cursor: 'pointer', color: '#8e8e8e' }}>Terms</span>
                    <span style={{ cursor: 'pointer', color: '#8e8e8e' }}>Contact</span>
                </div>
                <div style={{
                    fontSize: '12px',
                    color: '#8e8e8e'
                }}>
                    © 2026 {brandingData.team_display_name}
                </div>
            </div>

            <HighlightViewer
                isOpen={isHighlightViewerOpen}
                highlightTitle={activeHighlight?.title || activeHighlight?.name || 'Highlight'}
                media={activeHighlightMedia}
                mediaIndex={activeHighlightMediaIndex}
                onClose={closeHighlightViewer}
                onPrev={() => hasPrevHighlightMedia && setActiveHighlightMediaIndex((prev) => prev - 1)}
                onNext={() => hasNextHighlightMedia && setActiveHighlightMediaIndex((prev) => prev + 1)}
                onGoToSection={() => activeHighlight && handleHighlightTarget(activeHighlight)}
                showGoToSection={showGoToSection}
            />
        </div>
    );
};

export default TeamProfilePage;
