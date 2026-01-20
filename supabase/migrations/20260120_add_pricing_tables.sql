DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pricing_trade') THEN
    CREATE TYPE pricing_trade AS ENUM ('plumbing', 'electrical', 'hvac', 'general_contractor');
  END IF;
END $$;

CREATE TABLE pricing_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trade pricing_trade NOT NULL,
  item_key TEXT NOT NULL,
  category TEXT,
  sku TEXT,
  unit TEXT,
  taxable BOOLEAN NOT NULL DEFAULT FALSE,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  aliases TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX pricing_materials_workspace_id_idx ON pricing_materials(workspace_id);
CREATE INDEX pricing_materials_trade_idx ON pricing_materials(trade);

ALTER TABLE pricing_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pricing materials"
  ON pricing_materials FOR SELECT
  USING (is_member_of(workspace_id));

CREATE POLICY "Admins can create pricing materials"
  ON pricing_materials FOR INSERT
  WITH CHECK (is_admin_of(workspace_id));

CREATE POLICY "Admins can update pricing materials"
  ON pricing_materials FOR UPDATE
  USING (is_admin_of(workspace_id));

CREATE POLICY "Admins can delete pricing materials"
  ON pricing_materials FOR DELETE
  USING (is_admin_of(workspace_id));

CREATE TRIGGER update_pricing_materials_updated_at BEFORE UPDATE ON pricing_materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE pricing_labor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trade pricing_trade NOT NULL,
  kind TEXT NOT NULL,
  item_key TEXT NOT NULL,
  sku TEXT,
  unit TEXT,
  rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
  taxable BOOLEAN NOT NULL DEFAULT FALSE,
  aliases TEXT,
  notes TEXT,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX pricing_labor_workspace_id_idx ON pricing_labor(workspace_id);
CREATE INDEX pricing_labor_trade_idx ON pricing_labor(trade);

ALTER TABLE pricing_labor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pricing labor"
  ON pricing_labor FOR SELECT
  USING (is_member_of(workspace_id));

CREATE POLICY "Admins can create pricing labor"
  ON pricing_labor FOR INSERT
  WITH CHECK (is_admin_of(workspace_id));

CREATE POLICY "Admins can update pricing labor"
  ON pricing_labor FOR UPDATE
  USING (is_admin_of(workspace_id));

CREATE POLICY "Admins can delete pricing labor"
  ON pricing_labor FOR DELETE
  USING (is_admin_of(workspace_id));

CREATE TRIGGER update_pricing_labor_updated_at BEFORE UPDATE ON pricing_labor
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
