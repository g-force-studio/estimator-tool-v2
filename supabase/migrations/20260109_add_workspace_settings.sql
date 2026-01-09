CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  tax_rate_percent NUMERIC NOT NULL DEFAULT 0 CHECK (tax_rate_percent >= 0),
  markup_percent NUMERIC NOT NULL DEFAULT 0 CHECK (markup_percent >= 0),
  hourly_rate NUMERIC NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_workspace_settings_updated_at BEFORE UPDATE ON workspace_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view workspace settings" ON workspace_settings;
DROP POLICY IF EXISTS "Admins can create workspace settings" ON workspace_settings;
DROP POLICY IF EXISTS "Admins can update workspace settings" ON workspace_settings;

CREATE POLICY "Members can view workspace settings"
  ON workspace_settings FOR SELECT
  USING (is_member_of(workspace_id));

CREATE POLICY "Admins can create workspace settings"
  ON workspace_settings FOR INSERT
  WITH CHECK (is_admin_of(workspace_id));

CREATE POLICY "Admins can update workspace settings"
  ON workspace_settings FOR UPDATE
  USING (is_admin_of(workspace_id));

INSERT INTO workspace_settings (workspace_id)
SELECT id FROM workspaces
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_settings WHERE workspace_id = workspaces.id
);
