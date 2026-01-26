-- Advanced Team Personalization Migration
-- Adds featured status and custom labels to properties
-- Updates teams branding structure for WhatsApp and Bio
-- 1. Update properties table
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS label TEXT;
-- 2. Update teams branding default (in comment for reference, will modify in code)
-- The branding column is JSONB, so we just need to ensure the UI handles the new fields:
-- whatsapp_url, bio, stats (array/object)
-- 3. Create leads table (optional but recommended for public inquiries)
-- For now, we'll use the clients table with a 'Lead' status, but let's add a 'source' column to clients if it doesn't exist.
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'CRM';
-- Index for featured listings
CREATE INDEX IF NOT EXISTS idx_properties_featured ON properties(is_featured)
WHERE is_featured = true;