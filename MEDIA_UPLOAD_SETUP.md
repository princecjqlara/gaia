# Media Upload Setup Guide

This guide explains how to set up the media upload feature for client notes.

## Features Added

- Users can now upload images, videos, and documents in the "Additional Notes" section
- Media files are stored in Supabase Storage
- Media previews are shown in both the edit modal and view modal
- Files can be removed or opened in a new tab

## Setup Instructions

### 1. Run Database Migration

Run the migration SQL file to add the `notes_media` field to the clients table:

```sql
-- Run this in Supabase SQL Editor
-- File: database/migration_add_notes_media.sql
```

This adds a `notes_media` JSONB column to store media file references.

### 2. Create Storage Bucket

1. Go to your Supabase Dashboard
2. Navigate to **Storage**
3. Click **New Bucket**
4. Name: `client-media`
5. Set to **Public** (or configure RLS policies if you want private access)
6. Click **Create**

### 3. Set Up Storage Policies

Run the storage policies SQL file:

```sql
-- Run this in Supabase SQL Editor
-- File: database/setup_storage_bucket.sql
```

This creates policies that allow authenticated users to:
- View client media files
- Upload new files
- Update existing files
- Delete files

### 4. Verify Setup

1. Open the application
2. Edit or create a client
3. Go to the "Basic Info" tab
4. Scroll to the "Notes" section
5. You should see an "Upload Files" button
6. Try uploading an image or document

## File Structure

Media files are stored in Supabase Storage with the following structure:
```
client-media/
  └── client-notes/
      └── {clientId}/
          └── {timestamp}-{random}.{ext}
```

## Supported File Types

- Images: All image formats (JPEG, PNG, GIF, WebP, etc.)
- Videos: All video formats (MP4, MOV, AVI, etc.)
- Documents: PDF, DOC, DOCX, TXT

## File Size Limit

Maximum file size: **10MB per file**

## Media Data Structure

Each media item is stored as a JSON object in the `notes_media` array:

```json
{
  "id": "unique-id",
  "filename": "image.jpg",
  "url": "https://...",
  "path": "client-notes/{clientId}/file.jpg",
  "type": "image/jpeg",
  "size": 12345,
  "uploadedAt": "2024-01-01T00:00:00Z"
}
```

## Troubleshooting

### Files not uploading?

1. Check that the `client-media` bucket exists in Supabase Storage
2. Verify storage policies are set up correctly
3. Check browser console for errors
4. Ensure you're authenticated (logged in)

### Files not displaying?

1. Check that the bucket is set to **Public**
2. Verify the file URLs are accessible
3. Check browser console for CORS or access errors

### Need to migrate existing files?

If you have existing media files, you may need to:
1. Update file paths in the `notes_media` JSONB field
2. Ensure files are in the correct storage bucket location

## Notes

- Files uploaded for new clients (before saving) are stored in a temporary folder
- When the client is saved, files remain associated via the `notes_media` array
- Deleting a media item removes it from both the database and storage
- Media files are not automatically deleted when a client is deleted (you may want to add cleanup logic)

