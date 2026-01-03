-- Campy Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create admin accounts (password is set via Supabase Auth, not here)
-- You'll need to create the auth user in Supabase Dashboard -> Authentication
-- Then insert the user record here with matching ID
-- Or use the create_admin_account.js script or admin_setup.html page

-- Update existing users to admin role
UPDATE users SET role = 'admin' WHERE email = 'cjlara032107@gmail.com';
UPDATE users SET role = 'admin' WHERE email = 'aresmedia2026@gmail.com';

-- Note: To create new admin accounts, use one of these methods:
-- 1. Run create_admin_account.js script
-- 2. Use admin_setup.html page
-- 3. Create auth user in Supabase Dashboard, then insert here with matching UUID

-- ============================================
-- CLIENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_name TEXT NOT NULL,
  business_name TEXT,
  contact_details TEXT,
  page_link TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  
  -- Package
  package TEXT DEFAULT 'basic' CHECK (package IN ('basic', 'star', 'fire', 'crown', 'custom')),
  custom_package JSONB,
  
  -- Payment
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  payment_schedule TEXT DEFAULT 'monthly' CHECK (payment_schedule IN ('monthly', 'biweekly', 'onetime')),
  months_with_client INTEGER DEFAULT 0,
  start_date DATE,
  
  -- Phase Management
  phase TEXT DEFAULT 'proposal-sent' CHECK (phase IN ('proposal-sent', 'booked', 'preparing', 'testing', 'running')),
  priority INTEGER DEFAULT 0,
  auto_switch BOOLEAN DEFAULT false,
  auto_switch_days INTEGER DEFAULT 7,
  next_phase_date DATE,
  
  -- Testing Phase
  subscription_usage INTEGER DEFAULT 0,
  testing_round INTEGER DEFAULT 1,
  subscription_started BOOLEAN DEFAULT false,
  subscription_usage_detail JSONB DEFAULT '{"videosUsed": 0, "mainVideosUsed": 0, "photosUsed": 0, "meetingMinutesUsed": 0}',
  
  -- Resubscription
  resubscription_count INTEGER DEFAULT 0,
  
  -- Expense (Admin only)
  ads_expense INTEGER DEFAULT 0,
  
  -- Assignment
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STAGE HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS stage_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  from_phase TEXT,
  to_phase TEXT NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SETTINGS TABLE (Global settings like package expenses, AI prompts)
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default settings
INSERT INTO settings (key, value) VALUES
  ('package_expenses', '{"basic": 500, "star": 800, "fire": 1000, "crown": 1500, "custom": 0}'),
  ('ai_prompts', '{"adType": "Analyze the business niche ''{niche}'' and target audience ''{audience}''. Suggest the top 3 most effective Facebook ad formats.", "campaignStructure": "For a local service business in niche ''{niche}'' with a budget of ₱150-300/day, outline a recommended campaign structure."}')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Users: Everyone can read, only admins can write
CREATE POLICY "Users are viewable by authenticated users" ON users
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage users" ON users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Clients: All authenticated users can read and write
CREATE POLICY "Clients are viewable by authenticated users" ON clients
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert clients" ON clients
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update clients" ON clients
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete clients" ON clients
  FOR DELETE USING (auth.role() = 'authenticated');

-- Stage History: All authenticated users can read and write
CREATE POLICY "History is viewable by authenticated users" ON stage_history
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert history" ON stage_history
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Settings: Everyone can read, only admins can write
CREATE POLICY "Settings are viewable by authenticated users" ON settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage settings" ON settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_clients_phase ON clients(phase);
CREATE INDEX IF NOT EXISTS idx_clients_assigned_to ON clients(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_payment_status ON clients(payment_status);
CREATE INDEX IF NOT EXISTS idx_stage_history_client_id ON stage_history(client_id);
