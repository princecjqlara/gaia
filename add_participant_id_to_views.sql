-- Add participant_id to property_views for more reliable link tracking
ALTER TABLE property_views
ADD COLUMN IF NOT EXISTS participant_id TEXT;
-- Index it for faster queries
CREATE INDEX IF NOT EXISTS idx_property_views_participant_id ON property_views(participant_id);