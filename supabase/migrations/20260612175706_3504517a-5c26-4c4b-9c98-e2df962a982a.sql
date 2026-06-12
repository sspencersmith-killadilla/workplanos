drop policy if exists "ws select for members" on public.workspaces;

create policy "ws select for members or owner"
on public.workspaces
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.is_member(id, auth.uid())
);