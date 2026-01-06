-- Add missing AI analysis columns to facebook_conversations table
-- Run this in Supabase SQL Editor if you get errors about missing columns

-- AI Analysis columns
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT '{}';
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_notes TEXT;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS extracted_details JSONB DEFAULT '{}';
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS meeting_detected BOOLEAN DEFAULT false;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS meeting_datetime TIMESTAMPTZ;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS auto_booked_meeting_id UUID;

-- Archive column (for archiving conversations)
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Conversation tracking columns (for advanced filtering)
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS has_booking BOOLEAN DEFAULT false;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS last_reply_from TEXT; -- 'page' or 'customer'
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS proposal_status TEXT; -- 'none', 'sent', 'waiting', 'accepted', 'declined'
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- Create index for archived conversations
CREATE INDEX IF NOT EXISTS idx_fb_conversations_archived ON facebook_conversations(is_archived);
