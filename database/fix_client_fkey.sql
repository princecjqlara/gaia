-- Fix Foreign Key Constraints for Client Creation
-- Run this in Supabase SQL Editor

-- 1. Make created_by nullable (optional)
ALTER TABLE clients 
ALTER COLUMN created_by DROP NOT NULL;

-- 2. Make assigned_to constraint more lenient (already nullable but ensure it works)
-- The foreign key already allows NULL, but let's add ON DELETE SET NULL
ALTER TABLE clients
DROP CONSTRAINT IF EXISTS clients_created_by_fkey;

ALTER TABLE clients
ADD CONSTRAINT clients_created_by_fkey 
FOREIGN KEY (created_by) 
REFERENCES users(id) 
ON DELETE SET NULL;

-- 3. Add a function to safely get or create user profile
CREATE OR REPLACE FUNCTION ensure_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Check if user exists
  SELECT id INTO v_user_id FROM users WHERE id = p_user_id;
  
  IF v_user_id IS NULL THEN
    -- Create user profile
    INSERT INTO users (id, email, name, role)
    VALUES (p_user_id, p_email, COALESCE(p_name, split_part(p_email, '@', 1)), 'user')
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_user_id;
    
    -- If insert failed due to conflict, get the existing id
    IF v_user_id IS NULL THEN
      SELECT id INTO v_user_id FROM users WHERE id = p_user_id;
    END IF;
  END IF;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION ensure_user_profile(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_user_profile(UUID, TEXT, TEXT) TO anon;
