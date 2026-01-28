-- RelayKit Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Workspaces table
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trade TEXT NOT NULL DEFAULT 'general_contractor'
    CHECK (trade IN ('plumbing', 'electrical', 'hvac', 'general_contractor')),
  subscription_status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('active', 'trialing', 'inactive', 'canceled', 'past_due')),
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace members table (enforces one workspace per user)
CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- CRITICAL: Enforce one workspace per user
CREATE UNIQUE INDEX workspace_members_user_id_unique ON workspace_members(user_id);

-- Workspace brand table
CREATE TABLE workspace_brand (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  accent_color TEXT,
  logo_bucket TEXT,
  logo_path TEXT,
  labor_rate NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace settings table
CREATE TABLE workspace_settings (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  tax_rate_percent NUMERIC NOT NULL DEFAULT 0 CHECK (tax_rate_percent >= 0),
  markup_percent NUMERIC NOT NULL DEFAULT 0 CHECK (markup_percent >= 0),
  hourly_rate NUMERIC NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customers table (workspace-scoped)
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX customers_workspace_idx ON customers(workspace_id);

-- Workspace invites table
CREATE TABLE workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  token_hash TEXT UNIQUE NOT NULL,
  invited_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES auth.users(id)
);

-- Prevent multiple active invites for same workspace+email
CREATE UNIQUE INDEX workspace_invites_active_unique 
ON workspace_invites(workspace_id, email) 
WHERE accepted_at IS NULL AND expires_at > NOW();

-- Trial links table
CREATE TABLE trial_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'redeemed', 'expired', 'revoked')),
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  redeemed_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ
);

CREATE INDEX trial_links_workspace_status_idx
  ON trial_links(workspace_id, status);

CREATE UNIQUE INDEX trial_links_active_unique
  ON trial_links(workspace_id)
  WHERE status = 'active';

-- Jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'draft',
    'ai_pending',
    'ai_ready',
    'pdf_pending',
    'complete',
    'ai_error',
    'pdf_error'
  )) DEFAULT 'draft',
  due_date DATE,
  client_name TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  description_md TEXT,
  template_id UUID REFERENCES templates(id),
  labor_rate NUMERIC,
  totals_json JSONB,
  pdf_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX jobs_workspace_id_idx ON jobs(workspace_id);
CREATE INDEX jobs_status_idx ON jobs(status);
CREATE INDEX jobs_updated_at_idx ON jobs(updated_at DESC);

