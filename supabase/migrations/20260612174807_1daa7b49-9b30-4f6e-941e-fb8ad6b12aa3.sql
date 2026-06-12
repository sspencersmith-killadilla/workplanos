CREATE TRIGGER trg_add_workspace_owner_member
AFTER INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.add_workspace_owner_member();

CREATE TRIGGER trg_handle_new_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();