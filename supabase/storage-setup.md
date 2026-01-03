# Supabase Storage Setup

## Private Buckets Configuration

RelayKit uses two private storage buckets for secure file storage:

### 1. job-assets Bucket

Stores job-related files (photos, documents, etc.)

**Path structure:** `{workspace_id}/{job_id}/{job_item_id}/{filename}`

**Setup in Supabase Dashboard:**

1. Go to Storage > Create bucket
2. Name: `job-assets`
3. **Make bucket private** (uncheck "Public bucket")
4. File size limit: 50MB (recommended)
5. Allowed MIME types: `image/*`, `application/pdf`, `application/*`

**RLS Policies:**

```sql
-- Allow authenticated users to upload to their workspace
CREATE POLICY "Users can upload job assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job-assets' AND
  (storage.foldername(name))[1] IN (
    SELECT workspace_id::text FROM workspace_members WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to read their workspace assets
CREATE POLICY "Users can read job assets"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'job-assets' AND
  (storage.foldername(name))[1] IN (
    SELECT workspace_id::text FROM workspace_members WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to delete their workspace assets
CREATE POLICY "Users can delete job assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-assets' AND
  (storage.foldername(name))[1] IN (
    SELECT workspace_id::text FROM workspace_members WHERE user_id = auth.uid()
  )
);
```

### 2. workspace-logos Bucket

Stores workspace branding logos

**Path structure:** `{workspace_id}/logo/{filename}`

**Setup in Supabase Dashboard:**

1. Go to Storage > Create bucket
2. Name: `workspace-logos`
3. **Make bucket private** (uncheck "Public bucket")
4. File size limit: 5MB (recommended)
5. Allowed MIME types: `image/png`, `image/jpeg`, `image/svg+xml`, `image/webp`

**RLS Policies:**

```sql
-- Allow admins to upload workspace logos
CREATE POLICY "Admins can upload workspace logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'workspace-logos' AND
  (storage.foldername(name))[1] IN (
    SELECT workspace_id::text 
    FROM workspace_members 
    WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
  )
);

-- Allow authenticated users to read workspace logos
CREATE POLICY "Users can read workspace logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'workspace-logos' AND
  (storage.foldername(name))[1] IN (
    SELECT workspace_id::text FROM workspace_members WHERE user_id = auth.uid()
  )
);

-- Allow admins to delete workspace logos
CREATE POLICY "Admins can delete workspace logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'workspace-logos' AND
  (storage.foldername(name))[1] IN (
    SELECT workspace_id::text 
    FROM workspace_members 
    WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
  )
);
```

## Signed URLs

Since both buckets are private, all file access must use signed URLs generated server-side.

**TTL Configuration:**
- Default: 3600 seconds (1 hour)
- Configurable via `SIGNED_URL_TTL_SECONDS` environment variable
- Referenced centrally in `lib/config.ts`

**Automatic Regeneration:**
- Client detects expired URLs (403 errors)
- Automatically re-fetches signed URLs from `/api/packages/[slug]/assets`
- Proactive refresh within 5 minutes of expiry (optional)

## Quick Setup Commands

Run these SQL commands in your Supabase SQL Editor after creating the buckets:

```sql
-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Then add the policies above for each bucket
```

## Verification

Test your storage setup:

1. Create a workspace
2. Upload a logo in Settings > Branding
3. Create a job and attach a photo
4. Generate a package and verify images load with signed URLs
5. Wait for URL expiry and verify automatic regeneration

## Troubleshooting

**Issue:** Files not uploading
- Check bucket exists and is private
- Verify RLS policies are applied
- Check user is authenticated and in a workspace

**Issue:** Images not loading in packages
- Verify signed URL generation in `/api/packages/[slug]/assets`
- Check `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Ensure TTL is reasonable (not too short)

**Issue:** 403 errors on images
- Normal if URL expired - client should auto-regenerate
- Check browser console for regeneration attempts
- Verify service role key has storage access
