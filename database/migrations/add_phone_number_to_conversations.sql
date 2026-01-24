-- Add phone_number to facebook_conversations for extracted contact data
ALTER TABLE facebook_conversations
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

CREATE INDEX IF NOT EXISTS idx_fb_conversations_phone_number
  ON facebook_conversations(phone_number);
