-- Fix missing columns in facebook_conversations table
-- 1. Add is_archived column if missing
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'is_archived'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN is_archived BOOLEAN DEFAULT false;
END IF;
-- Also adding other columns that might be missing based on the app logic
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'ai_enabled'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN ai_enabled BOOLEAN DEFAULT true;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'human_takeover'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN human_takeover BOOLEAN DEFAULT false;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'lead_status'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN lead_status TEXT DEFAULT 'new_lead';
END IF;
-- Add assigned_to linked column (if missing)
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'assigned_to'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN assigned_to UUID REFERENCES auth.users(id) ON DELETE
SET NULL;
END IF;
-- Add linked_client_id (if missing)
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'linked_client_id'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN linked_client_id UUID;
END IF;
END $$;