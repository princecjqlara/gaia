-- Add property tracking columns to facebook_conversations
-- Run this in Supabase SQL Editor
-- Add columns for tracking last viewed property
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS last_property_viewed UUID REFERENCES properties(id);
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS last_property_viewed_at TIMESTAMPTZ;
-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_facebook_conversations_last_property_viewed ON facebook_conversations(last_property_viewed)
WHERE last_property_viewed IS NOT NULL;
-- Done!