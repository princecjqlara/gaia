-- Add visitor_name column to property_views for personalized link tracking
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS visitor_name TEXT;
-- Also add property_title if it's missing (as it was used in PropertyPreview but missing in schema definition)
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS property_title TEXT;
-- Enhance RLS to ensure public can insert these new columns
-- Currently: CREATE POLICY "Anyone can insert views" ON property_views FOR INSERT WITH CHECK (true);
-- This already covers new columns.