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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'delivered', 'archived')) DEFAULT 'draft',
  due_date DATE,
  client_name TEXT,
  description_md TEXT,
  template_id UUID REFERENCES templates(id),
  totals_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX jobs_workspace_id_idx ON jobs(workspace_id);
CREATE INDEX jobs_status_idx ON jobs(status);
CREATE INDEX jobs_updated_at_idx ON jobs(updated_at DESC);

-- Job items table
CREATE TABLE job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text', 'link', 'file', 'checklist')),
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
  name TEXT NOT NULL,
  config_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ai_reference_configs_workspace_id_idx ON ai_reference_configs(workspace_id);

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

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_items_updated_at BEFORE UPDATE ON job_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_reference_configs_updated_at BEFORE UPDATE ON ai_reference_configs
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
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_reference_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_catalog ENABLE ROW LEVEL SECURITY;

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
    AND jobs.workspace_id = current_workspace_id()
  ));

CREATE POLICY "Members can create job items"
  ON job_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs 
    WHERE jobs.id = job_items.job_id 
    AND jobs.workspace_id = current_workspace_id()
  ));

CREATE POLICY "Members can update job items"
  ON job_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM jobs 
    WHERE jobs.id = job_items.job_id 
    AND jobs.workspace_id = current_workspace_id()
  ));

CREATE POLICY "Members can delete job items"
  ON job_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM jobs 
    WHERE jobs.id = job_items.job_id 
    AND jobs.workspace_id = current_workspace_id()
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

CREATE POLICY "Members can delete workspace packages"
  ON packages FOR DELETE
  USING (workspace_id = current_workspace_id());

-- AI reference configs policies
CREATE POLICY "Members can view workspace AI configs"
  ON ai_reference_configs FOR SELECT
  USING (workspace_id = current_workspace_id());

CREATE POLICY "Admins can create AI configs"
  ON ai_reference_configs FOR INSERT
  WITH CHECK (is_admin_of(workspace_id));

CREATE POLICY "Admins can update AI configs"
  ON ai_reference_configs FOR UPDATE
  USING (is_admin_of(workspace_id));

CREATE POLICY "Admins can delete AI configs"
  ON ai_reference_configs FOR DELETE
  USING (is_admin_of(workspace_id));

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
