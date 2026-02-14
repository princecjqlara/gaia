-- Invite Codes Migration
-- Run this in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS invite_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    max_uses INT DEFAULT 10,
    uses INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_team ON invite_codes(team_id);

-- Enable RLS
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- Policies: team members can view their team's codes
CREATE POLICY "Team members can view invite codes"
    ON invite_codes FOR SELECT
    USING (team_id = get_user_team_id());

-- Admins can manage their team's codes
CREATE POLICY "Team admins can manage invite codes"
    ON invite_codes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM teams
            WHERE teams.id = invite_codes.team_id
            AND teams.admin_id = auth.uid()
        )
    );

-- Allow anyone (including anon/unauthenticated) to validate a code during signup
-- This uses a stored function approach for security
CREATE OR REPLACE FUNCTION validate_invite_code(invite_code TEXT)
RETURNS TABLE (
    valid BOOLEAN,
    team_id UUID,
    team_name TEXT,
    organization_id UUID
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        true AS valid,
        ic.team_id,
        t.name AS team_name,
        t.organization_id
    FROM invite_codes ic
    JOIN teams t ON t.id = ic.team_id
    WHERE ic.code = invite_code
        AND ic.is_active = true
        AND ic.uses < ic.max_uses
        AND (ic.expires_at IS NULL OR ic.expires_at > NOW());

    -- If no rows returned, return invalid
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::UUID;
    END IF;
END;
$$;

-- Function to redeem an invite code (increment uses)
CREATE OR REPLACE FUNCTION redeem_invite_code(invite_code TEXT)
RETURNS TABLE (
    success BOOLEAN,
    team_id UUID,
    organization_id UUID
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_team_id UUID;
    v_org_id UUID;
BEGIN
    -- Find and lock the code
    SELECT ic.team_id, t.organization_id
    INTO v_team_id, v_org_id
    FROM invite_codes ic
    JOIN teams t ON t.id = ic.team_id
    WHERE ic.code = invite_code
        AND ic.is_active = true
        AND ic.uses < ic.max_uses
        AND (ic.expires_at IS NULL OR ic.expires_at > NOW())
    FOR UPDATE;

    IF v_team_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::UUID;
        RETURN;
    END IF;

    -- Increment uses
    UPDATE invite_codes SET uses = uses + 1 WHERE code = invite_code;

    RETURN QUERY SELECT true, v_team_id, v_org_id;
END;
$$;

-- Grant execute to authenticated and anon (needed during signup before user is fully authenticated)
GRANT EXECUTE ON FUNCTION validate_invite_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_invite_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION redeem_invite_code(TEXT) TO authenticated;
