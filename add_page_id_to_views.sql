-- Add page_id column to property_views table if it doesn't exist
ALTER TABLE property_views 
ADD COLUMN IF NOT EXISTS page_id TEXT;

-- Create index on page_id for faster lookup
CREATE INDEX IF NOT EXISTS idx_property_views_page_id ON property_views(page_id);

-- Optional: Add index on visitor_name + page_id for the fallback lookup
CREATE INDEX IF NOT EXISTS idx_property_views_visitor_page ON property_views(visitor_name, page_id);
