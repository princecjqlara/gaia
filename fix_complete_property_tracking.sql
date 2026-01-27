-- Complete Fix for Property View Tracking
-- Run this in Supabase SQL Editor
-- 1. Ensure the properties table has bedrooms and bathrooms columns
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS bedrooms INTEGER DEFAULT 0;
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS bathrooms INTEGER DEFAULT 0;
-- 2. Ensure property_views table has all required columns
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS participant_id TEXT;
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS visitor_name TEXT;
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'website';
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS property_title TEXT;
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS view_duration INTEGER DEFAULT 0;
-- 3. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_property_views_participant_id ON property_views(participant_id);
CREATE INDEX IF NOT EXISTS idx_property_views_visitor_name ON property_views(visitor_name);
-- 4. Enable RLS and create policies to allow public inserts
ALTER TABLE property_views ENABLE ROW LEVEL SECURITY;
-- Drop old policies if they exist
DROP POLICY IF EXISTS "Public can insert views" ON property_views;
DROP POLICY IF EXISTS "Anyone can insert property views" ON property_views;
DROP POLICY IF EXISTS "Authenticated can read views" ON property_views;
DROP POLICY IF EXISTS "Authenticated can read property views" ON property_views;
-- Allow anyone (including anonymous users) to insert property views
CREATE POLICY "Anyone can insert property views" ON property_views FOR
INSERT WITH CHECK (true);
-- Allow authenticated users to read property views
CREATE POLICY "Authenticated can read property views" ON property_views FOR
SELECT USING (auth.role() = 'authenticated');
-- 5. Grant permissions to service role and anon
GRANT INSERT ON property_views TO anon;
GRANT INSERT ON property_views TO authenticated;
GRANT SELECT ON property_views TO authenticated;
-- Done! Property tracking should now work correctly.