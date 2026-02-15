import { createClient } from '@supabase/supabase-js';

/**
 * Unified Team Management API
 * POST /api/team?action=create-team       → Create team with admin (organizers only)
 * POST /api/team?action=create-member     → Add member to team (admins/organizers)
 */
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    // Authenticate caller
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !callerUser) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const { data: callerData, error: callerError } = await supabaseAdmin
        .from('users')
        .select('role, organization_id, team_id')
        .eq('id', callerUser.id)
        .single();

    if (callerError || !callerData) {
        return res.status(403).json({ error: 'Unable to verify caller' });
    }

    const action = req.query.action || req.body.action;

    try {
        if (action === 'create-team') {
            return await handleCreateTeam(req, res, supabaseAdmin, callerData);
        } else if (action === 'create-member') {
            return await handleCreateMember(req, res, supabaseAdmin, callerData);
        } else {
            return res.status(400).json({ error: 'Invalid action. Use ?action=create-team or ?action=create-member' });
        }
    } catch (error) {
        console.error('[TEAM] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

async function handleCreateTeam(req, res, supabaseAdmin, callerData) {
    if (callerData.role !== 'organizer') {
        return res.status(403).json({ error: 'Only organizers can create teams' });
    }

    const { team_name, admin_email, admin_name, admin_password } = req.body;
    if (!team_name || !admin_email || !admin_name || !admin_password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    if (existingUsers?.users?.some(u => u.email === admin_email)) {
        return res.status(400).json({ error: 'Email already registered' });
    }

    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
        email: admin_email,
        password: admin_password,
        email_confirm: true
    });

    if (createAuthError) {
        return res.status(400).json({ error: 'Failed to create admin: ' + createAuthError.message });
    }

    const { data: teamData, error: teamError } = await supabaseAdmin
        .from('teams')
        .insert({ name: team_name, admin_id: authData.user.id, organization_id: callerData.organization_id })
        .select()
        .single();

    if (teamError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return res.status(400).json({ error: 'Failed to create team: ' + teamError.message });
    }

    const { data: userData, error: profileError } = await supabaseAdmin
        .from('users')
        .insert({ id: authData.user.id, email: admin_email, name: admin_name, role: 'admin', organization_id: callerData.organization_id, team_id: teamData.id })
        .select()
        .single();

    if (profileError) {
        await supabaseAdmin.from('teams').delete().eq('id', teamData.id);
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return res.status(400).json({ error: 'Failed to create admin profile: ' + profileError.message });
    }

    return res.status(200).json({
        success: true,
        team: teamData,
        admin: { id: userData.id, email: userData.email, name: userData.name, role: userData.role }
    });
}

async function handleCreateMember(req, res, supabaseAdmin, callerData) {
    if (!['admin', 'organizer'].includes(callerData.role)) {
        return res.status(403).json({ error: 'Only admins or organizers can add team members' });
    }

    if (!callerData.organization_id) {
        return res.status(400).json({ error: 'Caller has no organization' });
    }

    const { email, name, password, role, team_id } = req.body;
    if (!email || !name || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedRole = role || 'user';
    const allowedRoles = ['admin', 'user', 'chat_support'];
    if (!allowedRoles.includes(normalizedRole)) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    let targetTeamId = callerData.team_id || null;
    if (callerData.role === 'organizer') {
        const requestedTeamId = team_id || targetTeamId;
        if (!requestedTeamId) {
            return res.status(400).json({ error: 'team_id is required for organizers' });
        }
        const { data: teamData, error: teamError } = await supabaseAdmin
            .from('teams').select('id, organization_id').eq('id', requestedTeamId).single();
        if (teamError || !teamData || teamData.organization_id !== callerData.organization_id) {
            return res.status(403).json({ error: 'Team not found in your organization' });
        }
        targetTeamId = requestedTeamId;
    }

    if (!targetTeamId) {
        return res.status(400).json({ error: 'No team assigned to this account' });
    }

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    if (existingUsers?.users?.some(u => u.email === email)) {
        return res.status(400).json({ error: 'Email already registered' });
    }

    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name }
    });

    if (createAuthError || !authData?.user) {
        return res.status(400).json({ error: 'Failed to create user: ' + (createAuthError?.message || 'Unknown error') });
    }

    const { data: userData, error: profileError } = await supabaseAdmin
        .from('users')
        .upsert({ id: authData.user.id, email, name, role: normalizedRole, organization_id: callerData.organization_id, team_id: targetTeamId }, { onConflict: 'id' })
        .select()
        .single();

    if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return res.status(400).json({ error: 'Failed to create user profile: ' + profileError.message });
    }

    return res.status(200).json({
        success: true,
        user: { id: userData.id, email: userData.email, name: userData.name, role: userData.role }
    });
}
