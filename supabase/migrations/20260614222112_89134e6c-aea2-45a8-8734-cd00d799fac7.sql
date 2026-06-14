
-- Automation runs: allow admins/owners to delete
CREATE POLICY "runs delete admins" ON public.automation_runs
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.automation_rules r
    WHERE r.id = automation_runs.rule_id
      AND public.has_ws_role(public.board_workspace(r.board_id), auth.uid(), ARRAY['owner','admin']::workspace_role[])
  )
);

-- item_external_refs: restrict writes to ws admins/owners (ingestion uses service_role and bypasses RLS)
CREATE POLICY "item refs insert admins" ON public.item_external_refs
FOR INSERT TO authenticated
WITH CHECK (
  public.has_ws_role(public.item_workspace(item_id), auth.uid(), ARRAY['owner','admin']::workspace_role[])
);

CREATE POLICY "item refs update admins" ON public.item_external_refs
FOR UPDATE TO authenticated
USING (
  public.has_ws_role(public.item_workspace(item_id), auth.uid(), ARRAY['owner','admin']::workspace_role[])
)
WITH CHECK (
  public.has_ws_role(public.item_workspace(item_id), auth.uid(), ARRAY['owner','admin']::workspace_role[])
);

CREATE POLICY "item refs delete admins" ON public.item_external_refs
FOR DELETE TO authenticated
USING (
  public.has_ws_role(public.item_workspace(item_id), auth.uid(), ARRAY['owner','admin']::workspace_role[])
);

-- Notifications: restrict INSERT to self only. Triggers (SECURITY DEFINER) and service_role still work.
DROP POLICY IF EXISTS "notifs insert teammates" ON public.notifications;

CREATE POLICY "notifs insert self" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
