-- Fix scheduled_messages for property click tracking
-- Run this in Supabase SQL Editor
-- Ensure the table has the right columns
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS message_text TEXT;
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS filter_type TEXT DEFAULT 'all';
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS recipient_ids TEXT [];
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS page_id TEXT;
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS success_count INTEGER DEFAULT 0;
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS fail_count INTEGER DEFAULT 0;
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS error_message TEXT;
-- Enable RLS
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
-- Allow anyone to insert scheduled messages (for property click tracking from public pages)
DROP POLICY IF EXISTS "Anyone can insert scheduled messages" ON scheduled_messages;
CREATE POLICY "Anyone can insert scheduled messages" ON scheduled_messages FOR
INSERT WITH CHECK (true);
-- Allow authenticated users to read and update
DROP POLICY IF EXISTS "Authenticated can manage scheduled messages" ON scheduled_messages;
CREATE POLICY "Authenticated can manage scheduled messages" ON scheduled_messages FOR ALL USING (auth.role() = 'authenticated');
-- Grant permissions
GRANT INSERT ON scheduled_messages TO anon;
GRANT INSERT ON scheduled_messages TO authenticated;
GRANT SELECT,
    UPDATE,
    DELETE ON scheduled_messages TO authenticated;
-- Done!