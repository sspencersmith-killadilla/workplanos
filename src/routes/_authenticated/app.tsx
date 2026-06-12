import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, LogOut, Layout } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listMyWorkspaces, createWorkspace } from "@/lib/workspaces.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppHome,
});

function AppHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyWorkspaces);
  const createFn = useServerFn(createWorkspace);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => listFn(),
  });

  const create = useMutation({
    mutationFn: (n: string) => createFn({ data: { name: n } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      setOpen(false);
      setName("");
      toast.success("Workspace created");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create workspace"),
  });

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
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground font-bold">W</div>
            WorkOS
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your workspaces</h1>
            <p className="text-sm text-muted-foreground mt-1">Pick one to enter, or create a new one.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> New workspace
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create workspace</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  autoFocus
                  placeholder="Marketing, Engineering, HR…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) create.mutate(name.trim());
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate(name.trim())}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

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