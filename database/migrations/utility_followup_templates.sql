-- Utility follow-up templates
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS utility_followup_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL,
  template_id text,
  template_name text NOT NULL,
  language text NOT NULL DEFAULT 'en_US',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  template_body text NOT NULL,
  template_hash text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai_generated')),
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  last_used_at timestamptz,
  use_count integer DEFAULT 0,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_utility_templates_page_status
  ON utility_followup_templates(page_id, status);

CREATE INDEX IF NOT EXISTS idx_utility_templates_page_language
  ON utility_followup_templates(page_id, language);

CREATE UNIQUE INDEX IF NOT EXISTS idx_utility_templates_page_hash
  ON utility_followup_templates(page_id, template_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_utility_templates_page_name
  ON utility_followup_templates(page_id, template_name);

ALTER TABLE utility_followup_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON utility_followup_templates;
CREATE POLICY "Service role full access" ON utility_followup_templates
  FOR ALL USING (true) WITH CHECK (true);

SELECT 'Utility follow-up templates table created successfully!' as result;
