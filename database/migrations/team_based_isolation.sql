-- Team-Based Data Isolation Migration
-- Run this in Supabase SQL Editor
-- This creates teams and updates all tables to use team_id for data isolation
-- ============================================
-- 1. CREATE TEAMS TABLE
-- ============================================
-- Drop table if exists to avoid conflicts (only for fresh install - comment out if you have data)
-- DROP TABLE IF EXISTS teams CASCADE;
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    admin_id UUID,
    -- Will reference users table, no FK to avoid issues
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Indexes for teams
CREATE INDEX IF NOT EXISTS idx_teams_admin ON teams(admin_id);
CREATE INDEX IF NOT EXISTS idx_teams_organization ON teams(organization_id);
-- Enable RLS on teams
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
-- ============================================
-- 2. ADD team_id TO USERS TABLE
-- ============================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE
SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);
-- ============================================
-- 3. ADD team_id TO ALL DATA TABLES
-- ============================================
-- Clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_clients_team ON clients(team_id);
-- Facebook Pages table
ALTER TABLE facebook_pages
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fb_pages_team ON facebook_pages(team_id);
-- Facebook Conversations table
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fb_conv_team ON facebook_conversations(team_id);
-- Facebook Messages table
ALTER TABLE facebook_messages
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fb_msg_team ON facebook_messages(team_id);
-- Properties table
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_properties_team ON properties(team_id);
-- Property Views table
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_property_views_team ON property_views(team_id);
-- Stage History table
ALTER TABLE stage_history
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_stage_history_team ON stage_history(team_id);
-- ============================================
-- 4. HELPER FUNCTIONS FOR TEAM ISOLATION
-- ============================================
-- Function to get user's team_id
CREATE OR REPLACE FUNCTION get_user_team_id() RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
SELECT team_id
FROM users
WHERE id = auth.uid();
$$;
-- Function to check if user is a team admin
CREATE OR REPLACE FUNCTION is_team_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
SELECT EXISTS (
        SELECT 1
        FROM teams
        WHERE admin_id = auth.uid()
    );
$$;
-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_user_team_id() TO authenticated;
GRANT EXECUTE ON FUNCTION is_team_admin() TO authenticated;
-- ============================================
-- 5. RLS POLICIES FOR TEAM ISOLATION
-- ============================================
-- Teams: Organizers can see all teams in their org, admins can see their own team
DROP POLICY IF EXISTS "Organizers can view all teams" ON teams;
DROP POLICY IF EXISTS "Admins can view their team" ON teams;
DROP POLICY IF EXISTS "Organizers can manage teams" ON teams;
CREATE POLICY "Organizers can view all teams" ON teams FOR
SELECT USING (
        is_organizer()
        AND organization_id = get_user_organization_id()
    );
CREATE POLICY "Admins can view their team" ON teams FOR
SELECT USING (
        admin_id = auth.uid()
        OR id = get_user_team_id()
    );
CREATE POLICY "Organizers can manage teams" ON teams FOR ALL USING (
    is_organizer()
    AND organization_id = get_user_organization_id()
);
-- Clients: Team isolation
DROP POLICY IF EXISTS "Team isolation for clients" ON clients;
DROP POLICY IF EXISTS "Tenant isolation for clients" ON clients;
CREATE POLICY "Team isolation for clients" ON clients FOR ALL USING (team_id = get_user_team_id());
-- Facebook Pages: Team isolation
DROP POLICY IF EXISTS "Team isolation for facebook_pages" ON facebook_pages;
DROP POLICY IF EXISTS "Tenant isolation for facebook_pages" ON facebook_pages;
CREATE POLICY "Team isolation for facebook_pages" ON facebook_pages FOR ALL USING (team_id = get_user_team_id());
-- Facebook Conversations: Team isolation
DROP POLICY IF EXISTS "Team isolation for facebook_conversations" ON facebook_conversations;
DROP POLICY IF EXISTS "Tenant isolation for facebook_conversations" ON facebook_conversations;
CREATE POLICY "Team isolation for facebook_conversations" ON facebook_conversations FOR ALL USING (team_id = get_user_team_id());
-- Facebook Messages: Team isolation
DROP POLICY IF EXISTS "Team isolation for facebook_messages" ON facebook_messages;
DROP POLICY IF EXISTS "Tenant isolation for facebook_messages" ON facebook_messages;
CREATE POLICY "Team isolation for facebook_messages" ON facebook_messages FOR ALL USING (team_id = get_user_team_id());
-- Properties: Team isolation (keep public read)
DROP POLICY IF EXISTS "Team isolation for properties" ON properties;
CREATE POLICY "Team isolation for properties insert" ON properties FOR
INSERT WITH CHECK (team_id = get_user_team_id());
CREATE POLICY "Team isolation for properties update" ON properties FOR
UPDATE USING (team_id = get_user_team_id());
CREATE POLICY "Team isolation for properties delete" ON properties FOR DELETE USING (team_id = get_user_team_id());
-- Stage History: Team isolation
DROP POLICY IF EXISTS "Team isolation for stage_history" ON stage_history;
DROP POLICY IF EXISTS "Tenant isolation for stage_history" ON stage_history;
CREATE POLICY "Team isolation for stage_history" ON stage_history FOR ALL USING (team_id = get_user_team_id());
-- Users: Team members can see their team
DROP POLICY IF EXISTS "Team members can see teammates" ON users;
CREATE POLICY "Team members can see teammates" ON users FOR
SELECT USING (
        team_id = get_user_team_id()
        OR id = auth.uid()
        OR (
            is_organizer()
            AND organization_id = get_user_organization_id()
        )
    );
