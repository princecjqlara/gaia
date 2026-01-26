-- FIX RLS POLICIES FOR ALL FACEBOOK TABLES (IDEMPOTENT VERSION)
-- Run this in your Supabase SQL Editor to allow authenticated users to connect pages and sync messages
-- 1. Facebook Pages
DROP POLICY IF EXISTS "Admins can manage facebook pages" ON facebook_pages;
DROP POLICY IF EXISTS "Facebook pages viewable by authenticated users" ON facebook_pages;
DROP POLICY IF EXISTS "Agents can access facebook pages" ON facebook_pages;
-- Drop the new policy if it was already created by a previous run
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON facebook_pages;
CREATE POLICY "Enable all access for authenticated users" ON facebook_pages FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- 2. Facebook Conversations
DROP POLICY IF EXISTS "Admins can manage conversations" ON facebook_conversations;
DROP POLICY IF EXISTS "Conversations viewable by authenticated users" ON facebook_conversations;
DROP POLICY IF EXISTS "Authenticated users can update conversations" ON facebook_conversations;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON facebook_conversations;
CREATE POLICY "Enable all access for authenticated users" ON facebook_conversations FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- 3. Facebook Messages
DROP POLICY IF EXISTS "Messages viewable by authenticated users" ON facebook_messages;
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON facebook_messages;
DROP POLICY IF EXISTS "Authenticated users can update messages" ON facebook_messages;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON facebook_messages;
CREATE POLICY "Enable all access for authenticated users" ON facebook_messages FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- 4. Facebook Settings
DROP POLICY IF EXISTS "Admins can manage settings" ON facebook_settings;
DROP POLICY IF EXISTS "Settings viewable by authenticated users" ON facebook_settings;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON facebook_settings;
CREATE POLICY "Enable all access for authenticated users" ON facebook_settings FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');