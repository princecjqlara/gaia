-- Fix missing columns in facebook_conversations table
DO $$ BEGIN -- 1. Infrastructure columns (archived, status, assignment)
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'is_archived'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN is_archived BOOLEAN DEFAULT false;
END IF;
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
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'linked_client_id'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN linked_client_id UUID;
END IF;
-- 2. AI & Meeting Columns (Fixing 400 Bad Request error)
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'ai_analysis'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN ai_analysis TEXT;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'ai_notes'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN ai_notes TEXT;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'extracted_details'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN extracted_details JSONB DEFAULT '{}'::jsonb;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'meeting_detected'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN meeting_detected BOOLEAN DEFAULT false;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'meeting_datetime'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN meeting_datetime TIMESTAMPTZ;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'facebook_conversations'
        AND column_name = 'auto_booked_meeting_id'
) THEN
ALTER TABLE facebook_conversations
ADD COLUMN auto_booked_meeting_id UUID;
END IF;
END $$;