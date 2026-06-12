GRANT EXECUTE ON FUNCTION public.is_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_ws_role(uuid, uuid, public.workspace_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_actor_active(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.board_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_workspace(uuid) TO authenticated;

ALTER FUNCTION public.workspace_members_guard_role() SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.workspace_members_guard_role() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "profiles self-update" ON public.profiles;
CREATE POLICY "profiles self-update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);