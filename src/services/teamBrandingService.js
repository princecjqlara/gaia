/**
 * Team Branding Service
 * Handles CRUD operations for team branding settings
 */

import { getSupabaseClient } from './supabase';

const DEFAULT_BRANDING = {
    logo_url: null,
    team_display_name: null,
    tagline: 'Find Your Dream Home',
    subtitle: 'Browse our exclusive portfolio of premium properties.',
    hero_image_url: null,
    primary_color: '#10b981',
    contact_phone: null,
    contact_email: null,
    facebook_url: null,
    instagram_url: null,
    website_url: null,
    address: null
};

/**
 * Get team branding settings
 * @param {string} teamId - Team ID
 * @returns {Promise<{data: object, error: object}>}
 */
export async function getTeamBranding(teamId) {
    const supabase = getSupabaseClient();
    if (!supabase) return { data: DEFAULT_BRANDING, error: null };

    try {
        const { data, error } = await supabase
            .from('teams')
            .select('id, name, branding')
            .eq('id', teamId)
            .single();

        if (error) throw error;

        return {
            data: {
                ...DEFAULT_BRANDING,
                team_display_name: data.name,
                ...(data.branding || {})
            },
            error: null
        };
    } catch (error) {
        console.error('Error fetching team branding:', error);
        return { data: DEFAULT_BRANDING, error };
    }
}

/**
 * Update team branding settings
 * @param {string} teamId - Team ID
 * @param {object} branding - Branding settings to update
 * @returns {Promise<{data: object, error: object}>}
 */
export async function updateTeamBranding(teamId, branding) {
    const supabase = getSupabaseClient();
    if (!supabase) return { data: null, error: { message: 'No database connection' } };

    try {
        const { data, error } = await supabase
            .from('teams')
            .update({ branding })
            .eq('id', teamId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error updating team branding:', error);
        return { data: null, error };
    }
}

/**
 * Upload branding image (logo or hero) to Cloudinary
 * @param {File} file - Image file to upload
 * @param {string} type - 'logo' or 'hero'
 * @returns {Promise<{url: string, error: object}>}
 */
export async function uploadBrandingImage(file, type = 'logo') {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'gaia_branding');
        formData.append('folder', `branding/${type}`);

        const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'du47531ib';
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        if (!response.ok) {
            throw new Error('Failed to upload image');
        }

        const data = await response.json();
        return { url: data.secure_url, error: null };
    } catch (error) {
        console.error('Error uploading branding image:', error);
        return { url: null, error };
    }
}

/**
 * Get team branding by team ID for public display (no auth required)
 * @param {string} teamId - Team ID
 * @returns {Promise<object>}
 */
export async function getPublicTeamBranding(teamId) {
    const supabase = getSupabaseClient();
    if (!supabase) return DEFAULT_BRANDING;

    try {
        const { data, error } = await supabase
            .from('teams')
            .select('id, name, branding')
            .eq('id', teamId)
            .single();

        if (error) throw error;

        return {
            ...DEFAULT_BRANDING,
            team_display_name: data.name,
            ...(data.branding || {})
        };
    } catch (error) {
        console.error('Error fetching public branding:', error);
        return DEFAULT_BRANDING;
    }
}
