import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { getPublicTeamBranding } from '../services/teamBrandingService';
import PropertyPreview from './PropertyPreview';

const PublicPropertiesContainer = ({ onClose }) => {
    const [properties, setProperties] = useState([]);
    const [branding, setBranding] = useState(null);
    const [loading, setLoading] = useState(true);
    const [initialPropertyId, setInitialPropertyId] = useState(null);
    const [teamId, setTeamId] = useState(null);
    const [visitorName, setVisitorName] = useState(null);

    useEffect(() => {
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

        if (trackPropMatch) {
            setVisitorName(decodeURIComponent(trackPropMatch[1]));
            setInitialPropertyId(trackPropMatch[2]);
        } else if (trackPropsMatch) {
            setVisitorName(decodeURIComponent(trackPropsMatch[1]));
        } else if (teamPropMatch && teamPropMatch[1] !== 'u') { // Avoid matching /u/ as teamId
            setTeamId(teamPropMatch[1]);
            setInitialPropertyId(teamPropMatch[2]);
        } else if (teamPropsMatch && teamPropsMatch[1] !== 'u') {
            setTeamId(teamPropsMatch[1]);
        } else if (propMatch) {
            setInitialPropertyId(propMatch[1]);
        }

        // Determine team ID to load
        const idToLoad = (teamPropMatch && teamPropMatch[1] !== 'u') ? teamPropMatch[1]
            : (teamPropsMatch && teamPropsMatch[1] !== 'u') ? teamPropsMatch[1]
                : null;

        loadData(idToLoad);
    }, []);

    const loadData = async (currentTeamId) => {
        setLoading(true);
        try {
            const supabase = getSupabaseClient();

            // 1. Load Properties
            let query = supabase
                .from('properties')
                .select('*')
                .order('created_at', { ascending: false });

            const { data: props, error: propError } = await query;

            if (propError) throw propError;
            setProperties(props || []);

            // 2. Load Branding
            if (currentTeamId) {
                const brand = await getPublicTeamBranding(currentTeamId);
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

    // Determine initial selected property
    const initialSelected = initialPropertyId
        ? properties.find(p => p.id === initialPropertyId)
        : null;

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
