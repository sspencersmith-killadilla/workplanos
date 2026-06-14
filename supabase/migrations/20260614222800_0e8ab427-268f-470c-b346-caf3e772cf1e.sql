
-- ===== ENUMS =====
CREATE TYPE public.org_role AS ENUM ('owner','admin','billing','member');
CREATE TYPE public.department_request_status AS ENUM ('pending','approved','rejected','cancelled');
CREATE TYPE public.board_share_access AS ENUM ('view','edit');

-- ===== ORGANIZATIONS =====
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  primary_domain text,
  logo_url text,
  color text NOT NULL DEFAULT '#6366f1',
  plan text NOT NULL DEFAULT 'free',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER organizations_touch BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== ORG MEMBERS =====
CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX organization_members_user_idx ON public.organization_members(user_id);

-- ===== ORG DOMAINS =====
CREATE TABLE public.org_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_domains TO authenticated;
GRANT ALL ON public.org_domains TO service_role;
ALTER TABLE public.org_domains ENABLE ROW LEVEL SECURITY;

-- ===== DEPARTMENT REQUESTS =====
CREATE TABLE public.department_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  reason text,
  status public.department_request_status NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_requests TO authenticated;
GRANT ALL ON public.department_requests TO service_role;
ALTER TABLE public.department_requests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER department_requests_touch BEFORE UPDATE ON public.department_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== BOARD SHARES =====
CREATE TABLE public.board_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  shared_with_workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  access public.board_share_access NOT NULL DEFAULT 'view',
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, shared_with_workspace_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_shares TO authenticated;
GRANT ALL ON public.board_shares TO service_role;
ALTER TABLE public.board_shares ENABLE ROW LEVEL SECURITY;
CREATE INDEX board_shares_target_idx ON public.board_shares(shared_with_workspace_id);
CREATE INDEX board_shares_board_idx ON public.board_shares(board_id);

-- ===== AUDIT LOG =====
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX audit_log_org_idx ON public.audit_log(organization_id, created_at DESC);

-- ===== ADD organization_id TO workspaces =====
ALTER TABLE public.workspaces ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ===== HELPERS =====
CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _org AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _user uuid, _roles public.org_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = _user AND role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.org_for_workspace(_ws uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.workspaces WHERE id = _ws;
$$;

CREATE OR REPLACE FUNCTION public.has_board_share(_board uuid, _user uuid, _min_access public.board_share_access)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.board_shares bs
    JOIN public.workspace_members wm ON wm.workspace_id = bs.shared_with_workspace_id
    WHERE bs.board_id = _board
      AND wm.user_id = _user
      AND (_min_access = 'view' OR bs.access = 'edit')
  );
$$;

-- ===== BACKFILL =====
DO $$
DECLARE
  r RECORD;
  new_org_id uuid;
  owner_name text;
  owner_email text;
  base_slug text;
  final_slug text;
  n int;
