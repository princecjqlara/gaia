-- Multi-Tenant Architecture Migration
-- Run this in Supabase SQL Editor
-- This creates the organizations table and adds organization_id to all data tables
-- ============================================
-- 1. CREATE ORGANIZATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    -- URL-friendly identifier (e.g., "acme-corp")
    owner_id UUID REFERENCES auth.users(id) ON DELETE
    SET NULL,
        settings JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Add indexes for organizations
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
-- Enable RLS on organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
-- ============================================
-- 2. UPDATE USERS TABLE
-- ============================================
-- Add organization_id column to users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE
SET NULL;
-- Update role check constraint to include 'organizer'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
ADD CONSTRAINT users_role_check CHECK (
        role IN ('organizer', 'admin', 'user', 'chat_support')
    );
-- Add index for organization lookups
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);
-- ============================================
-- 3. ADD organization_id TO DATA TABLES
-- ============================================
-- Clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_clients_organization ON clients(organization_id);
-- Facebook Pages table
ALTER TABLE facebook_pages
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fb_pages_organization ON facebook_pages(organization_id);
-- Facebook Conversations table
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fb_conv_organization ON facebook_conversations(organization_id);
-- Facebook Messages table
ALTER TABLE facebook_messages
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fb_msg_organization ON facebook_messages(organization_id);
-- Properties table
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_properties_organization ON properties(organization_id);
-- Property Views table
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_property_views_organization ON property_views(organization_id);
-- Stage History table
ALTER TABLE stage_history
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_stage_history_organization ON stage_history(organization_id);
-- Settings table (add organization_id for org-specific settings)
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
-- ============================================
-- 4. HELPER FUNCTIONS
-- ============================================
-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Function to get user's organization_id (avoids RLS recursion)
CREATE OR REPLACE FUNCTION get_user_organization_id() RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
SELECT organization_id
FROM users
WHERE id = auth.uid();
$$;
-- Function to check if user is an organizer
CREATE OR REPLACE FUNCTION is_organizer() RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
SELECT EXISTS (
        SELECT 1
        FROM users
        WHERE id = auth.uid()
            AND role = 'organizer'
    );
$$;
-- Function to check if user is an admin or organizer
CREATE OR REPLACE FUNCTION is_admin_or_organizer() RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
SELECT EXISTS (
        SELECT 1
        FROM users
        WHERE id = auth.uid()
            AND role IN ('admin', 'organizer')
    );
$$;
-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_user_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION is_organizer() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin_or_organizer() TO authenticated;
-- ============================================
-- 5. RLS POLICIES FOR TENANT ISOLATION
-- ============================================
-- Organizations: Only owners can manage, members can view their org
DROP POLICY IF EXISTS "Organizers can manage their organization" ON organizations;
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
CREATE POLICY "Organizers can manage their organization" ON organizations FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can view their organization" ON organizations FOR
SELECT USING (id = get_user_organization_id());
-- Users: Tenant isolation
DROP POLICY IF EXISTS "Users can see members of their organization" ON users;
DROP POLICY IF EXISTS "Organizers can manage users in their organization" ON users;
CREATE POLICY "Users can see members of their organization" ON users FOR
SELECT USING (
        organization_id = get_user_organization_id()
        OR id = auth.uid()
    );
