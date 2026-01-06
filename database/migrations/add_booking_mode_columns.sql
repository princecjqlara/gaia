-- Complete Migration: Add ALL missing booking_settings columns
-- Run this in Supabase SQL Editor to fix the booking settings table

-- Add all potentially missing columns
ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS min_advance_hours INTEGER DEFAULT 1;

ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS booking_mode TEXT DEFAULT 'slots';

ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS allow_next_hour BOOLEAN DEFAULT false;

ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS auto_redirect_enabled BOOLEAN DEFAULT true;

ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS auto_redirect_delay INTEGER DEFAULT 5;

ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS confirmation_message TEXT DEFAULT 'Your booking has been confirmed! We look forward to meeting with you.';

ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS messenger_prefill_message TEXT DEFAULT 'Hi! I just booked an appointment for {date} at {time}. Please confirm my booking. Thank you!';

ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT true;

ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS reminder_hours_before INTEGER DEFAULT 24;

ALTER TABLE booking_settings 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[
    {"id": "name", "label": "Your Name", "type": "text", "required": true},
    {"id": "phone", "label": "Phone Number", "type": "tel", "required": true},
    {"id": "email", "label": "Email Address", "type": "email", "required": false},
    {"id": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]'::jsonb;

-- Verify the columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'booking_settings'
ORDER BY ordinal_position;
