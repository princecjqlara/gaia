import React, { useState, useEffect } from 'react';
import { initSupabase, getSupabaseClient } from '../services/supabase';
import { getPublicTeamBranding } from '../services/teamBrandingService';
import PropertyPreview from './PropertyPreview';
import PropertyMediaShowcase from './PropertyMediaShowcase';

const PublicPropertiesContainer = ({ onClose }) => {
    const [properties, setProperties] = useState([]);
    const [branding, setBranding] = useState(null);
    const [loading, setLoading] = useState(true);
    const [initialPropertyId, setInitialPropertyId] = useState(null);
    const [teamId, setTeamId] = useState(null);
    const [visitorName, setVisitorName] = useState(null);
    const [participantId, setParticipantId] = useState(null);
    const [showcaseMode, setShowcaseMode] = useState(false);
    const [initialPropertyIndex, setInitialPropertyIndex] = useState(0);

    useEffect(() => {
        // Parse search params for pid and mode
        const params = new URLSearchParams(window.location.search);
        const pid = params.get('pid');
        const mode = params.get('mode');
        if (pid) setParticipantId(pid);
        if (mode === 'showcase') setShowcaseMode(true);

        // Parse URL for team ID, visitor name, and property ID
        const path = window.location.pathname;

        // Match /u/:visitorName/property/:id
        const trackPropMatch = path.match(/^\/u\/([^/]+)\/property\/([a-zA-Z0-9-]+)$/);
        // Match /u/:visitorName/properties
        const trackPropsMatch = path.match(/^\/u\/([^/]+)\/properties$/);

        // Match /:teamId/property/:id
        const teamPropMatch = path.match(/^\/([a-zA-Z0-9-]+)\/property\/([a-zA-Z0-9-]+)$/);
        // Match /:teamId/properties
        const teamPropsMatch = path.match(/^\/([a-zA-Z0-9-]+)\/properties$/);

        // Match /property/:id (no team/visitor)
        const propMatch = path.match(/^\/property\/([a-zA-Z0-9-]+)$/);

        // NOTE: Regex for teamId conflict with 'u'.
        // We handle 'u' routes first explicitly.
        // Also teamPropMatch regex above matches /u/... if teamId='u'.
        // Using explicit /u/ prefix helps.

        let localVisitorName = null;
        let localTeamId = null;
        let localPropertyId = null;

        if (trackPropMatch) {
            localVisitorName = decodeURIComponent(trackPropMatch[1]);
            localPropertyId = trackPropMatch[2];
        } else if (trackPropsMatch) {
            localVisitorName = decodeURIComponent(trackPropsMatch[1]);
        } else if (teamPropMatch && teamPropMatch[1] !== 'u') { // Avoid matching /u/ as teamId
            localTeamId = teamPropMatch[1];
            localPropertyId = teamPropMatch[2];
        } else if (teamPropsMatch && teamPropsMatch[1] !== 'u') {
            localTeamId = teamPropsMatch[1];
        } else if (propMatch) {
            localPropertyId = propMatch[1];
        }

        if (localVisitorName) setVisitorName(localVisitorName);
        if (localTeamId) setTeamId(localTeamId);
        if (localPropertyId) setInitialPropertyId(localPropertyId);

        loadData(localTeamId, localPropertyId);
    }, []);

    const loadData = async (currentTeamId, propertyId) => {
        setLoading(true);
        try {
            // Initialize Supabase for public pages
            initSupabase();
            const supabase = getSupabaseClient();

            // 1. Load Properties (team -> org -> all)
            let props = [];

            if (currentTeamId) {
                const { data: teamProps, error: teamError } = await supabase
                    .from('properties')
                    .select('*')
                    .eq('team_id', currentTeamId)
                    .order('created_at', { ascending: false });

                if (teamError) {
                    console.error('Error loading team properties:', teamError);
                }

                if (teamProps && teamProps.length > 0) {
                    props = teamProps;
                } else {
                    const { data: orgProps, error: orgError } = await supabase
                        .from('properties')
                        .select('*')
                        .eq('organization_id', currentTeamId)
                        .order('created_at', { ascending: false });

                    if (orgError) {
                        console.error('Error loading org properties:', orgError);
                    }

                    if (orgProps && orgProps.length > 0) {
                        props = orgProps;
                    }
                }
            }

            if (props.length === 0) {
                const { data: allProps, error: allError } = await supabase
                    .from('properties')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (allError) {
                    console.error('Error loading all properties:', allError);
                }

                props = allProps || [];
            }

            if (propertyId && !props.some((p) => p.id === propertyId)) {
                const { data: singleProp, error: singleError } = await supabase
                    .from('properties')
                    .select('*')
                    .eq('id', propertyId)
                    .limit(1);

                if (singleError) {
                    console.error('Error loading property by id:', singleError);
                }

                if (singleProp && singleProp.length > 0) {
                    props = [singleProp[0], ...props];
                }
            }

            setProperties(props || []);

            // 2. Load Branding
            const brandingTeamId = currentTeamId || props?.[0]?.team_id || props?.[0]?.organization_id || null;

            if (brandingTeamId) {
                const brand = await getPublicTeamBranding(brandingTeamId);
                if (brand) setBranding(brand);
            } else {
                // Fallback: Fetch first team's branding if no team specified
                const { data: teams } = await supabase.from('teams').select('id').limit(1);
                if (teams && teams.length > 0) {
                    const brand = await getPublicTeamBranding(teams[0].id);
                    setBranding(brand);
                }
            }

        } catch (err) {
            console.error('Error loading public properties:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'column',
                gap: '1rem',
                color: '#6b7280'
            }}>
                <div className="spinner"></div>
                <div>Loading Properties...</div>
                <style>{`
                    .spinner {
                        width: 40px;
                        height: 40px;
                        border: 4px solid #f3f4f6;
                        border-top: 4px solid #10b981;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    // Determine initial selected property and index
    const initialSelected = initialPropertyId
        ? properties.find(p => p.id === initialPropertyId)
        : null;
    
    const initialIdx = initialPropertyId 
        ? properties.findIndex(p => p.id === initialPropertyId)
        : 0;

    // Render immersive showcase mode for Messenger contacts
    if (showcaseMode && properties.length > 0) {
        return (
            <PropertyMediaShowcase
                properties={properties}
                branding={branding}
                initialPropertyIndex={initialIdx >= 0 ? initialIdx : 0}
                onClose={() => {
                    window.history.pushState({}, '', '/');
                    if (onClose) onClose();
                }}
                visitorName={visitorName}
                participantId={participantId}
                teamId={teamId}
                organizationId={null}
            />
        );
    }

    return (
        <PropertyPreview
            properties={properties}
            branding={branding}
            onClose={() => {
                // Update URL to /
                window.history.pushState({}, '', '/');
                if (onClose) onClose();
            }}
            initialProperty={initialSelected}
            visitorName={visitorName} // Pass visitor name for tracking
            participantId={participantId} // Pass participant ID for tracking
            onPropertySelect={(property) => {
                // Update URL when property is selected
                let newPath = '';
                if (visitorName) {
                    const encodedName = encodeURIComponent(visitorName);
                    newPath = property
                        ? `/u/${encodedName}/property/${property.id}`
                        : `/u/${encodedName}/properties`;
                } else if (teamId) {
                    newPath = property
                        ? `/${teamId}/property/${property.id}`
                        : `/${teamId}/properties`;
                } else {
                    newPath = property
                        ? `/property/${property.id}`
                        : `/properties`;
                }

                if (newPath) {
                    window.history.pushState({}, '', newPath);
                }
            }}
        />
    );
};

export default PublicPropertiesContainer;
