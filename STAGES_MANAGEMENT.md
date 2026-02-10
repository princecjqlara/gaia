# Stages Management Feature

This feature allows users to:
1. Add custom stages to the pipeline
2. Delete stages (except the default "Booked" stage)
3. Rename stages (including "Booked")
4. Customize stage emojis and colors

## Database Migration

Run this SQL script in Supabase SQL Editor:

```sql
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
```

## Usage

1. Go to **Admin Settings** → **Stages Management** tab
2. Add new stages by entering a name and selecting an emoji
3. Edit existing stages (including "Booked") by clicking the ✏️ button
4. Delete stages (except "Booked") by clicking the 🗑️ button
5. Click **Save Settings** to apply changes

## Key Features

- **Default Stage Protection**: The first stage (originally "Booked") is marked as `is_system_default` and cannot be deleted
- **Custom Display Names**: You can rename "Booked" to something like "New Lead" or "Contacted"
- **Stage Emojis**: Each stage has a customizable emoji for visual identification
- **Auto-reload**: After saving stage changes, the page automatically reloads to update all views
- **Persistent Storage**: Stages are saved to the database and cached in localStorage for offline access

## Components Updated

1. `AdminSettingsModal.jsx` - Added Stages Management tab and UI
2. `PhasesContainer.jsx` - Dynamic stages loading from localStorage
3. `PhaseColumn.jsx` - Accepts stageConfig prop for custom display
4. `StatsGrid.jsx` - Dynamic stage metrics based on custom stages
5. `useMetrics.js` - Generates metrics for custom stages
6. `database/stages_management.sql` - Database schema

## Notes

- The default stage (`is_system_default = true`) cannot be deleted but can be renamed
- Stage keys (e.g., 'booked', 'preparing') are used internally and should not be changed
- Client records with deleted stages will need manual reassignment
- All stage changes are synced to localStorage for immediate offline access
