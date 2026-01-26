/**
 * Lead Service
 * Handles lead capture from public-facing property pages
 */

import { getSupabaseClient } from './supabase';

/**
 * Capture a new lead from a public property listing
 * @param {object} leadData - { name, email, phone, message, property_id, team_id, organization_id }
 * @returns {Promise<{data: object, error: object}>}
 */
export async function createPropertyLead(leadData) {
    const supabase = getSupabaseClient();
    if (!supabase) return { data: null, error: { message: 'No database connection' } };

    try {
        // We'll save this to the 'clients' table with status 'Lead' and source 'Public Listing'
        const { data, error } = await supabase
            .from('clients')
            .insert({
                name: leadData.name,
                email: leadData.email,
                phone: leadData.phone,
                notes: `Inquiry for property ID: ${leadData.property_id}. Message: ${leadData.message}`,
                phase: 'Inquiry', // Or 'Lead' depending on your CRM phases
                status: 'Lead',
                source: 'Public Listing',
                team_id: leadData.team_id,
                organization_id: leadData.organization_id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // Also log a view or activity if needed
        await supabase.from('stage_history').insert({
            client_id: data.id,
            from_stage: 'None',
            to_stage: 'Inquiry',
            notes: 'New lead from public property listing',
            team_id: leadData.team_id,
            organization_id: leadData.organization_id
        });

        return { data, error: null };
    } catch (error) {
        console.error('Error creating property lead:', error);
        return { data: null, error };
    }
}
