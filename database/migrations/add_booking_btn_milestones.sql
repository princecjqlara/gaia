-- Add booking button milestone tracking
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS booking_btn_milestones JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN facebook_conversations.booking_btn_milestones IS 'Tracks booking button milestones sent (first/half/full).';
