-- Migration: Add 'booked' phase
-- Run this in Supabase SQL Editor

-- 1. Drop existing check constraint
ALTER TABLE clients DROP CONSTRAINT clients_phase_check;

-- 2. Add new check constraint with 'booked'
ALTER TABLE clients ADD CONSTRAINT clients_phase_check 
  CHECK (phase IN ('booked', 'preparing', 'testing', 'running'));

-- 3. (Optional) Make project_name nullable if you want strict "Lead" support
-- ALTER TABLE clients ALTER COLUMN project_name DROP NOT NULL;
