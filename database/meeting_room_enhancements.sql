-- Meeting Room Enhancements Migration
-- Run this in Supabase SQL Editor

-- Add status column to room_participants for lobby system
ALTER TABLE room_participants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add index for faster lookup
CREATE INDEX IF NOT EXISTS idx_room_participants_status ON room_participants(room_id, status, is_active);

-- Update existing records to have 'active' status
UPDATE room_participants SET status = 'active' WHERE status IS NULL;

-- Add comment
COMMENT ON COLUMN room_participants.status IS 'Participant status: waiting, active, denied';
