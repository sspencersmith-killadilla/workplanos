
-- 1) Block role self-escalation and unauthorized owner grants via a BEFORE UPDATE trigger.
CREATE OR REPLACE FUNCTION public.workspace_members_guard_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nobody can change their own role.
  IF NEW.user_id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'You cannot change your own workspace role';
  END IF;

  -- Only existing owners can grant or keep the 'owner' role on someone else's row.
  IF NEW.role = 'owner' AND OLD.role <> 'owner'
     AND NOT public.has_ws_role(NEW.workspace_id, auth.uid(), ARRAY['owner'::workspace_role]) THEN
    RAISE EXCEPTION 'Only workspace owners can grant the owner role';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_members_guard_role ON public.workspace_members;
CREATE TRIGGER workspace_members_guard_role
BEFORE UPDATE ON public.workspace_members
FOR EACH ROW
EXECUTE FUNCTION public.workspace_members_guard_role();

-- 2) Clean up the storage SELECT policy: drop the no-op IS NOT NULL check.
DROP POLICY IF EXISTS "item-files read for members" ON storage.objects;
CREATE POLICY "item-files read for members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'item-files'
  AND EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id::text = split_part(objects.name, '/', 1)
      AND public.is_member(public.item_workspace(i.id), auth.uid())
  )
);
