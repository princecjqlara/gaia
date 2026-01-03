-- Migration: Remove project_name and update subscription usage tracking
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: Update subscription_usage_detail structure
-- ============================================

-- First, drop the old remaining_credits column if it exists
ALTER TABLE clients 
DROP COLUMN IF EXISTS remaining_credits;

-- Add subscription_usage_detail as JSONB
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS subscription_usage_detail JSONB DEFAULT '{"videosUsed": 0, "mainVideosUsed": 0, "photosUsed": 0, "meetingMinutesUsed": 0}';

-- Update existing clients to have default usage detail structure
UPDATE clients 
SET subscription_usage_detail = '{"videosUsed": 0, "mainVideosUsed": 0, "photosUsed": 0, "meetingMinutesUsed": 0}'
WHERE subscription_usage_detail IS NULL;

-- Add NOT NULL constraint
ALTER TABLE clients 
ALTER COLUMN subscription_usage_detail SET NOT NULL;

-- Add constraint to ensure proper structure
ALTER TABLE clients 
ADD CONSTRAINT subscription_usage_detail_valid 
CHECK (
  subscription_usage_detail ? 'videosUsed' AND
  subscription_usage_detail ? 'mainVideosUsed' AND
  subscription_usage_detail ? 'photosUsed' AND
  subscription_usage_detail ? 'meetingMinutesUsed' AND
  (subscription_usage_detail->>'videosUsed')::integer >= 0 AND
  (subscription_usage_detail->>'mainVideosUsed')::integer >= 0 AND
  (subscription_usage_detail->>'photosUsed')::integer >= 0 AND
  (subscription_usage_detail->>'meetingMinutesUsed')::integer >= 0
);

-- Add column comment for documentation
COMMENT ON COLUMN clients.subscription_usage_detail IS 
'Tracks subscription usage: videosUsed (15-sec videos), mainVideosUsed, photosUsed, meetingMinutesUsed';

-- ============================================
-- STEP 2: Remove project_name column
-- ============================================

-- Drop the project_name column
ALTER TABLE clients 
DROP COLUMN IF EXISTS project_name;

-- ============================================
-- ROLLBACK (if needed)
-- ============================================
-- To rollback this migration, run:
-- ALTER TABLE clients DROP CONSTRAINT IF EXISTS subscription_usage_detail_valid;
-- ALTER TABLE clients DROP COLUMN IF EXISTS subscription_usage_detail;
-- ALTER TABLE clients ADD COLUMN project_name TEXT;

