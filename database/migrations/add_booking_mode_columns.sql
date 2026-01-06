-- Migration: Add same-day booking settings columns
-- Run this in Supabase SQL Editor if you already have the booking_settings table

-- Add min_advance_hours column (hours required in advance for same-day bookings)
ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS min_advance_hours INTEGER DEFAULT 1;

-- Add booking_mode column ('slots', 'flexible', or 'both')
ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS booking_mode TEXT DEFAULT 'slots';

-- Add allow_next_hour column (show "Book Next Hour" quick option)
ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS allow_next_hour BOOLEAN DEFAULT false;

-- Confirm the changes
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'booking_settings' 
AND column_name IN ('min_advance_hours', 'booking_mode', 'allow_next_hour');
