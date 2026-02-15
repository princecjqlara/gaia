-- Recurring Notification Tokens
-- Run this in Supabase SQL Editor

-- 1. Create table for storing Facebook recurring notification tokens
CREATE TABLE IF NOT EXISTS recurring_notification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text REFERENCES facebook_conversations(conversation_id) ON DELETE CASCADE,
  participant_id text NOT NULL,
  page_id text NOT NULL,
  token text NOT NULL,
  token_status text DEFAULT 'active' CHECK (token_status IN ('active', 'used', 'expired', 'revoked')),
  frequency text DEFAULT 'DAILY',
  opted_in_at timestamptz DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '6 months'),
  followup_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups by conversation and status
CREATE INDEX IF NOT EXISTS idx_rnt_conversation ON recurring_notification_tokens(conversation_id);
CREATE INDEX IF NOT EXISTS idx_rnt_status ON recurring_notification_tokens(token_status) WHERE token_status = 'active';
CREATE INDEX IF NOT EXISTS idx_rnt_followup ON recurring_notification_tokens(followup_sent, token_status) WHERE followup_sent = false AND token_status = 'active';

-- 2. Add opt-in tracking column to conversations
ALTER TABLE facebook_conversations 
  ADD COLUMN IF NOT EXISTS recurring_optin_status text DEFAULT null;
-- Values: null = not asked, 'sent' = opt-in sent, 'opted_in' = confirmed, 'declined' = declined

-- Enable RLS
ALTER TABLE recurring_notification_tokens ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY IF NOT EXISTS "Service role full access" ON recurring_notification_tokens
  FOR ALL USING (true) WITH CHECK (true);

SELECT 'Recurring notification tokens table created successfully!' as result;
