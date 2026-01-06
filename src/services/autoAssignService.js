import { getSupabaseClient } from './supabase';

/**
 * Auto-Assign Service
 * Handles round-robin assignment to clocked-in chat support users
 */
export const autoAssignService = {
    /**
     * Get the next available chat support user using round-robin
     * Only considers users who are clocked in
     */
    async getNextAssignee() {
        const supabase = getSupabaseClient();
        if (!supabase) return null;

        try {
            // Check if auto-assign is enabled
            const { data: setting } = await supabase
                .from('facebook_settings')
                .select('setting_value')
                .eq('setting_key', 'auto_assign_enabled')
                .single();

            if (!setting?.setting_value?.enabled) {
                console.log('[AutoAssign] Auto-assign is disabled');
                return null;
            }

            // Get all clocked-in chat support users
            const { data: onlineUsers, error: usersError } = await supabase
                .from('users')
                .select('id, name, email')
                .eq('is_clocked_in', true)
                .in('role', ['chat_support', 'admin'])
                .order('name');

            if (usersError || !onlineUsers || onlineUsers.length === 0) {
                console.log('[AutoAssign] No clocked-in chat support users available');
                return null;
            }

            // Get the round-robin state
            const { data: rrState } = await supabase
                .from('facebook_settings')
                .select('setting_value')
                .eq('setting_key', 'round_robin_state')
                .single();

            let lastIndex = rrState?.setting_value?.last_assigned_index || 0;

            // Calculate next index (round-robin)
            let nextIndex = (lastIndex + 1) % onlineUsers.length;
            const nextUser = onlineUsers[nextIndex];

            // Update round-robin state
            await supabase
                .from('facebook_settings')
                .upsert({
                    setting_key: 'round_robin_state',
                    setting_value: {
                        last_assigned_index: nextIndex,
                        last_assigned_user_id: nextUser.id,
                        last_assigned_at: new Date().toISOString()
                    }
                }, { onConflict: 'setting_key' });

            console.log(`[AutoAssign] Assigned to ${nextUser.name || nextUser.email} (index ${nextIndex})`);
            return nextUser;
        } catch (err) {
            console.error('[AutoAssign] Error getting next assignee:', err);
            return null;
        }
    },

    /**
     * Auto-assign a conversation to the next available user
     */
    async assignConversation(conversationId) {
        const supabase = getSupabaseClient();
        if (!supabase || !conversationId) return null;

        try {
            const nextUser = await this.getNextAssignee();
            if (!nextUser) return null;

            // Update the conversation with assigned user
            const { error } = await supabase
                .from('facebook_conversations')
                .update({ assigned_to: nextUser.id })
                .eq('conversation_id', conversationId);

            if (error) {
                console.error('[AutoAssign] Error assigning conversation:', error);
                return null;
            }

            console.log(`[AutoAssign] Conversation ${conversationId} assigned to ${nextUser.name || nextUser.email}`);
            return nextUser;
        } catch (err) {
            console.error('[AutoAssign] Error in assignConversation:', err);
            return null;
        }
    },

    /**
     * Check if auto-assign is enabled
     */
    async isEnabled() {
        const supabase = getSupabaseClient();
        if (!supabase) return false;

        try {
            const { data: setting } = await supabase
                .from('facebook_settings')
                .select('setting_value')
                .eq('setting_key', 'auto_assign_enabled')
                .single();

            return setting?.setting_value?.enabled === true;
        } catch {
            return false;
        }
    }
};

export default autoAssignService;
