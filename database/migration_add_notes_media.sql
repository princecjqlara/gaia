-- Migration: Add notes_media field to clients table
-- This allows storing media attachments (images, videos, documents) with client notes

-- Add notes_media column to store array of media file references
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS notes_media JSONB DEFAULT '[]';

-- The notes_media field will store an array of objects like:
-- [
--   {
--     "id": "unique-id",
--     "filename": "image.jpg",
--     "url": "https://...",
--     "type": "image/jpeg",
--     "size": 12345,
--     "uploadedAt": "2024-01-01T00:00:00Z"
--   }
-- ]

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_clients_notes_media ON clients USING GIN (notes_media);

