-- ============================================
-- COMPLETE AI FEATURES MIGRATION
-- Run this ONCE in Supabase SQL Editor
-- Adds all missing tables and columns for:
--   ✅ AI Labels
--   ✅ AI Follow-up Scheduling
--   ✅ Best Time to Contact
--   ✅ Contact Engagement Analytics
--   ✅ Goal system
-- ============================================

-- ============================================
-- 1. CONVERSATION COLUMNS (on facebook_conversations)
-- ============================================
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT true;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS human_takeover BOOLEAN DEFAULT false;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS takeover_until TIMESTAMPTZ;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS active_goal_id TEXT DEFAULT NULL;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS goal_completed BOOLEAN DEFAULT false;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL DEFAULT 1.0;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS last_ai_message_at TIMESTAMPTZ;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS last_ai_response_at TIMESTAMPTZ;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS opt_out BOOLEAN DEFAULT false;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS opt_out_at TIMESTAMPTZ;

-- AI Label columns
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_label TEXT DEFAULT NULL;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_label_set_at TIMESTAMPTZ;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_label_set_by TEXT DEFAULT 'system';

-- AI analysis columns
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_analysis TEXT;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_notes TEXT;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS extracted_details JSONB DEFAULT '{}';
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS meeting_detected BOOLEAN DEFAULT false;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS meeting_datetime TIMESTAMPTZ;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMPTZ;

-- Lead status columns
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'intake';
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS lead_score INTEGER;

-- ============================================
-- 2. AI FOLLOW-UP SCHEDULE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_followup_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Add all columns (safe if they already exist)
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS page_id TEXT;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS follow_up_type TEXT DEFAULT 'intuition';
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS message_template TEXT;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS sent_message_id TEXT;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE ai_followup_schedule ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- 3. CONTACT ENGAGEMENT TABLE (Best Time to Contact)
-- ============================================
CREATE TABLE IF NOT EXISTS contact_engagement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE contact_engagement ADD COLUMN IF NOT EXISTS participant_id TEXT;
ALTER TABLE contact_engagement ADD COLUMN IF NOT EXISTS page_id TEXT;
ALTER TABLE contact_engagement ADD COLUMN IF NOT EXISTS message_timestamp TIMESTAMPTZ;
ALTER TABLE contact_engagement ADD COLUMN IF NOT EXISTS message_direction TEXT DEFAULT 'inbound';
ALTER TABLE contact_engagement ADD COLUMN IF NOT EXISTS response_latency_seconds INTEGER;
ALTER TABLE contact_engagement ADD COLUMN IF NOT EXISTS day_of_week INTEGER;
ALTER TABLE contact_engagement ADD COLUMN IF NOT EXISTS hour_of_day INTEGER;
ALTER TABLE contact_engagement ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';
ALTER TABLE contact_engagement ADD COLUMN IF NOT EXISTS engagement_score DECIMAL;

-- ============================================
-- 4. AI LABEL HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_label_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_label_history ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE ai_label_history ADD COLUMN IF NOT EXISTS previous_label TEXT;
ALTER TABLE ai_label_history ADD COLUMN IF NOT EXISTS set_by TEXT DEFAULT 'system';
ALTER TABLE ai_label_history ADD COLUMN IF NOT EXISTS reason TEXT;

-- ============================================
-- 5. AI ACTION LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_action_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_action_log ADD COLUMN IF NOT EXISTS conversation_id TEXT;
ALTER TABLE ai_action_log ADD COLUMN IF NOT EXISTS page_id TEXT;
ALTER TABLE ai_action_log ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE ai_action_log ADD COLUMN IF NOT EXISTS action_data JSONB DEFAULT '{}';
ALTER TABLE ai_action_log ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE ai_action_log ADD COLUMN IF NOT EXISTS confidence_score DECIMAL;

-- ============================================
-- 6. AI TAKEOVER LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_takeover_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_takeover_log ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE ai_takeover_log ADD COLUMN IF NOT EXISTS reason_detail TEXT;
ALTER TABLE ai_takeover_log ADD COLUMN IF NOT EXISTS triggered_by TEXT DEFAULT 'system';
ALTER TABLE ai_takeover_log ADD COLUMN IF NOT EXISTS triggered_by_user_id UUID;
ALTER TABLE ai_takeover_log ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL;
ALTER TABLE ai_takeover_log ADD COLUMN IF NOT EXISTS message_context TEXT;
ALTER TABLE ai_takeover_log ADD COLUMN IF NOT EXISTS takeover_duration_hours INTEGER DEFAULT 24;
ALTER TABLE ai_takeover_log ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE ai_takeover_log ADD COLUMN IF NOT EXISTS resolved_by UUID;

-- ============================================
-- 7. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE ai_followup_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_label_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_takeover_log ENABLE ROW LEVEL SECURITY;

-- Permissive policies for authenticated users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_followups' AND tablename = 'ai_followup_schedule') THEN
    CREATE POLICY "auth_all_followups" ON ai_followup_schedule FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_engagement' AND tablename = 'contact_engagement') THEN
    CREATE POLICY "auth_all_engagement" ON contact_engagement FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_label_history' AND tablename = 'ai_label_history') THEN
    CREATE POLICY "auth_all_label_history" ON ai_label_history FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_action_log' AND tablename = 'ai_action_log') THEN
    CREATE POLICY "auth_all_action_log" ON ai_action_log FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_takeover_log' AND tablename = 'ai_takeover_log') THEN
    CREATE POLICY "auth_all_takeover_log" ON ai_takeover_log FOR ALL USING (true);
  END IF;
END $$;

-- ============================================
-- 8. INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_followups_scheduled ON ai_followup_schedule(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_followups_conversation ON ai_followup_schedule(conversation_id);
CREATE INDEX IF NOT EXISTS idx_engagement_participant ON contact_engagement(participant_id);
CREATE INDEX IF NOT EXISTS idx_engagement_time ON contact_engagement(day_of_week, hour_of_day);
CREATE INDEX IF NOT EXISTS idx_label_history_conversation ON ai_label_history(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_ai_label ON facebook_conversations(ai_label);
CREATE INDEX IF NOT EXISTS idx_action_log_conversation ON ai_action_log(conversation_id);
CREATE INDEX IF NOT EXISTS idx_action_log_created ON ai_action_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_takeover_conversation ON ai_takeover_log(conversation_id);