-- Job inputs table
CREATE TABLE job_inputs (
  job_id UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  raw_input_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI outputs table
CREATE TABLE ai_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  ai_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ai_outputs_job_id_idx ON ai_outputs(job_id);
CREATE INDEX ai_outputs_created_at_idx ON ai_outputs(created_at DESC);

-- Job files table
CREATE TABLE job_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pdf', 'image')),
  storage_path TEXT NOT NULL,
  public_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX job_files_job_id_idx ON job_files(job_id);
CREATE INDEX job_files_kind_idx ON job_files(kind);

-- Job items table
CREATE TABLE job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text', 'link', 'file', 'checklist', 'line_item')),
  title TEXT NOT NULL,
  content_json JSONB NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX job_items_job_id_idx ON job_items(job_id);
CREATE INDEX job_items_order_idx ON job_items(job_id, order_index);

-- Templates table
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  template_items_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX templates_workspace_id_idx ON templates(workspace_id);

-- Packages table
CREATE TABLE packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  public_slug TEXT UNIQUE NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  brand_header_json JSONB NOT NULL,
  snapshot_json JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX packages_job_id_idx ON packages(job_id);
CREATE INDEX packages_workspace_id_idx ON packages(workspace_id);
CREATE INDEX packages_slug_idx ON packages(public_slug);

-- AI reference configs table
CREATE TABLE ai_reference_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  trade TEXT NOT NULL CHECK (trade IN ('plumbing', 'electrical', 'hvac', 'general_contractor')),
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ai_reference_configs_workspace_id_idx ON ai_reference_configs(workspace_id);
CREATE INDEX ai_reference_configs_workspace_trade_idx ON ai_reference_configs(workspace_id, trade);
CREATE UNIQUE INDEX ai_reference_configs_workspace_customer_unique
  ON ai_reference_configs(workspace_id, customer_id);
CREATE UNIQUE INDEX ai_reference_configs_one_default_per_workspace
  ON ai_reference_configs(workspace_id)
  WHERE is_default = TRUE;

ALTER TABLE workspaces
  ADD COLUMN default_ai_reference_config_id UUID REFERENCES ai_reference_configs(id);

-- Prompt templates table
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade TEXT NOT NULL CHECK (trade IN ('plumbing', 'electrical', 'hvac', 'general_contractor')),
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX prompt_templates_trade_name_version_unique
  ON prompt_templates(trade, name, version);

-- Template catalog table
CREATE TABLE template_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  summary TEXT,
  template_id UUID REFERENCES templates(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX template_catalog_workspace_id_idx ON template_catalog(workspace_id);

-- Workspace pricing materials table (custom + customer overrides)
CREATE TABLE workspace_pricing_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  trade TEXT NOT NULL CHECK (trade IN ('plumbing', 'electrical', 'hvac', 'general_contractor')),
  description TEXT NOT NULL,
  normalized_key TEXT NOT NULL,
  unit TEXT,
  unit_cost NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload',
  source_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX workspace_pricing_materials_workspace_idx ON workspace_pricing_materials(workspace_id);
CREATE INDEX workspace_pricing_materials_customer_idx ON workspace_pricing_materials(customer_id);
CREATE INDEX workspace_pricing_materials_norm_idx ON workspace_pricing_materials(workspace_id, trade, normalized_key);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get current user's workspace ID
CREATE OR REPLACE FUNCTION current_workspace_id()
RETURNS UUID AS $$
  SELECT workspace_id
  FROM workspace_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Check if user is member of workspace
CREATE OR REPLACE FUNCTION is_member_of(workspace_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM workspace_members 
    WHERE workspace_members.workspace_id = is_member_of.workspace_id 
    AND user_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Check if user is admin of workspace
CREATE OR REPLACE FUNCTION is_admin_of(workspace_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM workspace_members 
    WHERE workspace_members.workspace_id = is_admin_of.workspace_id 
    AND user_id = auth.uid()
    AND role IN ('admin', 'owner')
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workspace_brand_updated_at BEFORE UPDATE ON workspace_brand
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspace_settings_updated_at BEFORE UPDATE ON workspace_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_items_updated_at BEFORE UPDATE ON job_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_reference_configs_updated_at BEFORE UPDATE ON ai_reference_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspace_pricing_materials_updated_at BEFORE UPDATE ON workspace_pricing_materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_template_catalog_updated_at BEFORE UPDATE ON template_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_brand ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_reference_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_pricing_materials ENABLE ROW LEVEL SECURITY;

-- Workspaces policies
CREATE POLICY "Users can view their workspace"
  ON workspaces FOR SELECT
  USING (id = current_workspace_id());

CREATE POLICY "Authenticated users can create workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update their workspace"
  ON workspaces FOR UPDATE
  USING (is_admin_of(id));

-- Workspace members policies
CREATE POLICY "Members can view workspace members"
  ON workspace_members FOR SELECT
  USING (workspace_id = current_workspace_id());

CREATE POLICY "Admins can insert workspace members"
  ON workspace_members FOR INSERT
  WITH CHECK (is_admin_of(workspace_id));

CREATE POLICY "Admins can update workspace members"
  ON workspace_members FOR UPDATE
  USING (is_admin_of(workspace_id));

CREATE POLICY "Admins can delete workspace members"
  ON workspace_members FOR DELETE
  USING (is_admin_of(workspace_id));

-- Workspace brand policies
CREATE POLICY "Members can view workspace brand"
  ON workspace_brand FOR SELECT
  USING (workspace_id = current_workspace_id());

CREATE POLICY "Admins can insert workspace brand"
  ON workspace_brand FOR INSERT
  WITH CHECK (is_admin_of(workspace_id));

CREATE POLICY "Admins can update workspace brand"
  ON workspace_brand FOR UPDATE
  USING (is_admin_of(workspace_id));

-- Workspace settings policies
CREATE POLICY "Members can view workspace settings"
  ON workspace_settings FOR SELECT
  USING (is_member_of(workspace_id));

CREATE POLICY "Admins can create workspace settings"
  ON workspace_settings FOR INSERT
  WITH CHECK (is_admin_of(workspace_id));

CREATE POLICY "Admins can update workspace settings"
  ON workspace_settings FOR UPDATE
  USING (is_admin_of(workspace_id));

-- Customers policies
CREATE POLICY "Members can view customers"
  ON customers FOR SELECT
  USING (is_member_of(workspace_id));

CREATE POLICY "Members can create customers"
  ON customers FOR INSERT
  WITH CHECK (is_member_of(workspace_id));

CREATE POLICY "Members can update customers"
  ON customers FOR UPDATE
  USING (is_member_of(workspace_id));

CREATE POLICY "Members can delete customers"
  ON customers FOR DELETE
  USING (is_member_of(workspace_id));

-- Workspace invites policies
CREATE POLICY "Admins can view workspace invites"
  ON workspace_invites FOR SELECT
  USING (is_admin_of(workspace_id));

CREATE POLICY "Admins can create workspace invites"
  ON workspace_invites FOR INSERT
  WITH CHECK (is_admin_of(workspace_id));

CREATE POLICY "Admins can update workspace invites"
  ON workspace_invites FOR UPDATE
  USING (is_admin_of(workspace_id));

CREATE POLICY "Admins can delete workspace invites"
  ON workspace_invites FOR DELETE
  USING (is_admin_of(workspace_id));

-- Trial links policies
CREATE POLICY "Admins can view trial links"
  ON trial_links FOR SELECT
  USING (is_admin_of(workspace_id));

-- Jobs policies
CREATE POLICY "Members can view workspace jobs"
  ON jobs FOR SELECT
  USING (workspace_id = current_workspace_id());

CREATE POLICY "Members can create jobs"
  ON jobs FOR INSERT
  WITH CHECK (workspace_id = current_workspace_id());

CREATE POLICY "Members can update workspace jobs"
  ON jobs FOR UPDATE
  USING (workspace_id = current_workspace_id());

CREATE POLICY "Members can delete workspace jobs"
  ON jobs FOR DELETE
  USING (workspace_id = current_workspace_id());

-- Job items policies
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

-- Templates policies
CREATE POLICY "Members can view workspace templates"
  ON templates FOR SELECT
  USING (workspace_id = current_workspace_id());

CREATE POLICY "Members can create templates"
  ON templates FOR INSERT
  WITH CHECK (workspace_id = current_workspace_id());

CREATE POLICY "Members can update workspace templates"
  ON templates FOR UPDATE
  USING (workspace_id = current_workspace_id());

CREATE POLICY "Members can delete workspace templates"
  ON templates FOR DELETE
  USING (workspace_id = current_workspace_id());

-- Packages policies
CREATE POLICY "Members can view workspace packages"
  ON packages FOR SELECT
  USING (workspace_id = current_workspace_id());

CREATE POLICY "Public can view public packages"
  ON packages FOR SELECT
  USING (is_public = TRUE);

CREATE POLICY "Members can create packages"
  ON packages FOR INSERT
  WITH CHECK (workspace_id = current_workspace_id());

CREATE POLICY "Members can update workspace packages"
  ON packages FOR UPDATE
  USING (workspace_id = current_workspace_id());

-- Job inputs policies
CREATE POLICY "Members can view job inputs"
  ON job_inputs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_inputs.job_id
    AND jobs.workspace_id = current_workspace_id()
  ));

CREATE POLICY "Members can create job inputs"
  ON job_inputs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_inputs.job_id
    AND jobs.workspace_id = current_workspace_id()
  ));

