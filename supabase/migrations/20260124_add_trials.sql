ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('active', 'trialing', 'inactive', 'canceled', 'past_due'));

CREATE TABLE IF NOT EXISTS trial_links (
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

CREATE INDEX IF NOT EXISTS trial_links_workspace_status_idx
  ON trial_links(workspace_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS trial_links_active_unique
  ON trial_links(workspace_id)
  WHERE status = 'active';

ALTER TABLE trial_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view trial links" ON trial_links;
CREATE POLICY "Admins can view trial links"
  ON trial_links FOR SELECT
  USING (is_admin_of(workspace_id));
