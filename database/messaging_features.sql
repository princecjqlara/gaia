-- Scheduled Messages Table
CREATE TABLE IF NOT EXISTS scheduled_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id TEXT NOT NULL,
    message_text TEXT,
    media_url TEXT,
    filter_type TEXT DEFAULT 'all',
    filter_value TEXT,
    selected_recipients JSONB,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, sending, completed, cancelled
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

-- Saved Replies Table
CREATE TABLE IF NOT EXISTS saved_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    shortcut TEXT,
    category TEXT DEFAULT 'general',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    usage_count INTEGER DEFAULT 0
);

-- Conversation Tags Table (if not exists)
CREATE TABLE IF NOT EXISTS conversation_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#a855f7',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tag Assignments Table (if not exists)
CREATE TABLE IF NOT EXISTS conversation_tag_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL,
    tag_id UUID NOT NULL REFERENCES conversation_tags(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, tag_id)
);

-- Bulk Messages History Table (if not exists)
CREATE TABLE IF NOT EXISTS bulk_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id TEXT NOT NULL,
    message_text TEXT,
    media_url TEXT,
    filter_type TEXT DEFAULT 'all',
    filter_value TEXT,
    recipients_count INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    sent_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Add new columns to facebook_conversations for tracking
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS has_booking BOOLEAN DEFAULT false;
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS last_reply_from TEXT; -- 'page' or 'customer'
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS proposal_status TEXT; -- 'none', 'sent', 'waiting', 'accepted', 'declined'
ALTER TABLE facebook_conversations ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- Enable RLS
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop first to avoid conflicts, then create)
DROP POLICY IF EXISTS "Scheduled messages accessible by all" ON scheduled_messages;
DROP POLICY IF EXISTS "Saved replies accessible by all" ON saved_replies;
DROP POLICY IF EXISTS "Tags accessible by all" ON conversation_tags;
DROP POLICY IF EXISTS "Tag assignments accessible by all" ON conversation_tag_assignments;
DROP POLICY IF EXISTS "Bulk messages accessible by all" ON bulk_messages;

CREATE POLICY "Scheduled messages accessible by all" ON scheduled_messages FOR ALL USING (true);
CREATE POLICY "Saved replies accessible by all" ON saved_replies FOR ALL USING (true);
CREATE POLICY "Tags accessible by all" ON conversation_tags FOR ALL USING (true);
CREATE POLICY "Tag assignments accessible by all" ON conversation_tag_assignments FOR ALL USING (true);
CREATE POLICY "Bulk messages accessible by all" ON bulk_messages FOR ALL USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON scheduled_messages(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_saved_replies_page ON saved_replies(page_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_page ON conversation_tags(page_id);
CREATE INDEX IF NOT EXISTS idx_tag_assignments_conv ON conversation_tag_assignments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_bulk_messages_page ON bulk_messages(page_id);
