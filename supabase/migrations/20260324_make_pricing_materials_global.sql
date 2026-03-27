-- pricing_materials is used as a global catalog (no workspace_id filter in search).
-- Drop the NOT NULL constraint so imports don't require a dummy workspace_id.
-- Wrapped in a guard in case the column is already nullable or does not exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'pricing_materials'
      AND column_name  = 'workspace_id'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.pricing_materials
      ALTER COLUMN workspace_id DROP NOT NULL;
  END IF;
END $$;
