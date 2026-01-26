-- Team Branding Customization Migration
-- Adds branding JSONB column to teams table for admin customization
-- Add branding column to teams table
ALTER TABLE teams
ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{
  "logo_url": null,
  "team_display_name": null,
  "tagline": "Find Your Dream Home",
  "subtitle": "Browse our exclusive portfolio of premium properties.",
  "hero_image_url": null,
  "primary_color": "#10b981",
  "contact_phone": null,
  "contact_email": null,
  "facebook_url": null,
  "instagram_url": null,
  "website_url": null,
  "address": null
}'::jsonb;
-- Create index for faster branding lookups
CREATE INDEX IF NOT EXISTS idx_teams_branding ON teams USING gin (branding);
-- Update RLS to allow admins to update their team's branding
CREATE POLICY "Admins can update own team branding" ON teams FOR
UPDATE USING (
        admin_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM users
            WHERE id = auth.uid()
                AND team_id = teams.id
                AND role = 'admin'
        )
    );
-- Grant access for team members to read branding for public display
CREATE POLICY "Team members can view branding" ON teams FOR
SELECT USING (
        id IN (
            SELECT team_id
            FROM users
            WHERE id = auth.uid()
        )
        OR admin_id = auth.uid()
    );