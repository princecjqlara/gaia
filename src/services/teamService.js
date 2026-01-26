import { getSupabaseClient } from './supabase';

/**
 * Team Service
 * Handles team-related operations for team-based data isolation
 */

const getSupabase = () => getSupabaseClient();

// ============================================
// TEAM CRUD
// ============================================

/**
 * Get all teams in the organization (for organizers)
 * @returns {Promise<{data: array, error: object}>}
 */
export async function getOrganizationTeams() {
    const supabase = getSupabase();
    if (!supabase) return { data: [], error: { message: 'Supabase not initialized' } };

    // Use the team_stats view for comprehensive data
    const { data, error } = await supabase
        .from('team_stats')
        .select('*')
        .order('created_at', { ascending: false });

    return { data: data || [], error };
}

/**
 * Get a specific team's details
 * @param {string} teamId - Team ID
 * @returns {Promise<{data: object, error: object}>}
 */
export async function getTeamById(teamId) {
    const supabase = getSupabase();
    if (!supabase) return { data: null, error: { message: 'Supabase not initialized' } };

    const { data, error } = await supabase
        .from('team_stats')
        .select('*')
        .eq('team_id', teamId)
        .single();

    return { data, error };
}

/**
 * Get the current user's team
 * @returns {Promise<{data: object, error: object}>}
 */
export async function getCurrentTeam() {
    const supabase = getSupabase();
    if (!supabase) return { data: null, error: { message: 'Supabase not initialized' } };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };

    // Get user's team_id
    const { data: userData } = await supabase
        .from('users')
        .select('team_id')
        .eq('id', user.id)
        .single();

    if (!userData?.team_id) {
        return { data: null, error: { message: 'No team assigned' } };
    }

    const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', userData.team_id)
        .single();

    return { data, error };
}

/**
 * Create a new team (with admin)
 * @param {string} teamName - Team name
 * @param {string} adminEmail - Admin email
 * @param {string} adminName - Admin name  
 * @param {string} adminPassword - Admin password
 * @returns {Promise<{data: object, error: object}>}
 */
export async function createTeamWithAdmin(teamName, adminEmail, adminName, adminPassword) {
    // This should be done via API endpoint for proper auth user creation
    const response = await fetch('/api/create-team-with-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            team_name: teamName,
            admin_email: adminEmail,
            admin_name: adminName,
            admin_password: adminPassword
        })
    });

    const result = await response.json();
    if (!response.ok) {
        return { data: null, error: { message: result.error || 'Failed to create team' } };
    }

    return { data: result, error: null };
}

/**
 * Update team settings
 * @param {string} teamId - Team ID
 * @param {object} updates - Fields to update
 * @returns {Promise<{data: object, error: object}>}
 */
export async function updateTeam(teamId, updates) {
    const supabase = getSupabase();
    if (!supabase) return { data: null, error: { message: 'Supabase not initialized' } };

    const { data, error } = await supabase
        .from('teams')
        .update(updates)
        .eq('id', teamId)
        .select()
        .single();

    return { data, error };
}

/**
 * Delete a team (organizer only)
 * @param {string} teamId - Team ID
 * @returns {Promise<{success: boolean, error: object}>}
 */
export async function deleteTeam(teamId) {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: { message: 'Supabase not initialized' } };

    const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId);

    return { success: !error, error };
}

// ============================================
// TEAM MEMBERS
// ============================================

/**
 * Get all members of a team
 * @param {string} teamId - Team ID
 * @returns {Promise<{data: array, error: object}>}
 */
export async function getTeamMembers(teamId) {
    const supabase = getSupabase();
    if (!supabase) return { data: [], error: { message: 'Supabase not initialized' } };

    const { data, error } = await supabase
        .from('users')
        .select('id, email, name, role, created_at')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false });

    return { data: data || [], error };
}

/**
 * Add a user to a team
 * @param {string} email - User email
 * @param {string} name - User name
 * @param {string} password - User password
 * @param {string} teamId - Team ID
 * @returns {Promise<{data: object, error: object}>}
 */
export async function addTeamMember(email, name, password, teamId) {
    const response = await fetch('/api/create-team-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email,
            name,
            password,
            team_id: teamId
        })
    });

    const result = await response.json();
    if (!response.ok) {
        return { data: null, error: { message: result.error || 'Failed to add member' } };
    }

    return { data: result.user, error: null };
}

export default {
    getOrganizationTeams,
    getTeamById,
    getCurrentTeam,
    createTeamWithAdmin,
    updateTeam,
    deleteTeam,
    getTeamMembers,
    addTeamMember
};
