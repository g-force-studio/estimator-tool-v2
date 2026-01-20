-- AI outputs table
CREATE TABLE ai_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  ai_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ai_outputs_job_id_idx ON ai_outputs(job_id);
CREATE INDEX ai_outputs_created_at_idx ON ai_outputs(created_at DESC);

ALTER TABLE ai_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view ai outputs"
  ON ai_outputs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = ai_outputs.job_id
    AND jobs.workspace_id = current_workspace_id()
  ));

CREATE POLICY "Members can create ai outputs"
  ON ai_outputs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = ai_outputs.job_id
    AND jobs.workspace_id = current_workspace_id()
  ));
