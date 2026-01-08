-- One-time normalization for legacy job statuses.
-- Ensure the DB constraint allows the current status enum first.
ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_check CHECK (
    status IN (
      'draft',
      'ai_pending',
      'ai_ready',
      'pdf_pending',
      'complete',
      'ai_error',
      'pdf_error'
    )
  );

UPDATE jobs
SET status = 'ai_pending'
WHERE status = 'active';

-- Ensure jobs delete policy exists (RLS).
DROP POLICY IF EXISTS "Members can delete workspace jobs" ON jobs;
CREATE POLICY "Members can delete workspace jobs"
  ON jobs FOR DELETE
  USING (workspace_id = current_workspace_id());
