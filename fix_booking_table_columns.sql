-- Fix booking_settings table (Run this if the table exists but is missing columns)
-- 1. Create table if it doesn't exist at all
CREATE TABLE IF NOT EXISTS booking_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    page_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 2. Add missing columns safely (idempotent)
DO $$ BEGIN -- Availability
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'available_days'
) THEN
ALTER TABLE booking_settings
ADD COLUMN available_days INTEGER [] DEFAULT ARRAY [1, 2, 3, 4, 5];
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'start_time'
) THEN
ALTER TABLE booking_settings
ADD COLUMN start_time TIME DEFAULT '09:00';
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'end_time'
) THEN
ALTER TABLE booking_settings
ADD COLUMN end_time TIME DEFAULT '17:00';
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'slot_duration'
) THEN
ALTER TABLE booking_settings
ADD COLUMN slot_duration INTEGER DEFAULT 30;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'max_advance_days'
) THEN
ALTER TABLE booking_settings
ADD COLUMN max_advance_days INTEGER DEFAULT 30;
END IF;
-- Booking Logic
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'min_advance_hours'
) THEN
ALTER TABLE booking_settings
ADD COLUMN min_advance_hours INTEGER DEFAULT 1;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'booking_mode'
) THEN
ALTER TABLE booking_settings
ADD COLUMN booking_mode TEXT DEFAULT 'slots';
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'allow_next_hour'
) THEN
ALTER TABLE booking_settings
ADD COLUMN allow_next_hour BOOLEAN DEFAULT false;
END IF;
-- Forms & Messages
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'custom_fields'
) THEN
ALTER TABLE booking_settings
ADD COLUMN custom_fields JSONB DEFAULT '[{"id": "name", "label": "Your Name", "type": "text", "required": true}, {"id": "phone", "label": "Phone Number", "type": "tel", "required": true}, {"id": "email", "label": "Email Address", "type": "email", "required": false}]'::jsonb;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'confirmation_message'
) THEN
ALTER TABLE booking_settings
ADD COLUMN confirmation_message TEXT DEFAULT 'Your booking has been confirmed!';
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'messenger_prefill_message'
) THEN
ALTER TABLE booking_settings
ADD COLUMN messenger_prefill_message TEXT DEFAULT 'Hi! I just booked an appointment.';
END IF;
-- Redirect & Reminders
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'auto_redirect_enabled'
) THEN
ALTER TABLE booking_settings
ADD COLUMN auto_redirect_enabled BOOLEAN DEFAULT true;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'auto_redirect_delay'
) THEN
ALTER TABLE booking_settings
ADD COLUMN auto_redirect_delay INTEGER DEFAULT 5;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'reminder_enabled'
) THEN
ALTER TABLE booking_settings
ADD COLUMN reminder_enabled BOOLEAN DEFAULT true;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'booking_settings'
        AND column_name = 'reminder_hours_before'
) THEN
ALTER TABLE booking_settings
ADD COLUMN reminder_hours_before INTEGER DEFAULT 24;
END IF;
END $$;
-- 3. Enable RLS
ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;
-- 4. Create RLS Policies (Drop first to avoid errors)
DROP POLICY IF EXISTS "Public can read booking settings" ON booking_settings;
CREATE POLICY "Public can read booking settings" ON booking_settings FOR
SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage booking settings" ON booking_settings;
CREATE POLICY "Authenticated users can manage booking settings" ON booking_settings FOR ALL USING (auth.role() = 'authenticated');
-- 5. Create Indexes
CREATE INDEX IF NOT EXISTS idx_booking_settings_page_id ON booking_settings(page_id);