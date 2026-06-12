
-- Storage policies for item-files bucket
-- Path layout: <itemId>/<filename>
CREATE POLICY "item-files read for members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'item-files'
  AND EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id::text = split_part(name, '/', 1)
      AND public.is_member(i.board_id::uuid, auth.uid()) IS NOT NULL
      AND public.is_member(public.item_workspace(i.id), auth.uid())
  )
);

CREATE POLICY "item-files insert for members"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'item-files'
  AND auth.uid() = owner
  AND EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id::text = split_part(name, '/', 1)
      AND public.is_member(public.item_workspace(i.id), auth.uid())
  )
);

CREATE POLICY "item-files delete for owner or admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'item-files'
  AND (
    auth.uid() = owner
    OR EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id::text = split_part(name, '/', 1)
        AND public.has_ws_role(public.item_workspace(i.id), auth.uid(), ARRAY['owner','admin']::workspace_role[])
    )
  )
);
