-- Create booking_settings table to fix 404/PGRST205 errors
-- 1. Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS booking_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    page_id TEXT UNIQUE NOT NULL,
    -- Ensure one settings row per page
    -- Availability
    available_days INTEGER [] DEFAULT ARRAY [1, 2, 3, 4, 5],
    -- 1=Mon, 5=Fri
    start_time TIME DEFAULT '09:00',
    end_time TIME DEFAULT '17:00',
    slot_duration INTEGER DEFAULT 30,
    max_advance_days INTEGER DEFAULT 30,
    -- Booking Logic
    min_advance_hours INTEGER DEFAULT 1,
    booking_mode TEXT DEFAULT 'slots',
    -- 'slots', 'flexible', 'both'
    allow_next_hour BOOLEAN DEFAULT false,
    -- Forms & Messages
    custom_fields JSONB DEFAULT '[{"id": "name", "label": "Your Name", "type": "text", "required": true}, {"id": "phone", "label": "Phone Number", "type": "tel", "required": true}, {"id": "email", "label": "Email Address", "type": "email", "required": false}]'::jsonb,
    confirmation_message TEXT DEFAULT 'Your booking has been confirmed!',
    messenger_prefill_message TEXT DEFAULT 'Hi! I just booked an appointment.',
    -- Redirect & Reminders
    auto_redirect_enabled BOOLEAN DEFAULT true,
    auto_redirect_delay INTEGER DEFAULT 5,
    reminder_enabled BOOLEAN DEFAULT true,
    reminder_hours_before INTEGER DEFAULT 24,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 2. Enable RLS
ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;
-- 3. Create RLS Policies (Drop existing first to avoid errors)
DROP POLICY IF EXISTS "Public can read booking settings" ON booking_settings;
CREATE POLICY "Public can read booking settings" ON booking_settings FOR
SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage booking settings" ON booking_settings;
CREATE POLICY "Authenticated users can manage booking settings" ON booking_settings FOR ALL USING (auth.role() = 'authenticated');
-- 4. Create Indexes
CREATE INDEX IF NOT EXISTS idx_booking_settings_page_id ON booking_settings(page_id);