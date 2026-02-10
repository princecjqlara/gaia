-- Fix missing organization_id column in users table
-- Run this in Supabase SQL Editor

-- 1. Add organization_id column if it doesn't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS organization_id UUID;

-- 2. Set default value to NULL for existing users
UPDATE users
SET organization_id = NULL
WHERE organization_id IS NULL;

-- 3. Update the role check constraint to include all roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
ADD CONSTRAINT users_role_check CHECK (
  role IN ('admin', 'user', 'organizer', 'chat_support')
);
