DROP POLICY IF EXISTS "avatars read own" ON storage.objects;
CREATE POLICY "avatars read own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = split_part(name, '/', 1)
);

DROP POLICY IF EXISTS "avatars insert own" ON storage.objects;
CREATE POLICY "avatars insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() = owner
  AND auth.uid()::text = split_part(name, '/', 1)
);

DROP POLICY IF EXISTS "avatars update own" ON storage.objects;
CREATE POLICY "avatars update own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() = owner
  AND auth.uid()::text = split_part(name, '/', 1)
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() = owner
  AND auth.uid()::text = split_part(name, '/', 1)
);

DROP POLICY IF EXISTS "avatars delete own" ON storage.objects;
CREATE POLICY "avatars delete own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() = owner
  AND auth.uid()::text = split_part(name, '/', 1)
);