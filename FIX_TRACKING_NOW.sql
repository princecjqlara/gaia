-- MASTER FIX FOR PROPERTY TRACKING
-- Run this ENTIRE script in Supabase SQL Editor
-- This fixes ALL issues with property view tracking
-- ============================================
-- 1. ENSURE property_views TABLE EXISTS
-- ============================================
CREATE TABLE IF NOT EXISTS property_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    property_id UUID,
    property_title TEXT,
    viewer_id UUID,
    visitor_name TEXT,
    participant_id TEXT,
    view_duration INTEGER DEFAULT 0,
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    source TEXT DEFAULT 'website',
    gallery_viewed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Add any missing columns
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS property_title TEXT;
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS visitor_name TEXT;
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS participant_id TEXT;
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS view_duration INTEGER DEFAULT 0;
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'website';
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS gallery_viewed BOOLEAN DEFAULT FALSE;
-- ============================================
-- 2. DISABLE RLS (simplest fix for public access)
-- ============================================
ALTER TABLE property_views DISABLE ROW LEVEL SECURITY;
-- ============================================
-- 3. GRANT ALL PERMISSIONS
-- ============================================
GRANT ALL ON property_views TO anon;
GRANT ALL ON property_views TO authenticated;
GRANT ALL ON property_views TO service_role;
-- ============================================
-- 4. FIX properties TABLE RLS FOR READING
-- ============================================
ALTER TABLE properties DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON properties TO anon;
GRANT SELECT ON properties TO authenticated;
-- ============================================
-- 5. FIX facebook_conversations FOR LOOKUPS
-- ============================================
-- DROP existing policies first
DROP POLICY IF EXISTS "Public can read facebook_conversations" ON facebook_conversations;
-- Add public read for participant lookups (needed for insights)
ALTER TABLE facebook_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read facebook_conversations" ON facebook_conversations FOR
SELECT USING (true);
-- ============================================
-- 6. CREATE INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_property_views_participant ON property_views(participant_id);
CREATE INDEX IF NOT EXISTS idx_property_views_visitor_name ON property_views(visitor_name);
CREATE INDEX IF NOT EXISTS idx_property_views_property_id ON property_views(property_id);
CREATE INDEX IF NOT EXISTS idx_property_views_created_at ON property_views(created_at DESC);
-- ============================================
-- 7. TEST INSERT (should succeed)
-- ============================================
-- Uncomment to test:
-- INSERT INTO property_views (property_title, source) VALUES ('Test View', 'test');
-- SELECT * FROM property_views WHERE source = 'test';
-- DELETE FROM property_views WHERE source = 'test';
SELECT 'SUCCESS: Property tracking is now enabled!' as result;