-- Add history learning settings to workspace_settings.
-- These control how many historical jobs are referenced and
-- for how long, and are configurable per workspace.
ALTER TABLE public.workspace_settings
  ADD COLUMN IF NOT EXISTS history_samples       INTEGER NOT NULL DEFAULT 3
                                                  CHECK (history_samples BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS history_window_months INTEGER NOT NULL DEFAULT 18
                                                  CHECK (history_window_months BETWEEN 1 AND 60),
  ADD COLUMN IF NOT EXISTS history_min_jobs      INTEGER NOT NULL DEFAULT 2
                                                  CHECK (history_min_jobs BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS history_max_per_type  INTEGER NOT NULL DEFAULT 100
                                                  CHECK (history_max_per_type BETWEEN 10 AND 500);


-- Persistent store for estimate actuals.
-- Intentionally has NO foreign-key to jobs — records survive job deletion.
-- workspace_id is the only cascade-delete reference.
CREATE TABLE IF NOT EXISTS public.estimate_actuals (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id                 UUID,                    -- nullable; no FK — survives job deletion
  job_type               TEXT        NOT NULL,    -- e.g. 'kitchen-remodel', 'flooring'
  trade                  TEXT        NOT NULL DEFAULT 'general_contractor',
  job_title              TEXT,
  job_description        TEXT,
  sqft_estimate          NUMERIC,
  estimated_materials    JSONB       NOT NULL DEFAULT '[]',
  actual_materials       JSONB,                   -- entered after job completion
  estimated_labor_hours  NUMERIC,
  actual_labor_hours     NUMERIC,
  exclude_from_history   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estimate_actuals_workspace_id_idx
  ON public.estimate_actuals(workspace_id);
CREATE INDEX IF NOT EXISTS estimate_actuals_job_id_idx
  ON public.estimate_actuals(job_id);
CREATE INDEX IF NOT EXISTS estimate_actuals_workspace_type_idx
  ON public.estimate_actuals(workspace_id, job_type, created_at DESC);

ALTER TABLE public.estimate_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view estimate actuals"
  ON public.estimate_actuals FOR SELECT
  USING (is_member_of(workspace_id));

CREATE POLICY "Service role can manage estimate actuals"
  ON public.estimate_actuals FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);


-- RPC: pull N recent non-excluded jobs for a given workspace + job_type.
-- Called by the estimate worker before the AI call.
CREATE OR REPLACE FUNCTION public.get_history_reference(
  p_workspace_id     UUID,
  p_job_type         TEXT,
  p_limit            INTEGER DEFAULT 3,
  p_window_months    INTEGER DEFAULT 18
)
RETURNS TABLE (
  job_type              TEXT,
  job_title             TEXT,
  sqft_estimate         NUMERIC,
  estimated_materials   JSONB,
  actual_materials      JSONB,
  estimated_labor_hours NUMERIC,
  actual_labor_hours    NUMERIC
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    job_type,
    job_title,
    sqft_estimate,
    estimated_materials,
    actual_materials,
    estimated_labor_hours,
    actual_labor_hours
  FROM public.estimate_actuals
  WHERE workspace_id  = p_workspace_id
    AND job_type      = p_job_type
    AND exclude_from_history = FALSE
    AND created_at    >= NOW() - make_interval(months => p_window_months)
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;


-- Trigger: enforce per-type cap after each insert.
-- Deletes the oldest rows beyond history_max_per_type for that workspace+type.
CREATE OR REPLACE FUNCTION public.enforce_estimate_actuals_cap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cap INTEGER;
BEGIN
  SELECT COALESCE(ws.history_max_per_type, 100) INTO v_cap
  FROM public.workspace_settings ws
  WHERE ws.workspace_id = NEW.workspace_id;

  IF v_cap IS NOT NULL THEN
    DELETE FROM public.estimate_actuals
    WHERE id IN (
      SELECT id FROM public.estimate_actuals
      WHERE workspace_id = NEW.workspace_id
        AND job_type     = NEW.job_type
      ORDER BY created_at DESC
      OFFSET v_cap
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_estimate_actuals_cap_trigger ON public.estimate_actuals;
CREATE TRIGGER enforce_estimate_actuals_cap_trigger
  AFTER INSERT ON public.estimate_actuals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_estimate_actuals_cap();
