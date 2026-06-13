CREATE OR REPLACE FUNCTION public.shares_workspace(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members m1
    JOIN public.workspace_members m2 ON m2.workspace_id = m1.workspace_id
    WHERE m1.user_id = _a AND m2.user_id = _b
  );
$$;

CREATE POLICY "notifs insert teammates" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.shares_workspace(auth.uid(), user_id)
);