-- Add evaluation_score column to facebook_conversations
-- This column stores the AI-computed evaluation percentage (0-100) for each conversation
-- The webhook already saves this value; this migration ensures the column exists

ALTER TABLE facebook_conversations
ADD COLUMN IF NOT EXISTS evaluation_score integer DEFAULT NULL;

-- Add an index for quick lookups of evaluated conversations
CREATE INDEX IF NOT EXISTS idx_fb_conversations_evaluation_score
ON facebook_conversations(evaluation_score)
WHERE evaluation_score IS NOT NULL;

COMMENT ON COLUMN facebook_conversations.evaluation_score IS 'AI evaluation percentage (0-100) computed from conversation signals like budget, property type, location, sentiment';
