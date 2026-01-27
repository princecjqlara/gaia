-- FIX AI ANALYSIS AND BEST TIME TRACKING
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================
-- 1. CREATE contact_engagement TABLE (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS contact_engagement (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    page_id TEXT,
    participant_id TEXT,
    message_direction TEXT DEFAULT 'inbound',
    day_of_week INTEGER,
    hour_of_day INTEGER,
    engagement_score FLOAT DEFAULT 1,
    response_latency_seconds INTEGER,
    message_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Add unique constraint if it doesn't exist (for upsert support)
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_engagement_conv_ts_unique'
) THEN
ALTER TABLE contact_engagement
ADD CONSTRAINT contact_engagement_conv_ts_unique UNIQUE (conversation_id, message_timestamp);
END IF;
END $$;
-- Disable RLS for easy access
ALTER TABLE contact_engagement DISABLE ROW LEVEL SECURITY;
-- Grant all permissions
GRANT ALL ON contact_engagement TO anon;
GRANT ALL ON contact_engagement TO authenticated;
GRANT ALL ON contact_engagement TO service_role;
-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contact_engagement_conv ON contact_engagement(conversation_id);
CREATE INDEX IF NOT EXISTS idx_contact_engagement_time ON contact_engagement(day_of_week, hour_of_day);
-- ============================================
-- 2. ADD ai_summary AND extracted_details COLUMNS TO facebook_conversations
-- ============================================
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS ai_notes TEXT;
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS extracted_details JSONB;
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS agent_context TEXT;
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS intuition_followup_disabled BOOLEAN DEFAULT FALSE;
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS best_time_scheduling_disabled BOOLEAN DEFAULT FALSE;
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMPTZ;
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS meeting_detected BOOLEAN DEFAULT FALSE;
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS meeting_datetime TIMESTAMPTZ;
-- ============================================
-- 3. CREATE ai_followup_schedule TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_followup_schedule (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    page_id TEXT,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending',
    message_content TEXT,
    followup_type TEXT DEFAULT 'auto',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);
ALTER TABLE ai_followup_schedule DISABLE ROW LEVEL SECURITY;
GRANT ALL ON ai_followup_schedule TO anon;
GRANT ALL ON ai_followup_schedule TO authenticated;
GRANT ALL ON ai_followup_schedule TO service_role;
CREATE INDEX IF NOT EXISTS idx_followup_conv ON ai_followup_schedule(conversation_id);
CREATE INDEX IF NOT EXISTS idx_followup_status ON ai_followup_schedule(status, scheduled_for);
-- ============================================
-- 4. CREATE ai_action_log TABLE FOR HISTORY
-- ============================================
CREATE TABLE IF NOT EXISTS ai_action_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_action_log DISABLE ROW LEVEL SECURITY;
GRANT ALL ON ai_action_log TO anon;
GRANT ALL ON ai_action_log TO authenticated;
GRANT ALL ON ai_action_log TO service_role;
-- ============================================
-- 5. BACKFILL ENGAGEMENT DATA FROM EXISTING MESSAGES
-- This will populate best time to contact data
-- ============================================
INSERT INTO contact_engagement (
        conversation_id,
        message_direction,
        day_of_week,
        hour_of_day,
        engagement_score,
        message_timestamp
    )
SELECT conversation_id,
    CASE
        WHEN is_from_page THEN 'outbound'
        ELSE 'inbound'
    END,
    EXTRACT(
        DOW
        FROM timestamp
    )::INTEGER,
    EXTRACT(
        HOUR
        FROM timestamp
    )::INTEGER,
    1,
    timestamp
FROM facebook_messages
WHERE timestamp > NOW() - INTERVAL '30 days'
    AND conversation_id IS NOT NULL ON CONFLICT (conversation_id, message_timestamp) DO NOTHING;
SELECT 'SUCCESS: AI analysis tables created, columns added, and engagement data backfilled!' as result;