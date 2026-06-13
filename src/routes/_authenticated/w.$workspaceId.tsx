import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ChevronLeft, LogOut, Plus, LayoutGrid, Settings, LayoutDashboard, BookOpen, Users, User, Menu, Shield, Plug, MoreHorizontal, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { InboxBell } from "@/components/InboxBell";
import { SearchPalette } from "@/components/SearchPalette";
import { supabase } from "@/integrations/supabase/client";
import { getWorkspace, getMyWorkspaceRole } from "@/lib/workspaces.functions";
import { listBoards, createBoard, deleteBoard } from "@/lib/boards.functions";
import { archiveBoard } from "@/lib/lifecycle.functions";
import { isSuperAdmin } from "@/lib/admin.functions";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
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
  const archiveBoardFn = useServerFn(archiveBoard);
  const deleteBoardFn = useServerFn(deleteBoard);
  const getRoleFn = useServerFn(getMyWorkspaceRole);

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
  const { data: roleData } = useQuery({
    queryKey: ["myWorkspaceRole", workspaceId],
    queryFn: () => getRoleFn({ data: { workspaceId } }),
  });
  const canDeleteBoard = roleData?.role === "owner" || roleData?.role === "admin";

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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

  const archive = useMutation({
    mutationFn: (v: { id: string; archived: boolean }) =>
      archiveBoardFn({ data: v }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["boards", workspaceId] });
      toast.success(v.archived ? "Board archived" : "Board restored");
    },
    onError: (e: any) => toast.error(e?.message ?? "Action failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteBoardFn({ data: { id } }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["boards", workspaceId] });
      setDeleteTarget(null);
      toast.success("Board deleted");
      if (activeBoardId === id) {
        navigate({ to: "/w/$workspaceId", params: { workspaceId } });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not delete board"),
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
  const isIntegrations =
    typeof window !== "undefined" &&
    window.location.pathname.endsWith("/integrations");
  const [navOpen, setNavOpen] = useState(false);

  const activeBoards = useMemo(
    () => (boards ?? []).filter((b: any) => !b.archived_at),
    [boards],
  );
  const archivedBoards = useMemo(
    () => (boards ?? []).filter((b: any) => b.archived_at),
    [boards],
  );

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
          <Link
            to="/w/$workspaceId/integrations"
            params={{ workspaceId }}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors mb-2",
              isIntegrations && "bg-muted text-foreground",
            )}
          >
            <Plug className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Integrations</span>
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

          {activeBoards.length === 0 && (
            <div className="px-2 py-6 text-xs text-muted-foreground">
              No boards yet. Click <span className="text-foreground">+</span> to create one.
            </div>
          )}

          <div className="space-y-0.5">
            {activeBoards.map((b: any) => (
              <BoardRow
                key={b.id}
                board={b}
                workspaceId={workspaceId}
                active={activeBoardId === b.id}
                canDelete={canDeleteBoard}
                onArchive={() => archive.mutate({ id: b.id, archived: true })}
                onDelete={() => setDeleteTarget({ id: b.id, name: b.name })}
              />
            ))}
          </div>

          {archivedBoards.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/60">
              <label className="flex items-center justify-between px-2 mb-1 cursor-pointer">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Archived ({archivedBoards.length})
                </span>
                <Switch
                  checked={showArchived}
                  onCheckedChange={setShowArchived}
                  aria-label="Show archived boards"
                />
              </label>
              {showArchived && (
                <div className="space-y-0.5 mt-1 opacity-70">
                  {archivedBoards.map((b: any) => (
                    <BoardRow
                      key={b.id}
                      board={b}
                      workspaceId={workspaceId}
                      active={activeBoardId === b.id}
                      archived
                      canDelete={canDeleteBoard}
                      onUnarchive={() => archive.mutate({ id: b.id, archived: false })}
                      onDelete={() => setDeleteTarget({ id: b.id, name: b.name })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-2 py-2 border-t border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
              onClick={signOut}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
            <Link
              to="/help"
              className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Open user manual"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </Link>
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

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete board?"
        description={
          <>
            <p>
              This permanently deletes <strong className="text-foreground">{deleteTarget?.name}</strong>{" "}
              and all of its items, columns, values, comments, automations, forms, and dashboards.
            </p>
            <p>This action cannot be undone.</p>
          </>
        }
        confirmText={deleteTarget?.name ?? ""}
        confirmLabel="Delete board"
        loading={del.isPending}
        onConfirm={() => deleteTarget && del.mutate(deleteTarget.id)}
      />
    </div>
  );
}

function BoardRow({
  board,
  workspaceId,
  active,
  archived = false,
  canDelete,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  board: { id: string; name: string; color: string };
  workspaceId: string;
  active: boolean;
  archived?: boolean;
  canDelete: boolean;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md pr-1 hover:bg-muted transition-colors",
        active && "bg-muted",
      )}
    >
      <Link
        to="/w/$workspaceId/b/$boardId"
        params={{ workspaceId, boardId: board.id }}
        className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-sm"
      >
        <div className="h-2 w-2 rounded-sm shrink-0" style={{ background: board.color }} />
        <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="truncate">{board.name}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "h-6 w-6 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-background/60 shrink-0",
              "opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100",
            )}
            onClick={(e) => e.stopPropagation()}
            aria-label="Board actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {archived ? (
            <DropdownMenuItem onClick={onUnarchive}>
              <ArchiveRestore className="h-3.5 w-3.5 mr-2" /> Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={onArchive}>
              <Archive className="h-3.5 w-3.5 mr-2" /> Archive
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}