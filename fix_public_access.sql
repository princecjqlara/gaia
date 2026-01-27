-- 1. PROPERTIES
-- Enable RLS
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
-- Drop existing policies
DROP POLICY IF EXISTS "Public properties are viewable by everyone" ON properties;
DROP POLICY IF EXISTS "Enable insert for all users" ON properties;
DROP POLICY IF EXISTS "Enable update for all users" ON properties;
DROP POLICY IF EXISTS "Enable delete for all users" ON properties;
-- Create permissive policies
CREATE POLICY "Public properties are viewable by everyone" ON properties FOR
SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON properties FOR
INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON properties FOR
UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON properties FOR DELETE USING (true);
-- 2. BOOKINGS
-- Enable RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
-- Drop existing policies
DROP POLICY IF EXISTS "Bookings insertable by all" ON bookings;
DROP POLICY IF EXISTS "Bookings viewable by authenticated" ON bookings;
DROP POLICY IF EXISTS "Bookings manageable by authenticated" ON bookings;
-- Allow public to create bookings
CREATE POLICY "Bookings insertable by all" ON bookings FOR
INSERT WITH CHECK (true);
-- Allow authenticated users (agents) to view/manage bookings
CREATE POLICY "Bookings viewable by authenticated" ON bookings FOR
SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Bookings manageable by authenticated" ON bookings FOR ALL USING (auth.role() = 'authenticated');
-- 3. BOOKING SETTINGS (If table exists)
DO $$ BEGIN IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'booking_settings'
) THEN
ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Booking settings viewable by all" ON booking_settings;
CREATE POLICY "Booking settings viewable by all" ON booking_settings FOR
SELECT USING (true);
END IF;
END $$;