-- pricing_materials is used as a global catalog (no workspace_id filter in search).
-- Drop the NOT NULL constraint so imports don't require a dummy workspace_id.
ALTER TABLE public.pricing_materials
  ALTER COLUMN workspace_id DROP NOT NULL;
