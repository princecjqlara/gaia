import { createClient } from '@supabase/supabase-js';

/**
 * API Endpoint: Create Organization Member
 * POST /api/create-org-member
 * 
 * This endpoint creates a new user in the auth system and adds them to an organization.
 * Only organizers can call this endpoint.
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
        const { email, name, password, role, organization_id } = req.body;

        // Validate required fields
        if (!email || !name || !password || !organization_id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate role
        if (!['admin', 'user'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be admin or user.' });
        }

        // Initialize Supabase with service role key (admin access)
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('[CREATE-ORG-MEMBER] Supabase not configured');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        // Verify the caller is an organizer of this organization
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !callerUser) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Check if caller is organizer of the target organization
        const { data: callerData, error: callerError } = await supabaseAdmin
            .from('users')
            .select('role, organization_id')
            .eq('id', callerUser.id)
            .single();

        if (callerError || callerData.role !== 'organizer' || callerData.organization_id !== organization_id) {
            return res.status(403).json({ error: 'Only organizers can add members to their organization' });
        }

        // Check if email already exists
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const emailExists = existingUsers?.users?.some(u => u.email === email);

        if (emailExists) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Create auth user
        const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true // Auto-confirm email
        });

        if (createAuthError) {
            console.error('[CREATE-ORG-MEMBER] Auth creation failed:', createAuthError.message);
            return res.status(400).json({ error: 'Failed to create user: ' + createAuthError.message });
        }

        // Create user profile in users table
        const { data: userData, error: profileError } = await supabaseAdmin
            .from('users')
            .insert({
                id: authData.user.id,
                email,
                name,
                role,
                organization_id
            })
            .select()
            .single();

        if (profileError) {
            console.error('[CREATE-ORG-MEMBER] Profile creation failed:', profileError.message);
            // Try to clean up the auth user
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            return res.status(400).json({ error: 'Failed to create user profile: ' + profileError.message });
        }

        console.log(`[CREATE-ORG-MEMBER] Created user ${email} with role ${role} in org ${organization_id}`);

        return res.status(200).json({
            success: true,
            user: {
                id: userData.id,
                email: userData.email,
                name: userData.name,
                role: userData.role
            }
        });

    } catch (error) {
        console.error('[CREATE-ORG-MEMBER] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
