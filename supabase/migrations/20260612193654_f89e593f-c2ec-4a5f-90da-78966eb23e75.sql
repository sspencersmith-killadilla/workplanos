
-- 1) Profiles: restrict reads to self + workspace co-members
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;

CREATE POLICY "profiles readable to self or co-members"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members me
      JOIN public.workspace_members them
        ON them.workspace_id = me.workspace_id
      WHERE me.user_id = auth.uid()
        AND them.user_id = profiles.id
    )
  );

-- 2) form_submissions: allow anon + authenticated INSERTs against published forms
CREATE POLICY "submissions insert public for published forms"
  ON public.form_submissions FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = form_submissions.form_id
        AND f.is_published = true
    )
  );

-- 3) Storage: add UPDATE policy on item-files (owner or workspace admin)
CREATE POLICY "item-files update for owner or admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'item-files'
    AND (
      auth.uid() = owner
      OR EXISTS (
        SELECT 1 FROM public.items i
        WHERE i.id::text = split_part(objects.name, '/', 1)
          AND public.has_ws_role(public.item_workspace(i.id), auth.uid(),
                                 ARRAY['owner'::workspace_role,'admin'::workspace_role])
      )
    )
  )
  WITH CHECK (
    bucket_id = 'item-files'
    AND (
      auth.uid() = owner
      OR EXISTS (
        SELECT 1 FROM public.items i
        WHERE i.id::text = split_part(objects.name, '/', 1)
          AND public.has_ws_role(public.item_workspace(i.id), auth.uid(),
                                 ARRAY['owner'::workspace_role,'admin'::workspace_role])
      )
    )
  );

-- 4) Realtime messages: enable RLS, deny broadcast/presence by default.
-- postgres_changes subscriptions remain governed by table RLS.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- 5) Function search_path hardening
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

-- 6) Revoke direct EXECUTE on SECURITY DEFINER helpers from anon/authenticated.
-- These are used inside RLS policies / triggers and should not be public RPCs.
REVOKE EXECUTE ON FUNCTION public.is_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_ws_role(uuid, uuid, workspace_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.board_workspace(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.item_workspace(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dashboard_workspace(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_workspace_owner_member() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_comment_mentions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_people_assignment() FROM PUBLIC, anon, authenticated;

-- accept_workspace_invite must remain callable by authenticated only
REVOKE EXECUTE ON FUNCTION public.accept_workspace_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(text) TO authenticated;

-- get_invite_preview is intentionally public (preview before signup)
-- but the data returned is non-sensitive (workspace name, invited email, role)
GRANT EXECUTE ON FUNCTION public.get_invite_preview(text) TO anon, authenticated;
