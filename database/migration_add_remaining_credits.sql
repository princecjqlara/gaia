-- Migration: Add remaining_credits column to clients table
-- Run this in Supabase SQL Editor

-- Add remaining_credits column to clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS remaining_credits INTEGER DEFAULT 0;

-- Update existing clients to have 0 remaining credits if NULL
UPDATE clients 
SET remaining_credits = 0 
WHERE remaining_credits IS NULL;

-- Add NOT NULL constraint (safe since we just set all NULLs to 0)
ALTER TABLE clients 
ALTER COLUMN remaining_credits SET NOT NULL;

-- Add CHECK constraint to ensure credits are non-negative
ALTER TABLE clients 
ADD CONSTRAINT remaining_credits_non_negative 
CHECK (remaining_credits >= 0);

-- Add column comment for documentation
COMMENT ON COLUMN clients.remaining_credits IS 
'Number of subscription credits remaining for the client. Used to track remaining subscription usage.';

-- Optional: Create index if you frequently query clients by remaining credits
-- (e.g., to find clients with low credits)
-- CREATE INDEX IF NOT EXISTS idx_clients_remaining_credits ON clients(remaining_credits);

-- ============================================
-- ROLLBACK (if needed)
-- ============================================
-- To rollback this migration, run:
-- ALTER TABLE clients DROP CONSTRAINT IF EXISTS remaining_credits_non_negative;
-- ALTER TABLE clients DROP COLUMN IF EXISTS remaining_credits;

