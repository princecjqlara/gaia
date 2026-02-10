-- Stages Management Migration
-- Run this in Supabase SQL Editor

-- Create custom_stages table to store user-defined stages
CREATE TABLE IF NOT EXISTS custom_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  emoji TEXT,
  color TEXT DEFAULT '#3b82f6',
  order_position INTEGER DEFAULT 0,
  is_system_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE custom_stages ENABLE ROW LEVEL SECURITY;

-- Policies for custom_stages
CREATE POLICY "Users can view stages in their organization" ON custom_stages
  FOR SELECT USING (organization_id IS NULL OR organization_id = get_user_organization_id());

CREATE POLICY "Admins can manage stages" ON custom_stages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Insert default stages
INSERT INTO custom_stages (stage_key, display_name, emoji, color, order_position, is_system_default)
VALUES
  ('booked', 'Booked', '📅', '#3b82f6', 1, true),
  ('follow-up', 'Follow-up', '💬', '#f59e0b', 2, false),
  ('preparing', 'Preparing', '⏳', '#8b5cf6', 3, false),
  ('testing', 'Testing', '🧪', '#ec4899', 4, false),
  ('running', 'Running', '🚀', '#10b981', 5, false)
ON CONFLICT (stage_key) DO NOTHING;

-- Update clients table to allow any valid stage (remove the CHECK constraint)
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_phase_check;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_custom_stages_order ON custom_stages(order_position);
CREATE INDEX IF NOT EXISTS idx_custom_stages_org ON custom_stages(organization_id);

-- Create function to get stages for an organization
CREATE OR REPLACE FUNCTION get_organization_stages(p_org_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  stages_key TEXT,
  display_name TEXT,
  emoji TEXT,
  color TEXT,
  order_position INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id,
    cs.stage_key,
    cs.display_name,
    cs.emoji,
    cs.color,
    cs.order_position
  FROM custom_stages cs
  WHERE cs.organization_id IS NULL
     OR (p_org_id IS NOT NULL AND cs.organization_id = p_org_id)
  ORDER BY cs.order_position, cs.display_name;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_organization_stages TO authenticated;

-- Update settings table to include default_stage configuration
INSERT INTO settings (key, value)
VALUES ('stage_settings', '{"defaultStageKey": "booked", "allowStageCustomization": true}')
ON CONFLICT (key) DO NOTHING;
