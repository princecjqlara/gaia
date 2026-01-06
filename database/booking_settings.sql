-- Booking Settings Table
-- Run this in Supabase SQL Editor to enable saving booking settings

-- Create booking_settings table
CREATE TABLE IF NOT EXISTS booking_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    page_id TEXT NOT NULL UNIQUE,
    
    -- Availability settings
    available_days INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5], -- 0=Sun, 1=Mon, ..., 6=Sat
    start_time TIME DEFAULT '09:00',
    end_time TIME DEFAULT '17:00',
    slot_duration INTEGER DEFAULT 30, -- minutes
    max_advance_days INTEGER DEFAULT 30,
    
    -- Custom form fields (JSON array)
    custom_fields JSONB DEFAULT '[
        {"id": "name", "label": "Your Name", "type": "text", "required": true},
        {"id": "phone", "label": "Phone Number", "type": "tel", "required": true},
        {"id": "email", "label": "Email Address", "type": "email", "required": false},
        {"id": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
    ]'::jsonb,
    
    -- Legacy custom_form field
    custom_form JSONB DEFAULT '[]'::jsonb,
    
    -- Confirmation messages
    confirmation_message TEXT DEFAULT 'Your booking has been confirmed! We look forward to meeting with you.',
    messenger_prefill_message TEXT DEFAULT 'Hi! I just booked an appointment for {date} at {time}. Please confirm my booking. Thank you!',
    
    -- Redirect settings
    auto_redirect_enabled BOOLEAN DEFAULT true,
    auto_redirect_delay INTEGER DEFAULT 5,
    
    -- Reminder settings
    reminder_enabled BOOLEAN DEFAULT true,
    reminder_hours_before INTEGER DEFAULT 24,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for booking page to load settings)
CREATE POLICY "Public can read booking settings" ON booking_settings
    FOR SELECT TO anon, authenticated
    USING (true);

-- Allow authenticated users to insert/update
CREATE POLICY "Authenticated users can manage booking settings" ON booking_settings
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_booking_settings_page_id ON booking_settings(page_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_booking_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_settings_updated_at
    BEFORE UPDATE ON booking_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_booking_settings_updated_at();
