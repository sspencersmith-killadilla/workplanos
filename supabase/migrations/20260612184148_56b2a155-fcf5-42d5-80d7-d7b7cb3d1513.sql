
-- Phase 10: Workspace invites
CREATE TABLE public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invites TO authenticated;
GRANT ALL ON public.workspace_invites TO service_role;

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- Workspace admins/owners can see, create, delete invites for their workspace
CREATE POLICY "ws admins manage invites"
  ON public.workspace_invites
  FOR ALL
  TO authenticated
  USING (public.has_ws_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
  WITH CHECK (public.has_ws_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

-- Invitees can read their own invite by matching email (used by accept flow via security definer fn instead, but allow read for convenience)
CREATE POLICY "invitees can read own invite"
  ON public.workspace_invites
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(coalesce((auth.jwt() ->> 'email')::text, '')));

CREATE INDEX workspace_invites_workspace_idx ON public.workspace_invites(workspace_id);
CREATE INDEX workspace_invites_email_idx ON public.workspace_invites(lower(email));

-- Security definer fn for accepting an invite by token (bypasses email visibility check cleanly)
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.workspace_invites%ROWTYPE;
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.workspace_invites WHERE token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF v_invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already used';
  END IF;
  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite expired';
  END IF;
  IF lower(v_invite.email) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'This invite is for a different email address';
  END IF;

  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (v_invite.workspace_id, auth.uid(), v_invite.role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.workspace_invites SET accepted_at = now() WHERE id = v_invite.id;

  RETURN v_invite.workspace_id;
END;
$$;

-- Public lookup of invite metadata by token (for the accept page preview)
CREATE OR REPLACE FUNCTION public.get_invite_preview(_token text)
RETURNS TABLE (workspace_id uuid, workspace_name text, email text, role public.workspace_role, expires_at timestamptz, accepted boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.workspace_id, w.name, i.email, i.role, i.expires_at, (i.accepted_at IS NOT NULL)
  FROM public.workspace_invites i
  JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.token = _token;
$$;

GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_preview(text) TO authenticated, anon;
