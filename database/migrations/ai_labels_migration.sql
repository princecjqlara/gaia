-- AI Labels Migration
-- Run this in Supabase SQL Editor

-- Add label columns to facebook_conversations
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_label TEXT DEFAULT NULL;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_label_set_at TIMESTAMPTZ;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_label_set_by TEXT DEFAULT 'system';

-- Label history table
CREATE TABLE IF NOT EXISTS ai_label_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL REFERENCES facebook_conversations(conversation_id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    previous_label TEXT,
    set_by TEXT DEFAULT 'system',
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE ai_label_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_label_history" ON ai_label_history FOR ALL USING (auth.role() = 'authenticated');

-- Index
CREATE INDEX IF NOT EXISTS idx_label_history_conversation ON ai_label_history(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_ai_label ON facebook_conversations(ai_label);
