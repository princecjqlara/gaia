-- Clear facebook_pages table to force a clean re-connection
-- This is useful if the initial connection failed or saved incomplete data due to RLS errors
DELETE FROM facebook_pages;
-- Also clear downstreams to be safe
DELETE FROM facebook_conversations;
DELETE FROM facebook_messages;