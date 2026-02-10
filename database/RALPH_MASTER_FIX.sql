-- RALPH MASTER FIX SCRIPT
-- Consolidates fixes from FIX_AI_ANALYSIS.sql and high_priority_features.sql
-- Run this in Supabase SQL Editor to ensure all tables and columns exist.
-- ============================================
-- 1. AI & ENGAGEMENT TABLES
-- ============================================
-- contact_engagement
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
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_engagement_conv_ts_unique'
) THEN
ALTER TABLE contact_engagement
ADD CONSTRAINT contact_engagement_conv_ts_unique UNIQUE (conversation_id, message_timestamp);
END IF;
END $$;
-- ai_followup_schedule
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
-- ai_action_log
CREATE TABLE IF NOT EXISTS ai_action_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Enable RLS disable for AI tables (as per original script)
ALTER TABLE contact_engagement DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_followup_schedule DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action_log DISABLE ROW LEVEL SECURITY;
GRANT ALL ON contact_engagement TO anon,
    authenticated,
    service_role;
GRANT ALL ON ai_followup_schedule TO anon,
    authenticated,
    service_role;
GRANT ALL ON ai_action_log TO anon,
    authenticated,
    service_role;
-- ============================================
-- 2. FACEBOOK CONVERSATIONS COLUMNS (AI)
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
-- 3. CORE FEATURES (Notifications, Communications, Calendar)
-- ============================================
-- notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    related_client_id UUID,
    related_entity_type VARCHAR(50),
    related_entity_id UUID,
    priority VARCHAR(20) DEFAULT 'normal',
    action_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- communications
CREATE TABLE IF NOT EXISTS communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    -- Assumes clients table exists
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE
    SET NULL,
        communication_type VARCHAR(50) NOT NULL,
        direction VARCHAR(20) DEFAULT 'outbound',
        subject VARCHAR(255),
        content TEXT,
        occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- calendar_events
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    event_type VARCHAR(50),
    client_id UUID,
    color VARCHAR(20),
    all_day BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- RLS & Indexes for Core Tables
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own notifications" ON notifications FOR
SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON notifications FOR
UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System can create notifications" ON notifications FOR
INSERT WITH CHECK (true);
-- Assuming 'authenticated' role exists
CREATE POLICY "Authenticated users can view communications" ON communications FOR
SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can create communications" ON communications FOR
INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can view their own calendar events" ON calendar_events FOR
SELECT USING (
        auth.uid() = user_id
        OR user_id IS NULL
    );
CREATE POLICY "Users can create calendar events" ON calendar_events FOR
INSERT WITH CHECK (
        auth.uid() = user_id
        OR user_id IS NULL
    );
CREATE POLICY "Users can update their own calendar events" ON calendar_events FOR
UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own calendar events" ON calendar_events FOR DELETE USING (auth.uid() = user_id);
-- ============================================
-- 4. FUNCTIONS & TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Drop triggers if they exist to avoid errors on re-run
DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at BEFORE
UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_communications_updated_at ON communications;
CREATE TRIGGER update_communications_updated_at BEFORE
UPDATE ON communications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER update_calendar_events_updated_at BEFORE
UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- ============================================
-- 5. FINAL CONFIRMATION
-- ============================================
SELECT 'SUCCESS: RALPH MASTER FIX APPLIED' as result;