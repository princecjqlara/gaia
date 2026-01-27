-- Enable RLS on properties table
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public properties are viewable by everyone" ON properties;
DROP POLICY IF EXISTS "Enable insert for all users" ON properties;
DROP POLICY IF EXISTS "Enable update for all users" ON properties;
DROP POLICY IF EXISTS "Enable delete for all users" ON properties;
-- Also drop potential default names from previous attempts if any
DROP POLICY IF EXISTS "Enable read access for all users" ON properties;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON properties;
-- Allow public read access to properties
CREATE POLICY "Public properties are viewable by everyone" ON properties FOR
SELECT USING (true);
-- Allow insert for all users (including anon/public for now to unblock)
CREATE POLICY "Enable insert for all users" ON properties FOR
INSERT WITH CHECK (true);
-- Allow update for all users
CREATE POLICY "Enable update for all users" ON properties FOR
UPDATE USING (true);
-- Allow delete for all users
CREATE POLICY "Enable delete for all users" ON properties FOR DELETE USING (true);