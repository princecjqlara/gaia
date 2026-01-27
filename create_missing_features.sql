-- Fix missing tables for Tags and Bookings
-- 1. Create Tags Tables
CREATE TABLE IF NOT EXISTS conversation_tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS conversation_tag_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    -- References facebook_conversations(conversation_id)
    tag_id UUID REFERENCES conversation_tags(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES auth.users(id) ON DELETE
    SET NULL,
        UNIQUE(conversation_id, tag_id)
);
-- 2. Create Bookings Table (if not exists)
CREATE TABLE IF NOT EXISTS bookings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    page_id TEXT,
    contact_psid TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    booking_datetime TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 3. Enable RLS
ALTER TABLE conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
-- 4. Create RLS Policies
-- Tags
DROP POLICY IF EXISTS "Tags viewable by authenticated" ON conversation_tags;
CREATE POLICY "Tags viewable by authenticated" ON conversation_tags FOR
SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Tags manageable by authenticated" ON conversation_tags;
CREATE POLICY "Tags manageable by authenticated" ON conversation_tags FOR ALL USING (auth.role() = 'authenticated');
-- Tag Assignments
DROP POLICY IF EXISTS "Tag assignments viewable by authenticated" ON conversation_tag_assignments;
CREATE POLICY "Tag assignments viewable by authenticated" ON conversation_tag_assignments FOR
SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Tag assignments manageable by authenticated" ON conversation_tag_assignments;
CREATE POLICY "Tag assignments manageable by authenticated" ON conversation_tag_assignments FOR ALL USING (auth.role() = 'authenticated');
-- Bookings
DROP POLICY IF EXISTS "Bookings viewable by authenticated" ON bookings;
CREATE POLICY "Bookings viewable by authenticated" ON bookings FOR
SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Bookings manageable by authenticated" ON bookings;
CREATE POLICY "Bookings manageable by authenticated" ON bookings FOR ALL USING (auth.role() = 'authenticated');