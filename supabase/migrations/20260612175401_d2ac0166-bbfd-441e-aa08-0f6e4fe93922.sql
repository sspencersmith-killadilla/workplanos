drop trigger if exists workspaces_add_owner on public.workspaces;
drop trigger if exists trg_add_workspace_owner_member on public.workspaces;

create trigger workspaces_add_owner
after insert on public.workspaces
for each row execute function public.add_workspace_owner_member();