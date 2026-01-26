import { createClient } from '@supabase/supabase-js';

/**
 * API Endpoint: Create Team with Admin
 * POST /api/create-team-with-admin
 * 
 * Creates a new team and its admin user. Only organizers can call this.
 */
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { team_name, admin_email, admin_name, admin_password } = req.body;

        // Validate required fields
        if (!team_name || !admin_email || !admin_name || !admin_password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Initialize Supabase with service role key
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('[CREATE-TEAM] Supabase not configured');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        // Verify the caller is an organizer
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !callerUser) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Check if caller is an organizer
        const { data: callerData, error: callerError } = await supabaseAdmin
            .from('users')
            .select('role, organization_id')
            .eq('id', callerUser.id)
            .single();

        if (callerError || callerData.role !== 'organizer') {
            return res.status(403).json({ error: 'Only organizers can create teams' });
        }

        // Check if email already exists
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const emailExists = existingUsers?.users?.some(u => u.email === admin_email);

        if (emailExists) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // 1. Create auth user for admin
        const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
            email: admin_email,
            password: admin_password,
            email_confirm: true
        });

        if (createAuthError) {
            console.error('[CREATE-TEAM] Auth creation failed:', createAuthError.message);
            return res.status(400).json({ error: 'Failed to create admin: ' + createAuthError.message });
        }

        // 2. Create the team
        const { data: teamData, error: teamError } = await supabaseAdmin
            .from('teams')
            .insert({
                name: team_name,
                admin_id: authData.user.id,
                organization_id: callerData.organization_id
            })
            .select()
            .single();

        if (teamError) {
            console.error('[CREATE-TEAM] Team creation failed:', teamError.message);
            // Clean up auth user
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            return res.status(400).json({ error: 'Failed to create team: ' + teamError.message });
        }

        // 3. Create admin user profile
        const { data: userData, error: profileError } = await supabaseAdmin
            .from('users')
            .insert({
                id: authData.user.id,
                email: admin_email,
                name: admin_name,
                role: 'admin',
                organization_id: callerData.organization_id,
                team_id: teamData.id
            })
            .select()
            .single();

        if (profileError) {
            console.error('[CREATE-TEAM] Profile creation failed:', profileError.message);
            // Clean up
            await supabaseAdmin.from('teams').delete().eq('id', teamData.id);
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            return res.status(400).json({ error: 'Failed to create admin profile: ' + profileError.message });
        }

        console.log(`[CREATE-TEAM] Created team "${team_name}" with admin ${admin_email}`);

        return res.status(200).json({
            success: true,
            team: teamData,
            admin: {
                id: userData.id,
                email: userData.email,
                name: userData.name,
                role: userData.role
            }
        });

    } catch (error) {
        console.error('[CREATE-TEAM] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
