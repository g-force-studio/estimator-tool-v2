DROP POLICY IF EXISTS "Members can view job items" ON job_items;
DROP POLICY IF EXISTS "Members can create job items" ON job_items;
DROP POLICY IF EXISTS "Members can update job items" ON job_items;
DROP POLICY IF EXISTS "Members can delete job items" ON job_items;

CREATE POLICY "Members can view job items"
  ON job_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_items.job_id
      AND is_member_of(jobs.workspace_id)
  ));

CREATE POLICY "Members can create job items"
  ON job_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_items.job_id
      AND is_member_of(jobs.workspace_id)
  ));

CREATE POLICY "Members can update job items"
  ON job_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_items.job_id
      AND is_member_of(jobs.workspace_id)
  ));

CREATE POLICY "Members can delete job items"
  ON job_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_items.job_id
      AND is_member_of(jobs.workspace_id)
  ));
