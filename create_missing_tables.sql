-- Create missing tables and fix RLS policies
-- 1. Create notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    message TEXT,
    type TEXT,
    read BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Enable RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- Create RLS policies for notifications
CREATE POLICY "Users can manage their own notifications" ON notifications FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- 2. Create scheduled_messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS scheduled_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id TEXT,
    page_id TEXT,
    message_text TEXT,
    status TEXT DEFAULT 'pending',
    -- pending, sent, failed, cancelled
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Enable RLS for scheduled_messages
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
-- Create RLS policies for scheduled_messages
CREATE POLICY "Users can manage their own scheduled messages" ON scheduled_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- 3. Fix for facebook_conversations query (ensure columns exist)
-- The error mentions missing columns like 'pipeline_stage', 'extracted_details', 'phone_number'
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'new';
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS extracted_details JSONB DEFAULT '{}';
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS contact_info JSONB DEFAULT '{}';
-- 4. Ensure RLS allows access to these new columns (re-apply if needed)
-- (Already covered by previous script, but good to be safe)