CREATE POLICY "Organizers can manage users in their organization" ON users FOR ALL USING (
    is_organizer()
    AND organization_id = get_user_organization_id()
);
-- Clients: Tenant isolation
DROP POLICY IF EXISTS "Tenant isolation for clients" ON clients;
DROP POLICY IF EXISTS "Clients are viewable by authenticated users" ON clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON clients;
CREATE POLICY "Tenant isolation for clients" ON clients FOR ALL USING (organization_id = get_user_organization_id());
-- Facebook Pages: Tenant isolation
DROP POLICY IF EXISTS "Tenant isolation for facebook_pages" ON facebook_pages;
DROP POLICY IF EXISTS "Agents can access facebook pages" ON facebook_pages;
CREATE POLICY "Tenant isolation for facebook_pages" ON facebook_pages FOR ALL USING (organization_id = get_user_organization_id());
-- Facebook Conversations: Tenant isolation
DROP POLICY IF EXISTS "Tenant isolation for facebook_conversations" ON facebook_conversations;
DROP POLICY IF EXISTS "Agents can access conversations" ON facebook_conversations;
CREATE POLICY "Tenant isolation for facebook_conversations" ON facebook_conversations FOR ALL USING (organization_id = get_user_organization_id());
-- Facebook Messages: Tenant isolation
DROP POLICY IF EXISTS "Tenant isolation for facebook_messages" ON facebook_messages;
DROP POLICY IF EXISTS "Agents can access messages" ON facebook_messages;
CREATE POLICY "Tenant isolation for facebook_messages" ON facebook_messages FOR ALL USING (organization_id = get_user_organization_id());
-- Properties: Tenant isolation (keep public read for listings)
DROP POLICY IF EXISTS "Tenant isolation for properties" ON properties;
DROP POLICY IF EXISTS "Authenticated users can manage properties" ON properties;
DROP POLICY IF EXISTS "Public properties are viewable by everyone" ON properties;
DROP POLICY IF EXISTS "Tenant isolation for properties management" ON properties;
DROP POLICY IF EXISTS "Tenant isolation for properties update" ON properties;
DROP POLICY IF EXISTS "Tenant isolation for properties delete" ON properties;
CREATE POLICY "Public properties are viewable by everyone" ON properties FOR
SELECT USING (true);
CREATE POLICY "Tenant isolation for properties management" ON properties FOR
INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "Tenant isolation for properties update" ON properties FOR
UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "Tenant isolation for properties delete" ON properties FOR DELETE USING (organization_id = get_user_organization_id());
-- Property Views: Tenant isolation
DROP POLICY IF EXISTS "Tenant isolation for property_views" ON property_views;
CREATE POLICY "Tenant isolation for property_views" ON property_views FOR
SELECT USING (organization_id = get_user_organization_id());
-- Stage History: Tenant isolation
DROP POLICY IF EXISTS "Tenant isolation for stage_history" ON stage_history;
DROP POLICY IF EXISTS "History is viewable by authenticated users" ON stage_history;
DROP POLICY IF EXISTS "Authenticated users can insert history" ON stage_history;
CREATE POLICY "Tenant isolation for stage_history" ON stage_history FOR ALL USING (organization_id = get_user_organization_id());
-- Settings: Organization-specific settings
DROP POLICY IF EXISTS "Tenant isolation for settings" ON settings;
DROP POLICY IF EXISTS "Settings are viewable by authenticated users" ON settings;
DROP POLICY IF EXISTS "Admins can manage settings" ON settings;
-- Global settings (no org_id) are viewable by all
CREATE POLICY "Global settings are viewable by all" ON settings FOR
SELECT USING (organization_id IS NULL);
-- Org-specific settings are only for that org
CREATE POLICY "Org settings viewable by org members" ON settings FOR
SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "Admins can manage org settings" ON settings FOR ALL USING (
    is_admin_or_organizer()
    AND (
        organization_id = get_user_organization_id()
        OR organization_id IS NULL
    )
);
-- ============================================
-- 6. TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE TRIGGER organizations_updated_at BEFORE
UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- ============================================
-- 7. MIGRATION: CREATE DEFAULT ORGANIZATION
-- ============================================
-- This creates a default organization for existing data
-- You should run this once and then assign existing users/data to this org
DO $$
DECLARE default_org_id UUID;
BEGIN -- Create default organization if it doesn't exist
INSERT INTO organizations (name, slug, settings)
VALUES ('Default Organization', 'default', '{}') ON CONFLICT (slug) DO NOTHING
RETURNING id INTO default_org_id;
-- If insert didn't return (already exists), get the id
IF default_org_id IS NULL THEN
SELECT id INTO default_org_id
FROM organizations
WHERE slug = 'default';
END IF;
-- Update all existing users without an org to default org
UPDATE users
SET organization_id = default_org_id
WHERE organization_id IS NULL;
-- Update all existing data tables to default org
UPDATE clients
SET organization_id = default_org_id
WHERE organization_id IS NULL;
UPDATE facebook_pages
SET organization_id = default_org_id
WHERE organization_id IS NULL;
UPDATE facebook_conversations
SET organization_id = default_org_id
WHERE organization_id IS NULL;
UPDATE facebook_messages
SET organization_id = default_org_id
WHERE organization_id IS NULL;
UPDATE properties
SET organization_id = default_org_id
WHERE organization_id IS NULL;
UPDATE property_views
SET organization_id = default_org_id
WHERE organization_id IS NULL;
UPDATE stage_history
SET organization_id = default_org_id
WHERE organization_id IS NULL;
RAISE NOTICE 'Default organization ID: %',
default_org_id;
END $$;