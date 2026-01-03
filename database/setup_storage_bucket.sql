-- Setup Supabase Storage Bucket for Client Media
-- Run this in Supabase SQL Editor to create the storage bucket and policies

-- Create the storage bucket (if it doesn't exist)
-- Note: You may need to create this bucket manually in Supabase Dashboard -> Storage
-- This SQL will set up the policies for the bucket

-- Insert bucket configuration (if bucket doesn't exist, create it via Dashboard first)
-- Go to: Supabase Dashboard -> Storage -> New Bucket
-- Name: client-media
-- Public: Yes (or set up RLS policies if you want private)

-- Storage Policies for client-media bucket
-- These policies allow authenticated users to upload, read, and delete files

-- Allow authenticated users to read files
CREATE POLICY "Authenticated users can view client media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'client-media' AND
  auth.role() = 'authenticated'
);

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload client media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-media' AND
  auth.role() = 'authenticated'
);

-- Allow authenticated users to update files
CREATE POLICY "Authenticated users can update client media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'client-media' AND
  auth.role() = 'authenticated'
);

-- Allow authenticated users to delete files
CREATE POLICY "Authenticated users can delete client media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'client-media' AND
  auth.role() = 'authenticated'
);

-- Note: After running this SQL, you still need to:
-- 1. Go to Supabase Dashboard -> Storage
-- 2. Create a new bucket named "client-media"
-- 3. Set it to Public (or configure RLS as needed)
-- 4. The policies above will then apply to that bucket

