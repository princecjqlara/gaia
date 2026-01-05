-- Facebook Messenger Integration Migration
-- Run this in Supabase SQL Editor

-- ============================================
-- FACEBOOK PAGES TABLE
-- Stores connected Facebook pages with access tokens
-- ============================================
CREATE TABLE IF NOT EXISTS facebook_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id TEXT UNIQUE NOT NULL,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  page_picture_url TEXT,
  connected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FACEBOOK CONVERSATIONS TABLE
-- Stores synced conversations from Facebook
-- ============================================
CREATE TABLE IF NOT EXISTS facebook_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id TEXT NOT NULL REFERENCES facebook_pages(page_id) ON DELETE CASCADE,
  conversation_id TEXT UNIQUE NOT NULL,
  participant_id TEXT NOT NULL,
  participant_name TEXT,
  participant_email TEXT,
  participant_picture_url TEXT,
  last_message_text TEXT,
  last_message_time TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  linked_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FACEBOOK MESSAGES TABLE
-- Stores individual messages from conversations
-- ============================================
CREATE TABLE IF NOT EXISTS facebook_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id TEXT NOT NULL REFERENCES facebook_conversations(conversation_id) ON DELETE CASCADE,
  message_id TEXT UNIQUE NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  is_from_page BOOLEAN DEFAULT false,
  message_text TEXT,
  attachments JSONB DEFAULT '[]',
  timestamp TIMESTAMPTZ NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FACEBOOK SETTINGS TABLE
-- Global settings for Facebook integration
-- ============================================
CREATE TABLE IF NOT EXISTS facebook_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO facebook_settings (setting_key, setting_value) VALUES
  ('app_config', '{"app_id": "", "app_secret": "", "verify_token": ""}'),
  ('auto_ad_spend_sync', '{"enabled": false, "sync_interval_hours": 24, "last_sync_at": null}'),
  ('webhook_config', '{"enabled": false, "url": ""}')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE facebook_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_settings ENABLE ROW LEVEL SECURITY;

-- Facebook Pages: All authenticated users can view, only admins can manage
CREATE POLICY "Facebook pages viewable by authenticated users" ON facebook_pages
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage facebook pages" ON facebook_pages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Facebook Conversations: All authenticated users can view and update
CREATE POLICY "Conversations viewable by authenticated users" ON facebook_conversations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update conversations" ON facebook_conversations
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage conversations" ON facebook_conversations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Facebook Messages: All authenticated users can view and insert
CREATE POLICY "Messages viewable by authenticated users" ON facebook_messages
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert messages" ON facebook_messages
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update messages" ON facebook_messages
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Facebook Settings: All authenticated can view, only admins can modify
CREATE POLICY "Settings viewable by authenticated users" ON facebook_settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage settings" ON facebook_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_fb_conversations_page_id ON facebook_conversations(page_id);
CREATE INDEX IF NOT EXISTS idx_fb_conversations_participant_id ON facebook_conversations(participant_id);
CREATE INDEX IF NOT EXISTS idx_fb_conversations_last_message_time ON facebook_conversations(last_message_time DESC);
CREATE INDEX IF NOT EXISTS idx_fb_conversations_assigned_to ON facebook_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_fb_messages_conversation_id ON facebook_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_fb_messages_timestamp ON facebook_messages(timestamp DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at for facebook_pages
CREATE TRIGGER facebook_pages_updated_at
  BEFORE UPDATE ON facebook_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update updated_at for facebook_conversations  
CREATE TRIGGER facebook_conversations_updated_at
  BEFORE UPDATE ON facebook_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update updated_at for facebook_settings
CREATE TRIGGER facebook_settings_updated_at
  BEFORE UPDATE ON facebook_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================
-- Enable realtime for messages (for live chat updates)
ALTER PUBLICATION supabase_realtime ADD TABLE facebook_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE facebook_conversations;
