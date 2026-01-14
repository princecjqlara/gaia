-- Migration: Add response deadline setting
-- This adds a configurable response deadline for contacts

-- Add the response_deadline_hours setting to facebook_settings
INSERT INTO facebook_settings (setting_key, setting_value, updated_at)
VALUES ('response_deadline_hours', '24', NOW())
ON CONFLICT (setting_key) DO NOTHING;

-- Add comment for clarity
COMMENT ON TABLE facebook_settings IS 'Stores Facebook Messenger settings including response deadline hours';
