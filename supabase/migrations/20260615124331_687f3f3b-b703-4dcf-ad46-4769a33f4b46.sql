
-- 1) org_invites table
CREATE TABLE public.org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.org_role NOT NULL DEFAULT 'member',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);
CREATE INDEX org_invites_org_idx ON public.org_invites(organization_id);
CREATE INDEX org_invites_token_idx ON public.org_invites(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invites TO authenticated;
GRANT ALL ON public.org_invites TO service_role;

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins view invites"
  ON public.org_invites FOR SELECT
  TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Org admins create invites"
  ON public.org_invites FOR INSERT
  TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Org admins delete invites"
  ON public.org_invites FOR DELETE
  TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

-- 2) preview & accept RPCs
CREATE OR REPLACE FUNCTION public.get_org_invite_preview(_token text)
RETURNS TABLE(organization_id uuid, organization_name text, email text, role public.org_role, expires_at timestamptz, accepted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.organization_id, o.name, i.email, i.role, i.expires_at, (i.accepted_at IS NOT NULL)
  FROM public.org_invites i
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE i.token = _token;
$$;

CREATE OR REPLACE FUNCTION public.accept_org_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite public.org_invites%ROWTYPE;
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.org_invites WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  IF v_invite.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invite already used'; END IF;
  IF v_invite.expires_at < now() THEN RAISE EXCEPTION 'Invite expired'; END IF;
  IF lower(v_invite.email) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'This invite is for a different email address';
  END IF;

  INSERT INTO public.organization_members(organization_id, user_id, role)
  VALUES (v_invite.organization_id, auth.uid(), v_invite.role)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.org_invites SET accepted_at = now() WHERE id = v_invite.id;
  RETURN v_invite.organization_id;
END;
$$;

-- 3) Patch accept_workspace_invite to also add user to the parent org
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite public.workspace_invites%ROWTYPE;
  v_user_email text;
  v_org uuid;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF v_user_email IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_invite FROM public.workspace_invites WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  IF v_invite.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invite already used'; END IF;
  IF v_invite.expires_at < now() THEN RAISE EXCEPTION 'Invite expired'; END IF;
  IF lower(v_invite.email) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'This invite is for a different email address';
  END IF;

  -- Ensure user is a member of the parent organization first
  SELECT organization_id INTO v_org FROM public.workspaces WHERE id = v_invite.workspace_id;
  IF v_org IS NOT NULL THEN
    INSERT INTO public.organization_members(organization_id, user_id, role)
    VALUES (v_org, auth.uid(), 'member')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (v_invite.workspace_id, auth.uid(), v_invite.role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.workspace_invites SET accepted_at = now() WHERE id = v_invite.id;
  RETURN v_invite.workspace_id;
END;
$$;
