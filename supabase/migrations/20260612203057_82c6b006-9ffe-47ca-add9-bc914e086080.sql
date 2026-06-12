
-- ============ Avatars: co-member read access ============
CREATE POLICY "avatars read co-members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm_me
    JOIN public.workspace_members wm_owner
      ON wm_me.workspace_id = wm_owner.workspace_id
    WHERE wm_me.user_id = auth.uid()
      AND wm_owner.user_id::text = split_part(name, '/', 1)
  )
);

-- ============ Realtime channel authorization ============
-- Default-deny on realtime.messages; only members of the referenced
-- workspace/board can read or send on its channel.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "realtime read for workspace/board members"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'workspace:%' THEN
      public.is_member(
        NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid,
        (SELECT auth.uid())
      )
    WHEN realtime.topic() LIKE 'board:%' THEN
      public.is_member(
        public.board_workspace(
          NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
        ),
        (SELECT auth.uid())
      )
    ELSE false
  END
);

CREATE POLICY "realtime write for workspace/board members"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN realtime.topic() LIKE 'workspace:%' THEN
      public.is_member(
        NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid,
        (SELECT auth.uid())
      )
    WHEN realtime.topic() LIKE 'board:%' THEN
      public.is_member(
        public.board_workspace(
          NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
        ),
        (SELECT auth.uid())
      )
    ELSE false
  END
);