BEGIN
  FOR r IN
    SELECT DISTINCT owner_id FROM public.workspaces WHERE organization_id IS NULL
  LOOP
    SELECT COALESCE(full_name, split_part(email,'@',1), 'Owner'), email
      INTO owner_name, owner_email
      FROM public.profiles WHERE id = r.owner_id;
    IF owner_name IS NULL THEN owner_name := 'Owner'; END IF;

    base_slug := regexp_replace(lower(owner_name) || '-org', '[^a-z0-9]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '(^-|-$)', '', 'g');
    IF base_slug = '' THEN base_slug := 'org'; END IF;
    final_slug := base_slug;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = final_slug) LOOP
      n := n + 1;
      final_slug := base_slug || '-' || n::text;
    END LOOP;

    INSERT INTO public.organizations (name, slug, created_by, primary_domain)
    VALUES (
      owner_name || '''s Organization',
      final_slug,
      r.owner_id,
      CASE WHEN owner_email IS NOT NULL THEN split_part(owner_email,'@',2) END
    )
    RETURNING id INTO new_org_id;

    UPDATE public.workspaces SET organization_id = new_org_id WHERE owner_id = r.owner_id;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (new_org_id, r.owner_id, 'owner')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    SELECT DISTINCT new_org_id, wm.user_id, 'member'::public.org_role
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE w.organization_id = new_org_id AND wm.user_id <> r.owner_id
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

ALTER TABLE public.workspaces ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX workspaces_org_idx ON public.workspaces(organization_id);

-- ===== POLICIES =====
CREATE POLICY "orgs select members" ON public.organizations
FOR SELECT TO authenticated
USING (public.is_org_member(id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "orgs insert super_admin" ON public.organizations
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "orgs update admins" ON public.organizations
FOR UPDATE TO authenticated
USING (public.has_org_role(id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
WITH CHECK (public.has_org_role(id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "orgs delete owner" ON public.organizations
FOR DELETE TO authenticated
USING (public.has_org_role(id, auth.uid(), ARRAY['owner']::public.org_role[]));

CREATE POLICY "org members select co-members" ON public.organization_members
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "org members insert admins" ON public.organization_members
FOR INSERT TO authenticated
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "org members update admins" ON public.organization_members
FOR UPDATE TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "org members delete admins or self" ON public.organization_members
FOR DELETE TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  OR user_id = auth.uid()
);

CREATE POLICY "org domains select members" ON public.org_domains
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "org domains write admins" ON public.org_domains
FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "dept reqs select members" ON public.department_requests
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "dept reqs insert members" ON public.department_requests
FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND public.is_org_member(organization_id, auth.uid())
);

CREATE POLICY "dept reqs update admins or self-cancel" ON public.department_requests
FOR UPDATE TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  OR requested_by = auth.uid()
)
WITH CHECK (
  public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  OR requested_by = auth.uid()
);

CREATE POLICY "board shares select" ON public.board_shares
FOR SELECT TO authenticated
USING (
  public.is_member(public.board_workspace(board_id), auth.uid())
  OR public.is_member(shared_with_workspace_id, auth.uid())
);

CREATE POLICY "board shares write src admins" ON public.board_shares
FOR ALL TO authenticated
USING (
  public.has_ws_role(public.board_workspace(board_id), auth.uid(), ARRAY['owner','admin']::workspace_role[])
  AND public.org_for_workspace(public.board_workspace(board_id)) = public.org_for_workspace(shared_with_workspace_id)
)
WITH CHECK (
  public.has_ws_role(public.board_workspace(board_id), auth.uid(), ARRAY['owner','admin']::workspace_role[])
  AND public.org_for_workspace(public.board_workspace(board_id)) = public.org_for_workspace(shared_with_workspace_id)
);

CREATE POLICY "audit select admins" ON public.audit_log
FOR SELECT TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "audit insert members" ON public.audit_log
FOR INSERT TO authenticated
WITH CHECK (public.is_org_member(organization_id, auth.uid()));

-- ===== TIGHTEN WORKSPACE CREATION =====
DROP POLICY IF EXISTS "ws insert by signed-in" ON public.workspaces;
CREATE POLICY "ws insert by org admins" ON public.workspaces
FOR INSERT TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
);

DROP POLICY IF EXISTS "ws select for members or owner" ON public.workspaces;
CREATE POLICY "ws select org members" ON public.workspaces
FOR SELECT TO authenticated
USING (
  public.is_org_member(organization_id, auth.uid())
  AND (owner_id = auth.uid() OR public.is_member(id, auth.uid()))
);

CREATE POLICY "boards select via share" ON public.boards
FOR SELECT TO authenticated
USING (public.has_board_share(id, auth.uid(), 'view'));

-- ===== AUTO-JOIN ON SIGNUP =====
CREATE OR REPLACE FUNCTION public.auto_join_org_by_domain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_domain text;
  v_org uuid;
BEGIN
  v_domain := lower(split_part(NEW.email, '@', 2));
  IF v_domain = '' THEN RETURN NEW; END IF;

  SELECT organization_id INTO v_org
  FROM public.org_domains
  WHERE lower(domain) = v_domain AND verified_at IS NOT NULL
  LIMIT 1;

  IF v_org IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org, NEW.id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_auto_join_org
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auto_join_org_by_domain();
