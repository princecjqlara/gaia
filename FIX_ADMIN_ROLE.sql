-- Quick fix to set admin@gaia.com as admin
-- Run this in Supabase SQL Editor

-- Update the user role to admin
UPDATE users 
SET role = 'admin' 
WHERE email = 'admin@gaia.com';

-- Verify the update
SELECT id, email, name, role 
FROM users 
WHERE email = 'admin@gaia.com';

-- If the user doesn't exist yet, you'll need to:
-- 1. Create the auth user in Supabase Dashboard -> Authentication
-- 2. Get the UUID from the auth user
-- 3. Run: INSERT INTO users (id, email, name, role) VALUES ('UUID_HERE', 'admin@gaia.com', 'Gaia Admin', 'admin');


