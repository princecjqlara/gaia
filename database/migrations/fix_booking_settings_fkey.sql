-- Fix Booking Settings: Drop Foreign Key Constraint
-- Run this in Supabase SQL Editor to allow any page_id value

-- Drop the foreign key constraint that requires page_id to exist in facebook_pages
ALTER TABLE booking_settings 
DROP CONSTRAINT IF EXISTS booking_settings_page_id_fkey;

-- Also add missing columns if not already present
ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS same_day_buffer INTEGER DEFAULT 0;
ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS available_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5];

-- Verify the changes
SELECT conname FROM pg_constraint WHERE conrelid = 'booking_settings'::regclass;