-- ============================================
-- 6. TRIGGER FOR teams updated_at
-- ============================================
DROP TRIGGER IF EXISTS teams_updated_at ON teams;
CREATE TRIGGER teams_updated_at BEFORE
UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- ============================================
-- 7. MIGRATION: Create default team for existing admins
-- ============================================
DO $$
DECLARE admin_record RECORD;
new_team_id UUID;
default_org_id UUID;
BEGIN -- Get default organization
SELECT id INTO default_org_id
FROM organizations
WHERE slug = 'default';
-- For each admin without a team, create one
FOR admin_record IN
SELECT id,
    email,
    name
FROM users
WHERE role = 'admin'
    AND team_id IS NULL LOOP -- Create team for this admin
INSERT INTO teams (name, admin_id, organization_id)
VALUES (
        admin_record.name || '''s Team',
        admin_record.id,
        default_org_id
    )
RETURNING id INTO new_team_id;
-- Assign admin to their team
UPDATE users
SET team_id = new_team_id
WHERE id = admin_record.id;
RAISE NOTICE 'Created team for admin: %',
admin_record.email;
END LOOP;
-- Migrate existing data to teams (assign to the first team in org if exists)
-- This is a fallback for orphaned data
UPDATE clients
SET team_id = (
        SELECT id
        FROM teams
        LIMIT 1
    )
WHERE team_id IS NULL
    AND (
        SELECT COUNT(*)
        FROM teams
    ) > 0;
UPDATE facebook_pages
SET team_id = (
        SELECT id
        FROM teams
        LIMIT 1
    )
WHERE team_id IS NULL
    AND (
        SELECT COUNT(*)
        FROM teams
    ) > 0;
UPDATE facebook_conversations
SET team_id = (
        SELECT id
        FROM teams
        LIMIT 1
    )
WHERE team_id IS NULL
    AND (
        SELECT COUNT(*)
        FROM teams
    ) > 0;
UPDATE properties
SET team_id = (
        SELECT id
        FROM teams
        LIMIT 1
    )
WHERE team_id IS NULL
    AND (
        SELECT COUNT(*)
        FROM teams
    ) > 0;
END $$;
-- ============================================
-- 8. VIEW: Team statistics for organizer dashboard
-- ============================================
CREATE OR REPLACE VIEW team_stats AS
SELECT t.id AS team_id,
    t.name AS team_name,
    t.admin_id,
    u.name AS admin_name,
    u.email AS admin_email,
    t.organization_id,
    t.created_at,
    (
        SELECT COUNT(*)
        FROM users
        WHERE team_id = t.id
    ) AS user_count,
    (
        SELECT COUNT(*)
        FROM clients
        WHERE team_id = t.id
    ) AS client_count,
    (
        SELECT COUNT(*)
        FROM facebook_pages
        WHERE team_id = t.id
    ) AS facebook_page_count,
    (
        SELECT COUNT(*)
        FROM properties
        WHERE team_id = t.id
    ) AS property_count
FROM teams t
    LEFT JOIN users u ON t.admin_id = u.id;