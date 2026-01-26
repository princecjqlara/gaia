-- Facebook Messenger Integration Schema
-- 1. Facebook Pages Table
CREATE TABLE IF NOT EXISTS facebook_pages (
    page_id TEXT PRIMARY KEY,
    page_name TEXT NOT NULL,
    page_access_token TEXT,
    page_picture_url TEXT,
    is_active BOOLEAN DEFAULT true,
    connected_by UUID REFERENCES auth.users(id),
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 2. CRM Clients Table (Ensure it exists)
CREATE TABLE IF NOT EXISTS clients (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_name TEXT NOT NULL,
    business_name TEXT,
    email TEXT,
    phone TEXT,
    status TEXT DEFAULT 'New Lead',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 3. Facebook Conversations Table
CREATE TABLE IF NOT EXISTS facebook_conversations (
    conversation_id TEXT PRIMARY KEY,
    page_id TEXT REFERENCES facebook_pages(page_id) ON DELETE CASCADE,
    participant_id TEXT,
    participant_name TEXT,
    last_message_text TEXT,
    unread_count INTEGER DEFAULT 0,
    last_message_time TIMESTAMPTZ,
    last_message_from_page BOOLEAN DEFAULT false,
    -- CRM Meta
    lead_status TEXT DEFAULT 'new',
    -- new, qualified, etc.
    linked_client_id UUID REFERENCES clients(id) ON DELETE
    SET NULL,
        assigned_to UUID REFERENCES auth.users(id) ON DELETE
    SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 4. Facebook Messages Table
CREATE TABLE IF NOT EXISTS facebook_messages (
    message_id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES facebook_conversations(conversation_id) ON DELETE CASCADE,
    sender_id TEXT,
    sender_name TEXT,
    message_text TEXT,
    is_from_page BOOLEAN DEFAULT false,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    is_read BOOLEAN DEFAULT false,
    attachments JSONB DEFAULT '[]'::JSONB,
    sent_source TEXT,
    -- 'app', 'facebook'
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 5. Facebook Settings Table
CREATE TABLE IF NOT EXISTS facebook_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value JSONB,
    updated_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_fb_conv_page_id ON facebook_conversations(page_id);
CREATE INDEX IF NOT EXISTS idx_fb_conv_updated ON facebook_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_msg_conv_id ON facebook_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_fb_msg_timestamp ON facebook_messages(timestamp ASC);
-- 7. RLS Policies
ALTER TABLE facebook_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_messages ENABLE ROW LEVEL SECURITY;
-- Allow authenticated users (agents) to view/manage
CREATE POLICY "Agents can access facebook pages" ON facebook_pages FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Agents can access conversations" ON facebook_conversations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Agents can access messages" ON facebook_messages FOR ALL USING (auth.role() = 'authenticated');