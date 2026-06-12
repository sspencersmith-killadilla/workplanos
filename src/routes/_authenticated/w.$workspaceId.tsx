import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ChevronLeft, LogOut, Plus, LayoutGrid, Settings, LayoutDashboard, BookOpen, Users, User, Menu, Shield } from "lucide-react";
import { InboxBell } from "@/components/InboxBell";
import { SearchPalette } from "@/components/SearchPalette";
import { supabase } from "@/integrations/supabase/client";
import { getWorkspace } from "@/lib/workspaces.functions";
import { listBoards, createBoard } from "@/lib/boards.functions";
import { isSuperAdmin } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/w/$workspaceId")({
  component: WorkspaceShell,
});

function WorkspaceShell() {
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getWsFn = useServerFn(getWorkspace);
  const listBoardsFn = useServerFn(listBoards);
  const createBoardFn = useServerFn(createBoard);
  const isSuperAdminFn = useServerFn(isSuperAdmin);

  const { data: ws } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => getWsFn({ data: { id: workspaceId } }),
  });
  const { data: boards } = useQuery({
    queryKey: ["boards", workspaceId],
    queryFn: () => listBoardsFn({ data: { workspaceId } }),
  });
  const { data: superAdmin } = useQuery({
    queryKey: ["isSuperAdmin"],
    queryFn: () => isSuperAdminFn(),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: (n: string) => createBoardFn({ data: { workspaceId, name: n } }),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ["boards", workspaceId] });
      setOpen(false);
      setName("");
      navigate({ to: "/w/$workspaceId/b/$boardId", params: { workspaceId, boardId: id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create board"),
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const params = useParams({ strict: false }) as { boardId?: string };
  const activeBoardId = params.boardId;
  const isDashboards =
    typeof window !== "undefined" &&
    window.location.pathname.endsWith("/dashboards");
  const isMembers =
    typeof window !== "undefined" &&
    window.location.pathname.endsWith("/members");
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="h-screen w-screen flex bg-background text-foreground overflow-hidden">
      <button
        className="md:hidden fixed top-2 left-2 z-50 h-9 w-9 grid place-items-center rounded-md bg-background border border-border/60 shadow-sm"
        onClick={() => setNavOpen((o) => !o)}
        aria-label="Toggle navigation"
      >
        <Menu className="h-4 w-4" />
      </button>
      {navOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className={cn(
          "w-64 shrink-0 border-r border-border/60 flex flex-col bg-background",
          "fixed md:static inset-y-0 left-0 z-40 transition-transform",
          navOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="px-3 py-3 border-b border-border/60 flex items-center gap-2">
          <Link to="/app" className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="h-6 w-6 rounded-md shrink-0" style={{ background: ws?.color ?? "#6366f1" }} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{ws?.name ?? "Workspace"}</div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">{ws?.slug}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          <Link
            to="/w/$workspaceId/dashboards"
            params={{ workspaceId }}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors mb-2",
              isDashboards && "bg-muted text-foreground",
            )}
          >
            <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Dashboards</span>
          </Link>
          <Link
            to="/w/$workspaceId/members"
            params={{ workspaceId }}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors mb-2",
              isMembers && "bg-muted text-foreground",
            )}
          >
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Members</span>
          </Link>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Boards
            </span>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="h-5 w-5 grid place-items-center rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create board</DialogTitle>
                </DialogHeader>
                <Input
                  autoFocus
                  placeholder="Sprint planning, Roadmap…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) create.mutate(name.trim());
                  }}
                />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={!name.trim() || create.isPending}
                    onClick={() => create.mutate(name.trim())}
                  >
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {(!boards || boards.length === 0) && (
            <div className="px-2 py-6 text-xs text-muted-foreground">
              No boards yet. Click <span className="text-foreground">+</span> to create one.
            </div>
          )}

          <div className="space-y-0.5">
            {boards?.map((b: any) => (
              <Link
                key={b.id}
                to="/w/$workspaceId/b/$boardId"
                params={{ workspaceId, boardId: b.id }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors",
                  activeBoardId === b.id && "bg-muted text-foreground",
                )}
              >
                <div className="h-2 w-2 rounded-sm" style={{ background: b.color }} />
                <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{b.name}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="px-2 py-2 border-t border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
              onClick={signOut}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
            <a
              href="/USER_GUIDE.md"
              target="_blank"
              rel="noopener noreferrer"
              className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Open user guide"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </a>
            <InboxBell />
            <Link
              to="/account"
              className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Account"
            >
              <User className="h-3.5 w-3.5" />
            </Link>
            {superAdmin && (
              <Link
                to="/admin"
                className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Site administration"
              >
                <Shield className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <button className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground">
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </main>
      <SearchPalette workspaceId={workspaceId} />
    </div>
  );
}