CREATE POLICY "Members can update job inputs"
  ON job_inputs FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_inputs.job_id
    AND jobs.workspace_id = current_workspace_id()
  ));

-- AI outputs policies
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

-- Job files policies
CREATE POLICY "Members can view job files"
  ON job_files FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_files.job_id
    AND jobs.workspace_id = current_workspace_id()
  ));

CREATE POLICY "Members can create job files"
  ON job_files FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_files.job_id
    AND jobs.workspace_id = current_workspace_id()
  ));

CREATE POLICY "Members can delete workspace packages"
  ON packages FOR DELETE
  USING (workspace_id = current_workspace_id());

-- AI reference configs policies
CREATE POLICY "Members can view AI reference configs"
  ON ai_reference_configs FOR SELECT
  USING (is_member_of(workspace_id));

CREATE POLICY "Service role can insert AI reference configs"
  ON ai_reference_configs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can update AI reference configs"
  ON ai_reference_configs FOR UPDATE
  USING (is_admin_of(workspace_id));

-- Workspace pricing materials policies
CREATE POLICY "Members can view workspace pricing materials"
  ON workspace_pricing_materials FOR SELECT
  USING (is_member_of(workspace_id));

CREATE POLICY "Members can create workspace pricing materials"
  ON workspace_pricing_materials FOR INSERT
  WITH CHECK (is_member_of(workspace_id));

CREATE POLICY "Members can update workspace pricing materials"
  ON workspace_pricing_materials FOR UPDATE
  USING (is_member_of(workspace_id));

CREATE POLICY "Members can delete workspace pricing materials"
  ON workspace_pricing_materials FOR DELETE
  USING (is_member_of(workspace_id));

-- Prompt templates policies
CREATE POLICY "Authenticated users can view prompt templates"
  ON prompt_templates FOR SELECT
  USING (auth.role() = 'authenticated');

-- Template catalog policies
CREATE POLICY "Members can view workspace template catalog"
  ON template_catalog FOR SELECT
  USING (workspace_id = current_workspace_id());

CREATE POLICY "Members can create template catalog entries"
  ON template_catalog FOR INSERT
  WITH CHECK (workspace_id = current_workspace_id());

CREATE POLICY "Members can update template catalog entries"
  ON template_catalog FOR UPDATE
  USING (workspace_id = current_workspace_id());

CREATE POLICY "Members can delete template catalog entries"
  ON template_catalog FOR DELETE
  USING (workspace_id = current_workspace_id());
