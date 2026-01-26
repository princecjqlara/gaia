-- Add sent_source column to facebook_messages
-- This tracks whether a message was sent via the Gaia app or Facebook Business Suite

-- Add the column
ALTER TABLE facebook_messages 
ADD COLUMN IF NOT EXISTS sent_source TEXT CHECK (sent_source IN ('app', 'business_suite'));

-- Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_fb_messages_sent_source ON facebook_messages(sent_source);

-- Comment explaining the column
COMMENT ON COLUMN facebook_messages.sent_source IS 'Source of sent message: app = sent via Gaia, business_suite = sent via Facebook Business Suite, NULL = customer message or unknown';

