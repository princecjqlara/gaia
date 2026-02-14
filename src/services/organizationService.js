import { getSupabaseClient } from './supabase';

/**
 * Organization Service
 * Handles all organization-related operations for multi-tenant architecture
 */

// Helper to get supabase client
const getSupabase = () => getSupabaseClient();

// ============================================
// ORGANIZATION CRUD
// ============================================

/**
 * Create a new organization
 * @param {string} name - Organization name
 * @param {string} slug - URL-friendly identifier
 * @param {object} settings - Organization settings
 * @returns {Promise<{data: object, error: object}>}
 */
export async function createOrganization(name, slug, settings = {}) {
    const { data: { user } } = await getSupabase().auth.getUser();
    if (!user) {
        return { data: null, error: { message: 'Not authenticated' } };
    }

    const { data, error } = await supabase
        .from('organizations')
        .insert({
            name,
            slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            owner_id: user.id,
            settings
        })
        .select()
        .single();

    if (data && !error) {
        // Update the user to be an organizer of this org
        await supabase
            .from('users')
            .update({
                organization_id: data.id,
                role: 'organizer'
            })
            .eq('id', user.id);
    }

    return { data, error };
}

/**
 * Get the current user's organization
 * @returns {Promise<{data: object, error: object}>}
 */
export async function getCurrentOrganization() {
    const { data: { user } } = await getSupabase().auth.getUser();
    if (!user) {
        return { data: null, error: { message: 'Not authenticated' } };
    }

    // First get the user's organization_id
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

    if (userError || !userData?.organization_id) {
        return { data: null, error: userError || { message: 'No organization assigned' } };
    }

    // Then get the organization details
    const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', userData.organization_id)
        .single();

    return { data, error };
}

/**
 * Update organization settings
 * @param {string} orgId - Organization ID
 * @param {object} updates - Fields to update
 * @returns {Promise<{data: object, error: object}>}
 */
export async function updateOrganization(orgId, updates) {
    const { data, error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', orgId)
        .select()
        .single();

    return { data, error };
}

// ============================================
// MEMBER MANAGEMENT
// ============================================

/**
 * Get all members of the current organization
 * @returns {Promise<{data: array, error: object}>}
 */
export async function getOrganizationMembers() {
    const { data: org } = await getCurrentOrganization();
    if (!org) {
        return { data: [], error: { message: 'No organization' } };
    }

    const { data, error } = await supabase
        .from('users')
        .select('id, email, name, role, created_at')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false });

    return { data: data || [], error };
}

/**
 * Add a new admin to the organization
 * @param {string} email - New admin's email
 * @param {string} name - New admin's name
 * @param {string} password - New admin's password
 * @param {string} role - Role (admin or user)
 * @returns {Promise<{data: object, error: object}>}
 */
export async function addOrganizationMember(email, name, password, role = 'admin') {
    const { data: org } = await getCurrentOrganization();
    if (!org) {
        return { data: null, error: { message: 'No organization' } };
    }

    // Check if current user is organizer
    const { data: currentUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', (await getSupabase().auth.getUser()).data.user?.id)
        .single();

    if (currentUser?.role !== 'organizer') {
        return { data: null, error: { message: 'Only organizers can add members' } };
    }

    // Create auth user via API (requires service role)
    // This should be done through an API endpoint
    const response = await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create_org_member',
            email,
            name,
            password,
            role,
            organization_id: org.id
        })
    });

    const result = await response.json();
    if (!response.ok) {
        return { data: null, error: { message: result.error || 'Failed to create member' } };
    }

    return { data: result.user, error: null };
}

/**
 * Update a member's role
 * @param {string} userId - User ID to update
 * @param {string} newRole - New role (admin or user)
 * @returns {Promise<{data: object, error: object}>}
 */
export async function updateMemberRole(userId, newRole) {
    // Only organizers can do this, and can't change other organizers
    const { data: targetUser } = await supabase
        .from('users')
        .select('role, organization_id')
        .eq('id', userId)
        .single();

    if (targetUser?.role === 'organizer') {
        return { data: null, error: { message: 'Cannot change organizer role' } };
    }

    const { data, error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId)
        .select()
        .single();

    return { data, error };
}

/**
 * Remove a member from the organization
 * @param {string} userId - User ID to remove
 * @returns {Promise<{success: boolean, error: object}>}
 */
export async function removeMember(userId) {
    // Can't remove organizers
    const { data: targetUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

    if (targetUser?.role === 'organizer') {
        return { success: false, error: { message: 'Cannot remove organizer' } };
    }

    // Set organization_id to null (soft removal)
    const { error } = await supabase
        .from('users')
        .update({ organization_id: null })
        .eq('id', userId);

    return { success: !error, error };
}

// ============================================
// ORGANIZATION STATS
// ============================================

/**
 * Get organization statistics
 * @returns {Promise<{data: object, error: object}>}
 */
export async function getOrganizationStats() {
    const { data: org } = await getCurrentOrganization();
    if (!org) {
        return { data: null, error: { message: 'No organization' } };
    }

    // Count members
    const { count: memberCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id);

    // Count clients
    const { count: clientCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id);

    // Count Facebook pages
    const { count: pageCount } = await supabase
        .from('facebook_pages')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id);

    // Count properties
    const { count: propertyCount } = await supabase
        .from('properties')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id);

    return {
        data: {
            members: memberCount || 0,
            clients: clientCount || 0,
            facebookPages: pageCount || 0,
            properties: propertyCount || 0
        },
        error: null
    };
}

export default {
    createOrganization,
    getCurrentOrganization,
    updateOrganization,
    getOrganizationMembers,
    addOrganizationMember,
    updateMemberRole,
    removeMember,
    getOrganizationStats
};
