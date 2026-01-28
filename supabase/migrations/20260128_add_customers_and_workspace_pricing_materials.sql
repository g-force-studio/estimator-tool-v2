-- Customers table (workspace-scoped)
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_workspace_idx ON public.customers(workspace_id);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select"
  ON public.customers FOR SELECT
  USING (is_member_of(workspace_id));

CREATE POLICY "customers_insert"
  ON public.customers FOR INSERT
  WITH CHECK (is_member_of(workspace_id));

CREATE POLICY "customers_update"
  ON public.customers FOR UPDATE
  USING (is_member_of(workspace_id))
  WITH CHECK (is_member_of(workspace_id));

CREATE POLICY "customers_delete"
  ON public.customers FOR DELETE
  USING (is_member_of(workspace_id));

-- Jobs: optional customer reference
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL;

-- Workspace-specific pricing materials (optional customer overrides)
CREATE TABLE IF NOT EXISTS public.workspace_pricing_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  customer_id UUID NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  trade TEXT NOT NULL,
  description TEXT NOT NULL,
  normalized_key TEXT NOT NULL,
  unit TEXT NULL,
  unit_cost NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload',
  source_job_id UUID NULL REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workspace_pricing_materials_workspace_idx
  ON public.workspace_pricing_materials(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_pricing_materials_customer_idx
  ON public.workspace_pricing_materials(customer_id);
CREATE INDEX IF NOT EXISTS workspace_pricing_materials_norm_idx
  ON public.workspace_pricing_materials(workspace_id, trade, normalized_key);

ALTER TABLE public.workspace_pricing_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_pricing_materials_select"
  ON public.workspace_pricing_materials FOR SELECT
  USING (is_member_of(workspace_id));

CREATE POLICY "workspace_pricing_materials_insert"
  ON public.workspace_pricing_materials FOR INSERT
  WITH CHECK (is_member_of(workspace_id));

CREATE POLICY "workspace_pricing_materials_update"
  ON public.workspace_pricing_materials FOR UPDATE
  USING (is_member_of(workspace_id))
  WITH CHECK (is_member_of(workspace_id));

CREATE POLICY "workspace_pricing_materials_delete"
  ON public.workspace_pricing_materials FOR DELETE
  USING (is_member_of(workspace_id));

-- AI reference configs: optional customer override
ALTER TABLE public.ai_reference_configs
  ADD COLUMN IF NOT EXISTS customer_id UUID NULL REFERENCES public.customers(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS ai_reference_configs_workspace_customer_unique
  ON public.ai_reference_configs(workspace_id, customer_id);

-- updated_at triggers
DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workspace_pricing_materials_updated_at ON public.workspace_pricing_materials;
CREATE TRIGGER update_workspace_pricing_materials_updated_at
  BEFORE UPDATE ON public.workspace_pricing_materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
