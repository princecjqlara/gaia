-- Fix clients assigned_to foreign key to set NULL when user is deleted
-- This prevents foreign key violations and automatically unassigns clients when users are removed

-- First, drop the existing constraint
ALTER TABLE clients
DROP CONSTRAINT IF EXISTS clients_assigned_to_fkey;

-- Re-add the constraint with ON DELETE SET NULL
-- This means if a user is deleted, any clients assigned to them will have assigned_to set to NULL
ALTER TABLE clients
ADD CONSTRAINT clients_assigned_to_fkey
FOREIGN KEY (assigned_to)
REFERENCES users(id)
ON DELETE SET NULL;

-- Also clean up any orphaned assigned_to values (clients assigned to non-existent users)
UPDATE clients
SET assigned_to = NULL
WHERE assigned_to IS NOT NULL
AND assigned_to NOT IN (SELECT id FROM users);
