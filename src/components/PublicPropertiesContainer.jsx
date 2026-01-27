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

    useEffect(() => {
        // Parse URL for team ID and property ID
        const path = window.location.pathname;

        // Match /:teamId/property/:id
        const teamPropMatch = path.match(/^\/([a-zA-Z0-9-]+)\/property\/([a-zA-Z0-9-]+)$/);
        // Match /:teamId/properties
        const teamPropsMatch = path.match(/^\/([a-zA-Z0-9-]+)\/properties$/);
        // Match /property/:id (no team)
        const propMatch = path.match(/^\/property\/([a-zA-Z0-9-]+)$/);

        if (teamPropMatch) {
            setTeamId(teamPropMatch[1]);
            setInitialPropertyId(teamPropMatch[2]);
        } else if (teamPropsMatch) {
            setTeamId(teamPropsMatch[1]);
        } else if (propMatch) {
            setInitialPropertyId(propMatch[1]);
        }

        loadData(teamPropMatch ? teamPropMatch[1] : (teamPropsMatch ? teamPropsMatch[1] : null));
    }, []);

    const loadData = async (currentTeamId) => {
        setLoading(true);
        try {
            const supabase = getSupabaseClient();

            // 1. Load Properties
            // If we have teamId, we *could* filter, but since we don't know if properties have team_id column,
            // we'll fetch all for now and rely on client side or simply show all.
            // Ideally: .eq('team_id', currentTeamId) if column exists.
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
            onPropertySelect={(property) => {
                // Update URL when property is selected
                if (property) {
                    const newPath = teamId
                        ? `/${teamId}/property/${property.id}`
                        : `/property/${property.id}`;
                    window.history.pushState({}, '', newPath);
                } else {
                    const newPath = teamId
                        ? `/${teamId}/properties`
                        : `/properties`;
                    window.history.pushState({}, '', newPath);
                }
            }}
        />
    );
};

export default PublicPropertiesContainer;
