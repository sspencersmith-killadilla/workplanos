
-- ============================================================
-- 1) App-level roles
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE POLICY "user_roles self read"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "user_roles super_admin write"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- 2) Profile lockdown (global)
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_reason text;

-- ============================================================
-- 3) Workspace-member lockdown
-- ============================================================
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_reason text;

-- ============================================================
-- 4) Helper: is the user "active" in a workspace?
--    Returns false if globally locked OR workspace-locked.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_actor_active(_user uuid, _ws uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    NOT COALESCE((SELECT is_locked FROM public.profiles WHERE id = _user), false)
    AND NOT COALESCE(
      (SELECT is_locked FROM public.workspace_members
        WHERE user_id = _user AND workspace_id = _ws),
      false
    )
$$;
REVOKE EXECUTE ON FUNCTION public.is_actor_active(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 5) Hide data authored by locked users from other workspace members.
--    Locked user themselves and super_admins still see everything.
--    We add an additional restrictive layer by augmenting SELECT policies.
-- ============================================================

-- Items: hide if creator is locked (and viewer isn't creator/super_admin)
DROP POLICY IF EXISTS "items hide locked authors" ON public.items;
CREATE POLICY "items hide locked authors"
  ON public.items AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    created_by IS NULL
    OR created_by = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.is_actor_active(created_by, public.board_workspace(board_id))
  );

-- Comments: hide if author is locked
DROP POLICY IF EXISTS "comments hide locked authors" ON public.comments;
CREATE POLICY "comments hide locked authors"
  ON public.comments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.is_actor_active(author_id, public.item_workspace(item_id))
  );

-- Item files: hide if uploader is locked
DROP POLICY IF EXISTS "item_files hide locked uploaders" ON public.item_files;
CREATE POLICY "item_files hide locked uploaders"
  ON public.item_files AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    uploaded_by IS NULL
    OR uploaded_by = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.is_actor_active(uploaded_by, public.item_workspace(item_id))
  );

-- ============================================================
-- 6) Workspace admins/owners gain a policy to lock workspace members
-- ============================================================
DROP POLICY IF EXISTS "workspace_members admin lock" ON public.workspace_members;
CREATE POLICY "workspace_members admin lock"
  ON public.workspace_members FOR UPDATE TO authenticated
  USING (
    public.has_ws_role(workspace_id, auth.uid(),
                       ARRAY['owner'::workspace_role,'admin'::workspace_role])
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.has_ws_role(workspace_id, auth.uid(),
                       ARRAY['owner'::workspace_role,'admin'::workspace_role])
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- ============================================================
-- 7) Super-admin can read all profiles
-- ============================================================
DROP POLICY IF EXISTS "profiles super_admin read" ON public.profiles;
CREATE POLICY "profiles super_admin read"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "profiles super_admin update" ON public.profiles;
CREATE POLICY "profiles super_admin update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- 8) App settings (super-admin only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings super_admin only"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER app_settings_touch
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
