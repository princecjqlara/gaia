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
    whatsapp_url: null,
    website_url: null,
    address: null,
    bio: '',
    stats: [
        { label: 'Years of Experience', value: '10+' },
        { label: 'Properties Sold', value: '500+' },
        { label: 'Happy Clients', value: '1000+' }
    ]
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
        const signResponse = await fetch('/api/webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'cloudinary_sign',
                folder: `branding/${type}`
            })
        });
        const signData = await signResponse.json().catch(() => ({}));

        if (!signResponse.ok) {
            const errorMessage = signData.error || 'Signed upload not available';
            throw new Error(errorMessage);
        }

        if (!signData.signature || !signData.timestamp || !signData.apiKey || !signData.cloudName) {
            throw new Error('Signed upload response incomplete');
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', signData.apiKey);
        formData.append('timestamp', signData.timestamp);
        formData.append('signature', signData.signature);
        if (signData.folder) formData.append('folder', signData.folder);
        formData.append('resource_type', 'auto');

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${signData.cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('Cloudinary error:', data);
            const errorMessage = data.error?.message || `Upload failed: ${response.status}`;
            throw new Error(errorMessage);
        }

        console.log('Upload successful:', data.secure_url);
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
