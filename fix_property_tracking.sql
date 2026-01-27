-- Fix Property Views Relationship and Columns
-- 1. Add Foreign Key for properties relation
ALTER TABLE property_views DROP CONSTRAINT IF EXISTS property_views_property_id_fkey;
ALTER TABLE property_views
ADD CONSTRAINT property_views_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
-- 2. Add viewed_at column if missing (some code queries it)
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT NOW();
-- update existing rows to have viewed_at = created_at if null
UPDATE property_views
SET viewed_at = created_at
WHERE viewed_at IS NULL;
-- 3. Ensure visitor_name column exists (from previous step, just to be safe)
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS visitor_name TEXT;
-- 4. Enable RLS and add policies just in case
ALTER TABLE property_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can insert views" ON property_views;
CREATE POLICY "Public can insert views" ON property_views FOR
INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can read views" ON property_views;
CREATE POLICY "Authenticated can read views" ON property_views FOR
SELECT USING (auth.role() = 'authenticated');