-- FIX CRON ENDPOINTS: Ensure all columns and tables match what the code expects
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. CONTACT ENGAGEMENT TABLE
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
ALTER TABLE contact_engagement DISABLE ROW LEVEL SECURITY;
GRANT ALL ON contact_engagement TO anon, authenticated, service_role;

-- 2. AI FOLLOWUP SCHEDULE TABLE (code uses scheduled_at, follow_up_type, sent_at)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_followup_schedule (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    page_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add all columns the code actually uses (IF NOT EXISTS for safety)
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS follow_up_type TEXT DEFAULT 'intuition';
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS followup_type TEXT DEFAULT 'auto';
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS message_content TEXT;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS message_template TEXT;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS sent_message_id TEXT;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE ai_followup_schedule DISABLE ROW LEVEL SECURITY;
GRANT ALL ON ai_followup_schedule TO anon, authenticated, service_role;

-- 3. AI ACTION LOG TABLE (code uses action_data, page_id, explanation)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_action_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_action_log ADD COLUMN IF NOT EXISTS page_id TEXT;
ALTER TABLE ai_action_log ADD COLUMN IF NOT EXISTS action_data JSONB;
ALTER TABLE ai_action_log ADD COLUMN IF NOT EXISTS details JSONB;
ALTER TABLE ai_action_log ADD COLUMN IF NOT EXISTS explanation TEXT;

ALTER TABLE ai_action_log DISABLE ROW LEVEL SECURITY;
GRANT ALL ON ai_action_log TO anon, authenticated, service_role;

-- 4. FACEBOOK CONVERSATIONS: Add ALL columns the cron endpoints reference
-- ============================================
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS human_takeover BOOLEAN DEFAULT FALSE;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS lead_status TEXT;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS pipeline_stage TEXT;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS intuition_followup_disabled BOOLEAN DEFAULT FALSE;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS best_time_scheduling_disabled BOOLEAN DEFAULT FALSE;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS meeting_scheduled BOOLEAN DEFAULT FALSE;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS last_message_from_page BOOLEAN;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_notes TEXT;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS extracted_details JSONB;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS agent_context TEXT;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMPTZ;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS meeting_detected BOOLEAN DEFAULT FALSE;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS meeting_datetime TIMESTAMPTZ;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_label TEXT;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_label_set_at TIMESTAMPTZ;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_label_set_by TEXT;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS active_goal_id TEXT;

-- 5. INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_followups_scheduled ON ai_followup_schedule(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_followups_conversation ON ai_followup_schedule(conversation_id);
CREATE INDEX IF NOT EXISTS idx_engagement_conv ON contact_engagement(conversation_id);
CREATE INDEX IF NOT EXISTS idx_action_log_conv ON ai_action_log(conversation_id);

-- 6. MESSAGE A/B TESTING TABLES (used by process.js)
-- ============================================
CREATE TABLE IF NOT EXISTS message_sequences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    label TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    total_sent INTEGER DEFAULT 0,
    total_replies INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_prompts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sequence_id UUID REFERENCES message_sequences(id) ON DELETE CASCADE,
    sequence_position INTEGER DEFAULT 1,
    label TEXT,
    prompt_text TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    total_sent INTEGER DEFAULT 0,
    total_replies INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_ab_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    prompt_id UUID,
    sequence_id UUID,
    conversation_id TEXT NOT NULL,
    variant_label TEXT,
    message_sent TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    replied BOOLEAN DEFAULT FALSE,
    replied_at TIMESTAMPTZ,
    sequence_step INTEGER DEFAULT 1
);

ALTER TABLE message_sequences DISABLE ROW LEVEL SECURITY;
ALTER TABLE message_prompts DISABLE ROW LEVEL SECURITY;
ALTER TABLE message_ab_results DISABLE ROW LEVEL SECURITY;
GRANT ALL ON message_sequences TO anon, authenticated, service_role;
GRANT ALL ON message_prompts TO anon, authenticated, service_role;
GRANT ALL ON message_ab_results TO anon, authenticated, service_role;

SELECT 'SUCCESS: All cron-required tables and columns are ready' as result;
