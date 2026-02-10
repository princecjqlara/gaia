-- Make user with ID '1a4ec56c-bb34-4a46-96fd-256a7d61d6f7' an admin
-- Run this in Supabase SQL Editor

-- Update the user role to admin by ID
UPDATE users 
SET role = 'admin' 
WHERE id = '1a4ec56c-bb34-4a46-96fd-256a7d61d6f7';

-- Verify the update
SELECT id, email, name, role 
FROM users 
WHERE id = '1a4ec56c-bb34-4a46-96fd-256a7d61d6f7';

-- If no rows are updated, check if the user exists:
SELECT id, email, name, role 
FROM users 
WHERE email LIKE '%gaia%' OR email LIKE '%admin%';

-- To see all users:
-- SELECT id, email, name, role FROM users ORDER BY created_at DESC LIMIT机关 20;