-- Add agent_context column for external context that agents can provide to the AI
-- This context is included in the AI prompt when generating responses/follow-ups

ALTER TABLE facebook_conversations 
ADD COLUMN IF NOT EXISTS agent_context TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN facebook_conversations.agent_context IS 'External context provided by agents (phone calls, emails, etc.) that AI should consider when responding';
