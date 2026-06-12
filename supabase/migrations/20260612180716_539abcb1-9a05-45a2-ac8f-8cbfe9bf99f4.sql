
CREATE TABLE public.item_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_files TO authenticated;
GRANT ALL ON public.item_files TO service_role;

ALTER TABLE public.item_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_files select for members"
ON public.item_files FOR SELECT TO authenticated
USING (public.is_member(public.item_workspace(item_id), auth.uid()));

CREATE POLICY "item_files insert for members"
ON public.item_files FOR INSERT TO authenticated
WITH CHECK (
  public.is_member(public.item_workspace(item_id), auth.uid())
  AND uploaded_by = auth.uid()
);

CREATE POLICY "item_files delete for uploader or admin"
ON public.item_files FOR DELETE TO authenticated
USING (
  uploaded_by = auth.uid()
  OR public.has_ws_role(public.item_workspace(item_id), auth.uid(), ARRAY['owner','admin']::workspace_role[])
);

CREATE INDEX item_files_item_idx ON public.item_files(item_id);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.item_activity;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.item_files;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
