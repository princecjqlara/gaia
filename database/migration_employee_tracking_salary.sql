-- Migration: Add Employee Tracking, Team Leader, Salary Management
-- This migration adds:
-- 1. Team leader assignment to users
-- 2. Salary per client per user tracking
-- 3. User salary settings (payment frequency)
-- 4. Make ads_expense optional

-- ============================================
-- 1. Add team_leader_id to users table
-- ============================================
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS team_leader_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add index for team leader queries
CREATE INDEX IF NOT EXISTS idx_users_team_leader_id ON users(team_leader_id);

-- ============================================
-- 2. Create user_salary_settings table
-- ============================================
CREATE TABLE IF NOT EXISTS user_salary_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (payment_frequency IN ('weekly', 'biweekly', 'monthly', 'instant')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================
-- 3. Create user_client_salary table
-- ============================================
CREATE TABLE IF NOT EXISTS user_client_salary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  salary_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  is_paid BOOLEAN DEFAULT false,
  -- Only pay salary if client payment_status is 'paid'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, client_id)
);

-- ============================================
-- 4. Create salary_payments table for tracking payment history
-- ============================================
CREATE TABLE IF NOT EXISTS salary_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_date DATE NOT NULL,
  scheduled_date DATE NOT NULL,
  payment_frequency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. Make ads_expense nullable (optional)
-- ============================================
ALTER TABLE clients 
ALTER COLUMN ads_expense DROP NOT NULL;

-- ============================================
-- 6. Add indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_salary_settings_user_id ON user_salary_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_client_salary_user_id ON user_client_salary(user_id);
CREATE INDEX IF NOT EXISTS idx_user_client_salary_client_id ON user_client_salary(client_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_user_id ON salary_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_client_id ON salary_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_status ON salary_payments(status);
CREATE INDEX IF NOT EXISTS idx_salary_payments_scheduled_date ON salary_payments(scheduled_date);

-- ============================================
-- 7. Enable RLS on new tables
-- ============================================
ALTER TABLE user_salary_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_client_salary ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_salary_settings
CREATE POLICY "Users can view their own salary settings" ON user_salary_settings
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      user_id = auth.uid() OR
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Admins can manage salary settings" ON user_salary_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- RLS Policies for user_client_salary
CREATE POLICY "Users can view their own client salaries" ON user_client_salary
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      user_id = auth.uid() OR
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Admins can manage client salaries" ON user_client_salary
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- RLS Policies for salary_payments
CREATE POLICY "Users can view their own salary payments" ON salary_payments
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      user_id = auth.uid() OR
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Admins can manage salary payments" ON salary_payments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 8. Add triggers for updated_at
-- ============================================
CREATE TRIGGER user_salary_settings_updated_at
  BEFORE UPDATE ON user_salary_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_client_salary_updated_at
  BEFORE UPDATE ON user_client_salary
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER salary_payments_updated_at
  BEFORE UPDATE ON salary_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 9. Function to calculate next payment date based on frequency
-- ============================================
CREATE OR REPLACE FUNCTION calculate_next_payment_date(
  p_frequency TEXT,
  p_start_date DATE DEFAULT CURRENT_DATE
)
RETURNS DATE AS $$
DECLARE
  next_date DATE;
BEGIN
  CASE p_frequency
    WHEN 'weekly' THEN
      next_date := p_start_date + INTERVAL '7 days';
    WHEN 'biweekly' THEN
      next_date := p_start_date + INTERVAL '14 days';
    WHEN 'monthly' THEN
      next_date := p_start_date + INTERVAL '1 month';
    WHEN 'instant' THEN
      next_date := CURRENT_DATE;
    ELSE
      next_date := p_start_date + INTERVAL '1 month';
  END CASE;
  
  RETURN next_date;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 10. Function to generate salary payments based on frequency
-- ============================================
CREATE OR REPLACE FUNCTION generate_salary_payments()
RETURNS void AS $$
DECLARE
  user_record RECORD;
  client_record RECORD;
  salary_record RECORD;
  next_payment_date DATE;
  total_amount DECIMAL(10, 2);
BEGIN
  -- Loop through all users with salary settings
  FOR user_record IN 
    SELECT u.id, u.name, uss.payment_frequency
    FROM users u
    INNER JOIN user_salary_settings uss ON u.id = uss.user_id
    WHERE u.role = 'user'
  LOOP
    -- Get all paid clients assigned to this user
    FOR client_record IN
      SELECT c.id, c.client_name, c.payment_status
      FROM clients c
      WHERE c.assigned_to = user_record.id
        AND c.payment_status = 'paid'
        AND c.phase = 'running'
    LOOP
      -- Get salary amount for this user-client combination
      SELECT salary_amount INTO salary_record
      FROM user_client_salary
      WHERE user_id = user_record.id
        AND client_id = client_record.id;
      
      -- If salary is set and > 0, create payment record
      IF salary_record.salary_amount > 0 THEN
        -- Calculate next payment date based on frequency
        next_payment_date := calculate_next_payment_date(
          user_record.payment_frequency,
          CURRENT_DATE
        );
        
        -- Check if payment already exists for this period
        IF NOT EXISTS (
          SELECT 1 FROM salary_payments
          WHERE user_id = user_record.id
            AND client_id = client_record.id
            AND scheduled_date = next_payment_date
            AND status = 'pending'
        ) THEN
          -- Insert new payment record
          INSERT INTO salary_payments (
            user_id,
            client_id,
            amount,
            payment_date,
            scheduled_date,
            payment_frequency,
            status
          ) VALUES (
            user_record.id,
            client_record.id,
            salary_record.salary_amount,
            CASE WHEN user_record.payment_frequency = 'instant' THEN CURRENT_DATE ELSE next_payment_date END,
            next_payment_date,
            user_record.payment_frequency,
            CASE WHEN user_record.payment_frequency = 'instant' THEN 'paid' ELSE 'pending' END
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

