import { LogoMark } from "@/components/LogoMark";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, LogOut, Layout, User, Building2, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listMyWorkspaces, createWorkspace } from "@/lib/workspaces.functions";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppHome,
});

function AppHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyWorkspaces);
  const listOrgsFn = useServerFn(listMyOrganizations);
  const createFn = useServerFn(createWorkspace);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState<string>("");

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => listFn(),
  });

  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => listOrgsFn(),
  });

  const adminOrgs = (organizations ?? []).filter((o: any) => o.role === "owner" || o.role === "admin");

  const create = useMutation({
    mutationFn: (input: { name: string; organizationId: string }) =>
      createFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      setOpen(false);
      setName("");
      toast.success("Workspace created");
    },
    onError: (e: any) => {
      console.error("createWorkspace failed", e);
      toast.error(e?.message ?? "Could not create workspace");
    },
  });

  function submitCreate() {
    const trimmed = name.trim();
    const chosenOrg = orgId || adminOrgs[0]?.id;
    if (!trimmed) return;
    if (!chosenOrg) {
      toast.error("You need to be an admin of an organization to create a department.");
      return;
    }
    create.mutate({ name: trimmed, organizationId: chosenOrg });
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <LogoMark className="h-7 w-7" />
            WorkPlanOS
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to="/help"
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors"
            >
              Help
            </Link>
            <Link
              to="/account"
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors inline-flex items-center gap-1.5"
            >
              <User className="h-4 w-4" /> Account
            </Link>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your departments</h1>
            <p className="text-sm text-muted-foreground mt-1">Pick one to enter, or create a new one in your organization.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={adminOrgs.length === 0}>
                <Plus className="h-4 w-4 mr-2" /> New department
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create department</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {adminOrgs.length > 1 && (
                  <Select value={orgId || adminOrgs[0]?.id} onValueChange={setOrgId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {adminOrgs.map((o: any) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Input
                  autoFocus
                  placeholder="Parks & Rec, Public Works, Records…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitCreate();
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={!name.trim() || create.isPending} onClick={submitCreate}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {organizations && organizations.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Organizations</span>
            {organizations.map((o: any) => (
              <Link
                key={o.id}
                to="/org/$orgSlug"
                params={{ orgSlug: o.slug }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/40 transition-colors"
              >
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                {o.name}
                {(o.role === "owner" || o.role === "admin") && (
                  <Settings className="h-3 w-3 text-muted-foreground" />
                )}
              </Link>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !workspaces || workspaces.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <div className="mx-auto h-12 w-12 grid place-items-center rounded-lg bg-muted">
              <Layout className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-medium">No workspaces yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Create your first workspace to start building boards.</p>
            <Button className="mt-5" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create workspace
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((ws: any) => (
              <Link
                key={ws.id}
                to="/w/$workspaceId"
                params={{ workspaceId: ws.id }}
                className="group rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="h-10 w-10 rounded-md mb-4" style={{ background: ws.color }} />
                <h3 className="font-medium tracking-tight">{ws.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 font-mono">{ws.slug}</p>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12 rounded-lg border border-dashed border-border/60 p-5 text-sm text-muted-foreground">
          <strong className="text-foreground">Foundation shipped.</strong> Auth (email + Google), full database schema with RLS for all of workspaces/boards/groups/items/columns/values/views/comments/activity/forms/automations/dashboards, design system, and landing/auth surfaces are live. The board canvas, table/kanban/calendar/workload views, column editors, item drawer, automations builder, form builder, and dashboard widgets land in the next turns.
        </div>
      </main>
    </div>
  );
}