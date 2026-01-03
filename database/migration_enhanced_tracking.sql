-- Migration: Enhanced Calendar Events and Salary Tracking
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Add missing columns to calendar_events
-- ============================================
ALTER TABLE calendar_events 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled' 
  CHECK (status IN ('scheduled', 'done', 'rescheduled', 'cancelled'));

ALTER TABLE calendar_events 
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE calendar_events 
ADD COLUMN IF NOT EXISTS attendees UUID[] DEFAULT '{}';

ALTER TABLE calendar_events 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ============================================
-- 2. Add subscription tracking to clients
-- ============================================
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS subscription_start_date DATE;

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS subscription_end_date DATE;

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS subscription_cycle_days INTEGER DEFAULT 30;

-- ============================================
-- 3. Create payment milestones table for split payments
-- ============================================
CREATE TABLE IF NOT EXISTS payment_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN ('week_1', 'week_2', 'week_3', 'week_4', 'half_1', 'half_2', 'full')),
  milestone_label TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  is_paid BOOLEAN DEFAULT false,
  due_date DATE NOT NULL,
  paid_date DATE,
  subscription_cycle INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_payment_milestones_client_id ON payment_milestones(client_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_user_id ON payment_milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_due_date ON payment_milestones(due_date);

-- Enable RLS
ALTER TABLE payment_milestones ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view payment milestones" ON payment_milestones
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage payment milestones" ON payment_milestones
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 4. Add subscription start phase setting
-- ============================================
INSERT INTO settings (key, value) VALUES
  ('subscription_start_phase', '"testing"')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- 5. Trigger for subscription start
-- ============================================
CREATE OR REPLACE FUNCTION handle_subscription_start()
RETURNS TRIGGER AS $$
DECLARE
  start_phase TEXT;
BEGIN
  -- Get the configured start phase
  SELECT value::text INTO start_phase FROM settings WHERE key = 'subscription_start_phase';
  start_phase := COALESCE(TRIM(BOTH '"' FROM start_phase), 'testing');
  
  -- If client is entering the subscription start phase
  IF NEW.phase = start_phase AND (OLD.phase IS NULL OR OLD.phase != start_phase) THEN
    -- Only set if not already set
    IF NEW.subscription_start_date IS NULL THEN
      NEW.subscription_start_date := CURRENT_DATE;
      NEW.subscription_end_date := CURRENT_DATE + INTERVAL '30 days';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_subscription_start ON clients;
CREATE TRIGGER trigger_subscription_start
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION handle_subscription_start();

-- Also apply on insert
DROP TRIGGER IF EXISTS trigger_subscription_start_insert ON clients;
CREATE TRIGGER trigger_subscription_start_insert
  BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION handle_subscription_start();

-- ============================================
-- 6. Function to generate payment milestones
-- ============================================
CREATE OR REPLACE FUNCTION generate_payment_milestones(
  p_client_id UUID,
  p_user_id UUID,
  p_total_salary DECIMAL(10, 2),
  p_payment_type TEXT -- 'weekly', 'biweekly', 'monthly'
)
RETURNS void AS $$
DECLARE
  v_start_date DATE;
  v_cycle INTEGER;
BEGIN
  -- Get subscription start date
  SELECT subscription_start_date INTO v_start_date FROM clients WHERE id = p_client_id;
  IF v_start_date IS NULL THEN
    v_start_date := CURRENT_DATE;
  END IF;
  
  -- Get current cycle
  SELECT COALESCE(MAX(subscription_cycle), 0) + 1 INTO v_cycle 
  FROM payment_milestones WHERE client_id = p_client_id AND user_id = p_user_id;
  
  -- Generate milestones based on payment type
  IF p_payment_type = 'weekly' THEN
    -- 4 weekly payments
    INSERT INTO payment_milestones (client_id, user_id, milestone_type, milestone_label, amount, due_date, subscription_cycle)
    VALUES 
      (p_client_id, p_user_id, 'week_1', 'Week 1', p_total_salary / 4, v_start_date + INTERVAL '7 days', v_cycle),
      (p_client_id, p_user_id, 'week_2', 'Week 2', p_total_salary / 4, v_start_date + INTERVAL '14 days', v_cycle),
      (p_client_id, p_user_id, 'week_3', 'Week 3', p_total_salary / 4, v_start_date + INTERVAL '21 days', v_cycle),
      (p_client_id, p_user_id, 'week_4', 'Week 4', p_total_salary / 4, v_start_date + INTERVAL '28 days', v_cycle);
  ELSIF p_payment_type = 'biweekly' THEN
    -- 2 bi-weekly payments
    INSERT INTO payment_milestones (client_id, user_id, milestone_type, milestone_label, amount, due_date, subscription_cycle)
    VALUES 
      (p_client_id, p_user_id, 'half_1', '1st Half (Days 1-15)', p_total_salary / 2, v_start_date + INTERVAL '15 days', v_cycle),
      (p_client_id, p_user_id, 'half_2', '2nd Half (Days 16-30)', p_total_salary / 2, v_start_date + INTERVAL '30 days', v_cycle);
  ELSE
    -- Monthly (full payment)
    INSERT INTO payment_milestones (client_id, user_id, milestone_type, milestone_label, amount, due_date, subscription_cycle)
    VALUES 
      (p_client_id, p_user_id, 'full', 'Monthly Payment', p_total_salary, v_start_date + INTERVAL '30 days', v_cycle);
  END IF;
END;
$$ LANGUAGE plpgsql;
