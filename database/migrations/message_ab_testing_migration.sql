-- ============================================
-- MESSAGE A/B TESTING MIGRATION (v2 — Sequences)
-- Run this in Supabase SQL Editor
-- Adds tables for:
--   ✅ Message Sequences (ordered chains of prompts)
--   ✅ Message Prompts (user-defined follow-up variants, linked to sequences)
--   ✅ A/B Test Results (per-send performance tracking)
--   ✅ Prompt Performance view
--   ✅ Sequence Performance view
-- ============================================

-- ============================================
-- 1. MESSAGE SEQUENCES TABLE
-- Groups of ordered prompts for multi-step follow-ups
-- ============================================
CREATE TABLE IF NOT EXISTS message_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label TEXT NOT NULL DEFAULT 'New Sequence',
    is_active BOOLEAN DEFAULT true,
    total_sent INTEGER DEFAULT 0,
    total_replies INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. MESSAGE PROMPTS TABLE
-- User-defined follow-up prompt variants, optionally linked to sequences
-- ============================================
CREATE TABLE IF NOT EXISTS message_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prompt_text TEXT NOT NULL,
    label TEXT DEFAULT NULL,
    is_active BOOLEAN DEFAULT true,
    sequence_id UUID REFERENCES message_sequences(id) ON DELETE CASCADE,
    sequence_position INTEGER DEFAULT 1,
    total_sent INTEGER DEFAULT 0,
    total_replies INTEGER DEFAULT 0,
    avg_score DECIMAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- If message_prompts already exists (from v1 migration), add new columns
ALTER TABLE message_prompts ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES message_sequences(id) ON DELETE CASCADE;
ALTER TABLE message_prompts ADD COLUMN IF NOT EXISTS sequence_position INTEGER DEFAULT 1;

-- ============================================
-- 3. MESSAGE A/B RESULTS TABLE
-- Performance tracking per prompt × contact
-- ============================================
CREATE TABLE IF NOT EXISTS message_ab_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prompt_id UUID REFERENCES message_prompts(id) ON DELETE SET NULL,
    sequence_id UUID REFERENCES message_sequences(id) ON DELETE SET NULL,
    conversation_id TEXT NOT NULL,
    variant_label TEXT DEFAULT 'default',
    message_sent TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    got_reply BOOLEAN DEFAULT false,
    replied_at TIMESTAMPTZ,
    reply_latency_minutes INTEGER,
    conversion_score DECIMAL DEFAULT 0,
    sequence_step INTEGER DEFAULT 1,
    scoring_details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- If message_ab_results already exists (from v1), add sequence_id column
ALTER TABLE message_ab_results ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES message_sequences(id) ON DELETE SET NULL;
-- Rename reply_latency_seconds → reply_latency_minutes if it exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='message_ab_results' AND column_name='reply_latency_seconds') THEN
    ALTER TABLE message_ab_results RENAME COLUMN reply_latency_seconds TO reply_latency_minutes;
  END IF;
END $$;

-- ============================================
-- 4. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE message_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_ab_results ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_message_sequences' AND tablename = 'message_sequences') THEN
    CREATE POLICY "auth_all_message_sequences" ON message_sequences FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_message_prompts' AND tablename = 'message_prompts') THEN
    CREATE POLICY "auth_all_message_prompts" ON message_prompts FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_message_ab_results' AND tablename = 'message_ab_results') THEN
    CREATE POLICY "auth_all_message_ab_results" ON message_ab_results FOR ALL USING (true);
  END IF;
END $$;

-- ============================================
-- 5. INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_ab_results_prompt ON message_ab_results(prompt_id);
CREATE INDEX IF NOT EXISTS idx_ab_results_sequence ON message_ab_results(sequence_id);
CREATE INDEX IF NOT EXISTS idx_ab_results_conversation ON message_ab_results(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ab_results_sent_at ON message_ab_results(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_prompts_active ON message_prompts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_message_prompts_sequence ON message_prompts(sequence_id, sequence_position);
CREATE INDEX IF NOT EXISTS idx_message_sequences_active ON message_sequences(is_active) WHERE is_active = true;

-- ============================================
-- 6. PROMPT PERFORMANCE VIEW
-- ============================================
DROP VIEW IF EXISTS prompt_performance;
DROP VIEW IF EXISTS sequence_performance;

CREATE OR REPLACE VIEW prompt_performance AS
SELECT
    mp.id AS prompt_id,
    mp.prompt_text,
    mp.label,
    mp.is_active,
    mp.sequence_id,
    mp.sequence_position,
    COUNT(mar.id) AS total_sent,
    COUNT(CASE WHEN mar.got_reply = true THEN 1 END) AS total_replies,
    CASE 
        WHEN COUNT(mar.id) > 0 
        THEN ROUND(COUNT(CASE WHEN mar.got_reply = true THEN 1 END)::DECIMAL / COUNT(mar.id) * 100, 1)
        ELSE 0 
    END AS reply_rate,
    COALESCE(AVG(CASE WHEN mar.got_reply = true THEN mar.reply_latency_minutes END), 0)::INTEGER AS avg_reply_latency,
    COALESCE(AVG(mar.conversion_score), 0)::DECIMAL AS avg_conversion_score,
    CASE 
        WHEN COUNT(mar.id) >= 50 THEN 'high'
        WHEN COUNT(mar.id) >= 20 THEN 'medium'
        WHEN COUNT(mar.id) >= 5 THEN 'low'
        ELSE 'insufficient'
    END AS confidence,
    mp.created_at
FROM message_prompts mp
LEFT JOIN message_ab_results mar ON mar.prompt_id = mp.id
GROUP BY mp.id, mp.prompt_text, mp.label, mp.is_active, mp.sequence_id, mp.sequence_position, mp.created_at;

-- ============================================
-- 7. SEQUENCE PERFORMANCE VIEW
-- ============================================
CREATE OR REPLACE VIEW sequence_performance AS
SELECT
    ms.id AS sequence_id,
    ms.label,
    ms.is_active,
    COUNT(DISTINCT mp.id) AS step_count,
    COUNT(mar.id) AS total_sent,
    COUNT(CASE WHEN mar.got_reply = true THEN 1 END) AS total_replies,
    CASE 
        WHEN COUNT(mar.id) > 0 
        THEN ROUND(COUNT(CASE WHEN mar.got_reply = true THEN 1 END)::DECIMAL / COUNT(mar.id) * 100, 1)
        ELSE 0 
    END AS reply_rate,
    COALESCE(AVG(mar.conversion_score), 0)::DECIMAL AS avg_conversion_score,
    CASE 
        WHEN COUNT(mar.id) >= 50 THEN 'high'
        WHEN COUNT(mar.id) >= 20 THEN 'medium'
        WHEN COUNT(mar.id) >= 5 THEN 'low'
        ELSE 'insufficient'
    END AS confidence,
    ms.created_at
FROM message_sequences ms
LEFT JOIN message_prompts mp ON mp.sequence_id = ms.id
LEFT JOIN message_ab_results mar ON mar.sequence_id = ms.id
GROUP BY ms.id, ms.label, ms.is_active, ms.created_at;
