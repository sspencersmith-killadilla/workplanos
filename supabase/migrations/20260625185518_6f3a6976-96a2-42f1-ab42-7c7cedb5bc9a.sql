DROP POLICY "audit insert members" ON public.audit_log;
CREATE POLICY "audit insert members" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id, auth.uid())
    AND (actor_id IS NULL OR actor_id = auth.uid())
  );

DROP POLICY "activity insert members+" ON public.item_activity;
CREATE POLICY "activity insert members+" ON public.item_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_ws_role(public.item_workspace(item_id), auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'member'::workspace_role])
    AND (actor_id IS NULL OR actor_id = auth.uid())
  );