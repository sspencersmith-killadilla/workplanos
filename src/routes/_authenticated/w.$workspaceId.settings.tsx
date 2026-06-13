import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Users, Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getWorkspace,
  getMyWorkspaceRole,
  updateWorkspace,
  deleteWorkspace,
} from "@/lib/workspaces.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/settings")({
  component: WorkspaceSettingsPage,
});

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#10b981", "#14b8a6", "#06b6d4", "#3b82f6",
  "#6366f1", "#8b5cf6", "#ec4899", "#64748b",
];

function WorkspaceSettingsPage() {
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getWsFn = useServerFn(getWorkspace);
  const getRoleFn = useServerFn(getMyWorkspaceRole);
  const updateFn = useServerFn(updateWorkspace);
  const deleteFn = useServerFn(deleteWorkspace);

  const { data: ws } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => getWsFn({ data: { id: workspaceId } }),
  });
  const { data: roleData } = useQuery({
    queryKey: ["myWorkspaceRole", workspaceId],
    queryFn: () => getRoleFn({ data: { workspaceId } }),
  });

  const role = roleData?.role;
  const canEdit = role === "owner" || role === "admin";
  const canDelete = role === "owner";

  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (ws) {
      setName(ws.name);
      setColor(ws.color ?? "#6366f1");
    }
  }, [ws]);

  const save = useMutation({
    mutationFn: (patch: { name?: string; color?: string }) =>
      updateFn({ data: { id: workspaceId, ...patch } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("Workspace updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id: workspaceId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("Workspace deleted");
      navigate({ to: "/app", replace: true });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  if (!ws) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const dirty = name.trim() !== ws.name || color !== (ws.color ?? "#6366f1");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-10">
        <header className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md" style={{ background: ws.color }} />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">
              Workspace settings
            </h1>
            <p className="text-xs text-muted-foreground font-mono truncate">{ws.slug}</p>
          </div>
        </header>

        {/* General */}
        <section className="rounded-xl border border-border/60 bg-card p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold">General</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Update how this workspace appears to members.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ws-name" className="text-xs">Name</Label>
            <Input
              id="ws-name"
              value={name}
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setColor(c)}
                  aria-label={`Choose ${c}`}
                  className={cn(
                    "h-7 w-7 rounded-md border-2 transition-all",
                    color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105",
                    !canEdit && "cursor-not-allowed opacity-60",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Slug</Label>
            <Input value={ws.slug} disabled className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">
              Slug cannot be changed — it's used in invite links.
            </p>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <Button
                disabled={!dirty || !name.trim() || save.isPending}
                onClick={() =>
                  save.mutate({ name: name.trim(), color })
                }
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </section>

        {/* Quick links */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/w/$workspaceId/members"
            params={{ workspaceId }}
            className="rounded-lg border border-border/60 bg-card p-4 hover:border-primary/40 transition-colors flex items-center gap-3"
          >
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">Members</div>
              <div className="text-xs text-muted-foreground">Invite people and manage roles</div>
            </div>
          </Link>
          <Link
            to="/w/$workspaceId/integrations"
            params={{ workspaceId }}
            className="rounded-lg border border-border/60 bg-card p-4 hover:border-primary/40 transition-colors flex items-center gap-3"
          >
            <Plug className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">Integrations</div>
              <div className="text-xs text-muted-foreground">Connect external services</div>
            </div>
          </Link>
        </section>

        {/* Danger zone */}
        {canDelete && (
          <section className="rounded-xl border border-destructive/40 bg-destructive/[0.03] p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanent actions. Proceed with caution.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm">
                <div className="font-medium">Delete this workspace</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Removes every board, item, comment, automation, dashboard, and member. This cannot be undone.
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete workspace
              </Button>
            </div>
          </section>
        )}
      </div>

      <ConfirmDeleteDialog
        open={confirmOpen}
        onOpenChange={(o) => !o && setConfirmOpen(false)}
        title="Delete workspace?"
        description={
          <>
            <p>
              This permanently deletes <strong className="text-foreground">{ws.name}</strong>{" "}
              and every board, item, comment, automation, form, dashboard, and member inside it.
            </p>
            <p>This action cannot be undone.</p>
          </>
        }
        confirmText={ws.name}
        confirmLabel="Delete workspace"
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}