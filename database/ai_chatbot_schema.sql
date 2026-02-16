-- AI Chatbot Enterprise System - Database Schema
-- Run this in Supabase SQL Editor
-- Requires: uuid-ossp extension (already enabled)

-- ============================================
-- CONVERSATION GOALS TABLE
-- Define objectives per contact/conversation
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL REFERENCES facebook_conversations(conversation_id) ON DELETE CASCADE,
    goal_type TEXT NOT NULL CHECK (goal_type IN ('book_call', 'close_sale', 're_engage', 'qualify_lead', 'provide_info', 'custom')),
    goal_prompt TEXT, -- Custom prompt that shapes AI behavior
    goal_context JSONB DEFAULT '{}', -- Additional context (target date, product, etc.)
    priority INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'paused')),
    progress_score DECIMAL DEFAULT 0, -- 0-100 progress toward goal
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================
-- AI FOLLOW-UP SCHEDULE TABLE
-- Track scheduled follow-ups with best-time-to-contact model
-- ============================================
CREATE TABLE IF NOT EXISTS ai_followup_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL REFERENCES facebook_conversations(conversation_id) ON DELETE CASCADE,
    page_id TEXT REFERENCES facebook_pages(page_id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    follow_up_type TEXT NOT NULL CHECK (follow_up_type IN ('best_time', 'intuition', 'manual', 'flow', 'reminder', 'read_receipt')),
    reason TEXT, -- Why this follow-up was scheduled
    message_template TEXT, -- Pre-generated message or template
    goal_id UUID REFERENCES conversation_goals(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'skipped', 'failed')),
    cooldown_until TIMESTAMPTZ, -- Cannot send before this time
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    sent_at TIMESTAMPTZ,
    sent_message_id TEXT, -- Facebook message ID when sent
    error_message TEXT, -- If failed, why
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI FLOWS TABLE
-- Admin-defined chatbot decision trees
-- ============================================
CREATE TABLE IF NOT EXISTS ai_flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('new_conversation', 'keyword', 'goal', 'manual', 'tag', 'silence')),
    trigger_config JSONB DEFAULT '{}', -- Trigger-specific config (keywords, tag_id, etc.)
    flow_definition JSONB NOT NULL, -- Decision tree structure
    allow_improvisation BOOLEAN DEFAULT true, -- Can AI deviate within bounds
    improvisation_boundary TEXT, -- Prompt defining improvisation limits
    escalation_rules JSONB DEFAULT '[]', -- Array of escalation conditions
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 1, -- Higher priority flows take precedence
    page_id TEXT REFERENCES facebook_pages(page_id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI TAKEOVER LOG TABLE
-- Track AI halts and human takeovers
-- ============================================
CREATE TABLE IF NOT EXISTS ai_takeover_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL REFERENCES facebook_conversations(conversation_id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (reason IN ('human_flag', 'opt_out', 'low_confidence', 'explicit_request', 'escalation', 'admin_override', 'cooldown_violation')),
    reason_detail TEXT, -- Additional context
    triggered_by TEXT NOT NULL CHECK (triggered_by IN ('system', 'user', 'admin', 'contact')),
    triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ai_confidence DECIMAL, -- Confidence at time of takeover
    message_context TEXT, -- Last few messages for context
    takeover_duration_hours INTEGER DEFAULT 24, -- How long human is in control
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI ACTION LOG TABLE
-- Full audit trail for all AI actions
-- ============================================
CREATE TABLE IF NOT EXISTS ai_action_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT REFERENCES facebook_conversations(conversation_id) ON DELETE SET NULL,
    page_id TEXT REFERENCES facebook_pages(page_id) ON DELETE SET NULL,
    action_type TEXT NOT NULL CHECK (action_type IN (
        'message_generated', 'message_sent', 'message_split',
        'followup_scheduled', 'followup_sent', 'followup_cancelled',
        'goal_set', 'goal_completed', 'goal_abandoned',
        'takeover_activated', 'takeover_deactivated',
        'flow_started', 'flow_completed', 'flow_escalated',
        'confidence_low', 'opt_out_detected', 'intent_detected'
    )),
    action_data JSONB DEFAULT '{}', -- Action-specific data
    explanation TEXT, -- Human-readable explanation of why AI took this action
    confidence_score DECIMAL, -- AI confidence for this action
    goal_id UUID REFERENCES conversation_goals(id) ON DELETE SET NULL,
    flow_id UUID REFERENCES ai_flows(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONTACT ENGAGEMENT ANALYTICS TABLE
-- Data for "Best Time to Contact" model
-- ============================================
CREATE TABLE IF NOT EXISTS contact_engagement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL REFERENCES facebook_conversations(conversation_id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL,
    page_id TEXT REFERENCES facebook_pages(page_id) ON DELETE CASCADE,
    message_timestamp TIMESTAMPTZ NOT NULL,
    message_direction TEXT NOT NULL CHECK (message_direction IN ('inbound', 'outbound')),
    response_latency_seconds INTEGER, -- Time to respond (null for outbound)
    day_of_week INTEGER, -- 0-6 (Sunday-Saturday)
    hour_of_day INTEGER, -- 0-23
    timezone TEXT DEFAULT 'UTC',
    engagement_score DECIMAL, -- Calculated engagement level for this interaction
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GOAL TEMPLATES TABLE
-- Reusable goal templates for quick setup
-- ============================================
CREATE TABLE IF NOT EXISTS goal_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    goal_type TEXT NOT NULL,
    default_prompt TEXT NOT NULL,
    success_criteria JSONB DEFAULT '{}', -- Conditions for goal completion
    recommended_flow_id UUID REFERENCES ai_flows(id) ON DELETE SET NULL,
    is_system BOOLEAN DEFAULT false, -- System-provided vs user-created
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- OPT-OUT PHRASES TABLE
-- Configurable phrases that trigger opt-out
-- ============================================
CREATE TABLE IF NOT EXISTS opt_out_phrases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phrase TEXT NOT NULL,
    is_regex BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default opt-out phrases
INSERT INTO opt_out_phrases (phrase, is_regex) VALUES
    ('stop messaging', false),
    ('stop texting', false),
    ('unsubscribe', false),
    ('stop sending', false),
    ('leave me alone', false),
    ('do not contact', false),
    ('remove me', false),
    ('opt out', false),
    ('stop$', true),
    ('STOP', false)
ON CONFLICT DO NOTHING;

-- ============================================
-- ADD AI COLUMNS TO FACEBOOK_CONVERSATIONS
-- ============================================
ALTER TABLE facebook_conversations 
    ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT true;
ALTER TABLE facebook_conversations 
    ADD COLUMN IF NOT EXISTS human_takeover BOOLEAN DEFAULT false;
ALTER TABLE facebook_conversations 
    ADD COLUMN IF NOT EXISTS takeover_until TIMESTAMPTZ;
ALTER TABLE facebook_conversations 
    ADD COLUMN IF NOT EXISTS active_goal_id UUID REFERENCES conversation_goals(id) ON DELETE SET NULL;
ALTER TABLE facebook_conversations 
    ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL DEFAULT 1.0;
ALTER TABLE facebook_conversations 
    ADD COLUMN IF NOT EXISTS last_ai_message_at TIMESTAMPTZ;
ALTER TABLE facebook_conversations 
    ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
ALTER TABLE facebook_conversations 
    ADD COLUMN IF NOT EXISTS opt_out BOOLEAN DEFAULT false;
ALTER TABLE facebook_conversations 
    ADD COLUMN IF NOT EXISTS opt_out_at TIMESTAMPTZ;

-- ============================================
-- AI GLOBAL SETTINGS
-- ============================================
INSERT INTO settings (key, value) VALUES
    ('ai_chatbot_config', '{
        "default_cooldown_hours": 4,
        "min_confidence_threshold": 0.6,
        "max_messages_per_day": 5,
        "auto_takeover_on_low_confidence": true,
        "default_message_split_threshold": 500,
        "intuition_silence_hours": 24,
        "best_time_lookback_days": 30
    }')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE conversation_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_followup_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_takeover_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE opt_out_phrases ENABLE ROW LEVEL SECURITY;

-- RLS Policies - All authenticated users can read, admins can manage
CREATE POLICY "Goals viewable by authenticated" ON conversation_goals
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage goals" ON conversation_goals
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Followups viewable by authenticated" ON ai_followup_schedule
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage followups" ON ai_followup_schedule
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Flows viewable by authenticated" ON ai_flows
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage flows" ON ai_flows
    FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Takeover log viewable by authenticated" ON ai_takeover_log
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can insert takeover log" ON ai_takeover_log
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Action log viewable by authenticated" ON ai_action_log
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can insert action log" ON ai_action_log
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Engagement viewable by authenticated" ON contact_engagement
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage engagement" ON contact_engagement
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Goal templates viewable by authenticated" ON goal_templates
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage goal templates" ON goal_templates
    FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Opt-out phrases viewable by authenticated" ON opt_out_phrases
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage opt-out phrases" ON opt_out_phrases
    FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_goals_conversation ON conversation_goals(conversation_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON conversation_goals(status);
CREATE INDEX IF NOT EXISTS idx_followups_scheduled ON ai_followup_schedule(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_followups_conversation ON ai_followup_schedule(conversation_id);
CREATE INDEX IF NOT EXISTS idx_flows_trigger ON ai_flows(trigger_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_takeover_conversation ON ai_takeover_log(conversation_id);
CREATE INDEX IF NOT EXISTS idx_action_log_conversation ON ai_action_log(conversation_id);
CREATE INDEX IF NOT EXISTS idx_action_log_created ON ai_action_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_participant ON contact_engagement(participant_id);
CREATE INDEX IF NOT EXISTS idx_engagement_time ON contact_engagement(day_of_week, hour_of_day);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER conversation_goals_updated_at
    BEFORE UPDATE ON conversation_goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ai_followup_schedule_updated_at
    BEFORE UPDATE ON ai_followup_schedule
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ai_flows_updated_at
    BEFORE UPDATE ON ai_flows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE ai_followup_schedule;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_action_log;

-- ============================================
-- INSERT DEFAULT GOAL TEMPLATES
-- ============================================
INSERT INTO goal_templates (name, goal_type, default_prompt, success_criteria, is_system) VALUES
(
    'Book a Call',
    'book_call',
    'Your goal is to schedule a call or meeting with this lead. Be helpful and professional. Suggest specific times and dates. If they agree to a meeting, collect their preferred time and confirm.',
    '{"indicators": ["meeting confirmed", "call scheduled", "booking confirmed"], "booking_detected": true}',
    true
),
(
    'Close the Sale',
    'close_sale',
    'Your goal is to close a sale with this lead. Address any objections, highlight value, and guide them toward purchase. Be persuasive but respectful. If they express interest, provide clear next steps for payment or signup.',
    '{"indicators": ["payment received", "order placed", "deal closed"], "purchase_completed": true}',
    true
),
(
    'Re-engage Lead',
    're_engage',
    'This lead has gone cold. Your goal is to re-engage them and rekind their interest. Start with a friendly check-in, remind them of the value proposition, and ask if their situation has changed.',
    '{"indicators": ["responded", "showed interest", "asked question"], "engagement_restored": true}',
    true
),
(
    'Qualify Lead',
    'qualify_lead',
    'Your goal is to qualify this lead by understanding their needs, budget, timeline, and decision-making process. Ask relevant questions to determine if they are a good fit for our services.',
    '{"indicators": ["budget confirmed", "timeline known", "decision maker identified"], "qualification_complete": true}',
    true
),
(
    'Provide Information',
    'provide_info',
    'Your goal is to answer questions and provide helpful information about our products/services. Be informative and helpful. Use the knowledge base to ensure accuracy.',
    '{"indicators": ["question answered", "information provided"], "info_delivered": true}',
    true
)
ON CONFLICT DO NOTHING;
