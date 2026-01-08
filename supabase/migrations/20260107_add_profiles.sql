-- Create profiles table for user metadata accessible from public schema.
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow workspace members to view profiles of users in their workspace.
DROP POLICY IF EXISTS "Members can view workspace profiles" ON profiles;
CREATE POLICY "Members can view workspace profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members
      WHERE workspace_members.user_id = profiles.id
      AND workspace_members.workspace_id = current_workspace_id()
    )
  );

-- Backfill profiles from existing auth users.
INSERT INTO profiles (id, email)
SELECT id, email
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Keep profiles updated for new auth users.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Optional FK to enable PostgREST embedding from workspace_members -> profiles.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_members_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE workspace_members
      ADD CONSTRAINT workspace_members_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END;
$$;
