import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { getPublicTeamBranding } from '../services/teamBrandingService';
import PropertyPreview from './PropertyPreview';

const PublicPropertiesContainer = ({ onClose }) => {
    const [properties, setProperties] = useState([]);
    const [branding, setBranding] = useState(null);
    const [loading, setLoading] = useState(true);
    const [initialPropertyId, setInitialPropertyId] = useState(null);

    useEffect(() => {
        // Parse URL for initial property ID
        const path = window.location.pathname;
        const match = path.match(/^\/property\/([a-zA-Z0-9-]+)$/);
        if (match) {
            setInitialPropertyId(match[1]);
        }

        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const supabase = getSupabaseClient();

            // 1. Load Properties
            const { data: props, error: propError } = await supabase
                .from('properties')
                .select('*')
                .order('created_at', { ascending: false });

            if (propError) throw propError;
            setProperties(props || []);

            // 2. Load Branding (Use first team found or specific if needed)
            // For now, we'll try to get branding from the first property's creator or a default team
            // If we have an organization/team ID in query params, use that
            // Otherwise, fetch generic or specific one. 
            // Since this is a general directory, we might need a way to know WHICH team's branding to show.
            // For now, we'll assume single tenant or just fetch the first team's branding.

            // Try to find a team ID from local storage or query param, else default
            // This part might need refinement for multi-tenant. 
            // For now, let's fetch the first team.
            const { data: teams } = await supabase.from('teams').select('id').limit(1);
            if (teams && teams.length > 0) {
                const brand = await getPublicTeamBranding(teams[0].id);
                setBranding(brand);
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

    // Wrap PropertyPreview to handle URL updates
    const WrappedPropertyPreview = () => {
        // We need to inject logic into PropertyPreview to update URL.
        // Since PropertyPreview manages its own "selectedProperty" state, 
        // we might pass initial state. 
        // A better approach is to modify PropertyPreview to accept "selectedProperty" prop 
        // but it controls it internally.
        // Actually, PropertyPreview takes `properties`. 
        // It renders the list if no selectedProperty.
        // We can pass `initialSelected` but PropertyPreview uses `const [selectedProperty, setSelectedProperty] = useState(null);`
        // We might need to modify PropertyPreview to accept `initialSelectedProperty`.

        // However, we can't easily modify PropertyPreview w/o editing it.
        // Let's modify PropertyPreview to accept an optional `initialPropertyId` or `selectedProperty` prop that it respects.
        // Looking at PropertyPreview code... line 28: `const [selectedProperty, setSelectedProperty] = useState(null);`
        // It doesn't accept an initial value from props.

        // I will first modify PropertyPreview to accept `initialProperty` prop.
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
                        window.history.pushState({}, '', `/property/${property.id}`);
                    } else {
                        window.history.pushState({}, '', `/properties`);
                    }
                }}
            />
        );
    }

    return <WrappedPropertyPreview />;
};

export default PublicPropertiesContainer;
