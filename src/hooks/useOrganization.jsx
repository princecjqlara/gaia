import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { getCurrentOrganization, getOrganizationMembers } from '../services/organizationService';

const OrganizationContext = createContext(null);

/**
 * Organization Provider
 * Provides organization context to the entire app for multi-tenant isolation
 */
export function OrganizationProvider({ children }) {
    const [organization, setOrganization] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isOrganizer, setIsOrganizer] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    // Load organization data on mount
    useEffect(() => {
        loadOrganization();

        // Subscribe to auth changes
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            loadOrganization();
        });

        return () => subscription?.unsubscribe();
    }, []);

    async function loadOrganization() {
        try {
            setLoading(true);
            setError(null);

            const supabase = getSupabaseClient();
            if (!supabase) {
                setLoading(false);
                return;
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setOrganization(null);
                setMembers([]);
                setIsOrganizer(false);
                setIsAdmin(false);
                return;
            }

            // Get user's role and organization
            const { data: userData } = await supabase
                .from('users')
                .select('role, organization_id')
                .eq('id', user.id)
                .single();

            if (userData) {
                setIsOrganizer(userData.role === 'organizer');
                setIsAdmin(userData.role === 'admin' || userData.role === 'organizer');
            }

            // Get organization details
            const { data: org, error: orgError } = await getCurrentOrganization();
            if (orgError) {
                setError(orgError.message);
                return;
            }

            setOrganization(org);

            // Load members if organizer or admin
            if (userData?.role === 'organizer' || userData?.role === 'admin') {
                const { data: memberList } = await getOrganizationMembers();
                setMembers(memberList || []);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function refreshOrganization() {
        await loadOrganization();
    }

    async function refreshMembers() {
        const { data: memberList } = await getOrganizationMembers();
        setMembers(memberList || []);
    }

    const value = {
        organization,
        members,
        loading,
        error,
        isOrganizer,
        isAdmin,
        refreshOrganization,
        refreshMembers,
        // Helper to check if user has organization
        hasOrganization: !!organization,
        // Get organization ID for queries
        organizationId: organization?.id || null
    };

    return (
        <OrganizationContext.Provider value={value}>
            {children}
        </OrganizationContext.Provider>
    );
}

/**
 * Hook to access organization context
 * @returns {object} Organization context
 */
export function useOrganization() {
    const context = useContext(OrganizationContext);
    if (!context) {
        throw new Error('useOrganization must be used within OrganizationProvider');
    }
    return context;
}

export default OrganizationContext;
