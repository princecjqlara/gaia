-- Fix Facebook Tenant Isolation
-- This migration ensures facebook_pages allows the same page_id for different teams
-- and adds proper tenant-scoped unique constraints

-- ============================================
-- 1. DROP the global unique constraint on page_id
--    (allows different teams to connect the same Facebook page)
-- ============================================
ALTER TABLE facebook_pages DROP CONSTRAINT IF EXISTS facebook_pages_page_id_key;
DROP INDEX IF EXISTS facebook_pages_page_id_key;

-- ============================================
-- 2. ADD composite unique constraint: page_id + team_id
--    Each team can only connect a given page once
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_pages_page_team_unique
  ON facebook_pages(page_id, team_id);

-- ============================================
-- 3. ADD team_id and organization_id to facebook_settings
--    (so settings are scoped per team, not global)
-- ============================================
ALTER TABLE facebook_settings
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE facebook_settings
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_fb_settings_team ON facebook_settings(team_id);

-- ============================================
-- 4. BACKFILL: Set team_id/organization_id on existing facebook data
--    from the page record (conversations and messages inherit from their page)
-- ============================================

-- Backfill conversations from their page's team
UPDATE facebook_conversations fc
SET team_id = fp.team_id,
    organization_id = fp.organization_id
FROM facebook_pages fp
WHERE fc.page_id = fp.page_id
  AND fc.team_id IS NULL
  AND fp.team_id IS NOT NULL;

-- Backfill messages from their conversation's page
UPDATE facebook_messages fm
SET team_id = fp.team_id,
    organization_id = fp.organization_id
FROM facebook_conversations fc
JOIN facebook_pages fp ON fc.page_id = fp.page_id
WHERE fm.conversation_id = fc.conversation_id
  AND fm.team_id IS NULL
  AND fp.team_id IS NOT NULL;
