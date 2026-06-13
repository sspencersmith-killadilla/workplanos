CREATE POLICY "runs insert members" ON public.automation_runs
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.automation_rules r
    WHERE r.id = automation_runs.rule_id
      AND public.is_member(public.board_workspace(r.board_id), auth.uid())
  )
);