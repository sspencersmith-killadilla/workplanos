import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  LayoutDashboard,
  BarChart3,
  Hash,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import {
  listDashboards,
  getDashboard,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  createWidget,
  deleteWidget,
  computeWidget,
} from "@/lib/dashboards.functions";
import { listBoards, getBoard } from "@/lib/boards.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/dashboards")({
  component: DashboardsPage,
});

type WidgetKind =
  | "kpi_count"
  | "status_breakdown"
  | "numbers_sum"
  | "board_link";

function DashboardsPage() {
  const { workspaceId } = Route.useParams();
  const qc = useQueryClient();

  const listFn = useServerFn(listDashboards);
  const createFn = useServerFn(createDashboard);
  const updateFn = useServerFn(updateDashboard);
  const deleteFn = useServerFn(deleteDashboard);
  const getDashFn = useServerFn(getDashboard);

  const listKey = ["dashboards", workspaceId] as const;
  const dashboardsQ = useQuery({
    queryKey: listKey,
    queryFn: () => listFn({ data: { workspaceId } }),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveId = selectedId ?? dashboardsQ.data?.[0]?.id ?? null;

  const dashQ = useQuery({
    queryKey: ["dashboard", effectiveId],
    queryFn: () => getDashFn({ data: { id: effectiveId! } }),
    enabled: !!effectiveId,
  });

  const createMut = useMutation({
    mutationFn: (name: string) => createFn({ data: { workspaceId, name } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: listKey });
      setSelectedId(res.id);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey });
      setSelectedId(null);
    },
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border/60 px-6 py-3 flex items-center gap-3 shrink-0">
        <LayoutDashboard className="h-4 w-4 text-primary" />
        <h1 className="font-semibold tracking-tight">Dashboards</h1>
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={effectiveId ?? ""}
            onValueChange={(v) => setSelectedId(v)}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select dashboard…" />
            </SelectTrigger>
            <SelectContent>
              {(dashboardsQ.data ?? []).map((d: any) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const name = prompt("Dashboard name?", "Overview");
              if (name) createMut.mutate(name);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> New
          </Button>
        </div>
      </div>

      {(dashboardsQ.data ?? []).length === 0 && (
        <div className="flex-1 grid place-items-center px-6">
          <div className="text-center max-w-sm">
            <div className="mx-auto h-12 w-12 grid place-items-center rounded-xl bg-muted">
              <LayoutDashboard className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="mt-3 text-lg font-medium">No dashboards yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a dashboard to track KPIs across your boards.
            </p>
            <Button
              className="mt-4"
              onClick={() => createMut.mutate("Overview")}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Create dashboard
            </Button>
          </div>
        </div>
      )}

      {effectiveId && dashQ.data && (
        <DashboardCanvas
          key={effectiveId}
          workspaceId={workspaceId}
          dashboardId={effectiveId}
          name={dashQ.data.dashboard.name}
          widgets={dashQ.data.widgets as any[]}
          onRename={async (n) => {
            await updateFn({ data: { id: effectiveId, name: n } });
            qc.invalidateQueries({ queryKey: listKey });
            qc.invalidateQueries({ queryKey: ["dashboard", effectiveId] });
          }}
          onDelete={() => {
            if (confirm(`Delete dashboard "${dashQ.data.dashboard.name}"?`))
              deleteMut.mutate(effectiveId);
          }}
        />
      )}
    </div>
  );
}

function DashboardCanvas(props: {
  workspaceId: string;
  dashboardId: string;
  name: string;
  widgets: any[];
  onRename: (n: string) => Promise<void>;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const listBoardsFn = useServerFn(listBoards);
  const createWidgetFn = useServerFn(createWidget);
  const deleteWidgetFn = useServerFn(deleteWidget);

  const dashKey = ["dashboard", props.dashboardId] as const;
  const boardsQ = useQuery({
    queryKey: ["boards", props.workspaceId],
    queryFn: () => listBoardsFn({ data: { workspaceId: props.workspaceId } }),
  });

  const [addOpen, setAddOpen] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: dashKey });

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Input
            defaultValue={props.name}
            onBlur={(e) => {
              if (e.target.value !== props.name) props.onRename(e.target.value);
            }}
            className="text-xl font-semibold h-11 border-0 px-0 shadow-none focus-visible:ring-0"
          />
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={(boardsQ.data ?? []).length === 0}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add widget
          </Button>
          <Button variant="ghost" size="icon" onClick={props.onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        {props.widgets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-12 text-center">
            <p className="text-sm text-muted-foreground">
              No widgets yet. Click <strong>Add widget</strong> to track KPIs
              from your boards.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {props.widgets.map((w) => (
              <WidgetCard
                key={w.id}
                widget={w}
                workspaceId={props.workspaceId}
                onDelete={async () => {
                  await deleteWidgetFn({ data: { id: w.id } });
                  invalidate();
                }}
              />
            ))}
          </div>
        )}
      </div>

      <AddWidgetDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        boards={boardsQ.data ?? []}
        onCreate={async (payload) => {
          await createWidgetFn({
            data: {
              dashboardId: props.dashboardId,
              kind: payload.kind,
              settings: payload.settings,
            },
          });
          invalidate();
          setAddOpen(false);
        }}
      />
    </div>
  );
}

function WidgetCard({
  widget,
  workspaceId,
  onDelete,
}: {
  widget: any;
  workspaceId: string;
  onDelete: () => void;
}) {
  const computeFn = useServerFn(computeWidget);
  const q = useQuery({
    queryKey: ["widget", widget.id],
    queryFn: () => computeFn({ data: { widgetId: widget.id } }),
    refetchInterval: 30_000,
  });

  const settings = widget.settings ?? {};
  const boardId = settings.boardId as string | undefined;
  const data: any = q.data;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 flex flex-col gap-3 min-h-[140px]">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {labelFor(widget.kind)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {boardId && (
            <Link
              to="/w/$workspaceId/b/$boardId"
              params={{ workspaceId, boardId }}
              className="h-6 w-6 grid place-items-center rounded hover:bg-muted text-muted-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            onClick={onDelete}
            className="h-6 w-6 grid place-items-center rounded hover:bg-muted text-muted-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {q.isLoading && (
        <div className="text-xs text-muted-foreground">Loading…</div>
      )}

      {!q.isLoading && data?.empty && (
        <div className="text-xs text-muted-foreground">
          Configure this widget by re-creating it.
        </div>
      )}

      {!q.isLoading && data && !data.empty && (
        <>
          {widget.kind === "kpi_count" && (
            <div>
              <div className="text-4xl font-semibold tracking-tight">
                {data.value ?? 0}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {settings.label ?? "items"}
              </div>
            </div>
          )}

          {widget.kind === "numbers_sum" && (
            <div>
              <div className="text-4xl font-semibold tracking-tight">
                {Number(data.value ?? 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {settings.label ?? "sum"} · {data.count ?? 0} rows
              </div>
            </div>
          )}

          {widget.kind === "board_link" && data.board && (
            <div>
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{ background: data.board.color ?? "#6366f1" }}
                />
                <div className="font-medium">{data.board.name}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {data.count ?? 0} items
              </div>
            </div>
          )}

          {widget.kind === "status_breakdown" && (
            <div className="space-y-2">
              {((data.buckets ?? []) as any[]).map((b) => {
                const total = ((data.buckets ?? []) as any[]).reduce(
                  (acc: number, x: any) => acc + x.count,
                  0,
                );
                const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
                return (
                  <div key={b.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{b.label}</span>
                      <span className="text-muted-foreground">
                        {b.count} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: b.color }}
                      />
                    </div>
                  </div>
                );
              })}
              {data.unset > 0 && (
                <div className="text-[11px] text-muted-foreground pt-1">
                  {data.unset} without status
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function labelFor(kind: string) {
  switch (kind) {
    case "kpi_count":
      return "KPI";
    case "status_breakdown":
      return "Status breakdown";
    case "numbers_sum":
      return "Sum";
    case "board_link":
      return "Board";
    default:
      return kind;
  }
}

function AddWidgetDialog(props: {
  open: boolean;
  onClose: () => void;
  boards: any[];
  onCreate: (p: {
    kind: WidgetKind;
    settings: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<WidgetKind>("kpi_count");
  const [boardId, setBoardId] = useState<string>("");
  const [columnId, setColumnId] = useState<string>("");
  const [statusOptionId, setStatusOptionId] = useState<string>("");
  const [label, setLabel] = useState<string>("");

  const getBoardFn = useServerFn(getBoard);
  const boardCols = useQuery({
    queryKey: ["board-meta", boardId],
    queryFn: () => getBoardFn({ data: { id: boardId } }),
    enabled: !!boardId,
  });

  const columns = (boardCols.data?.columns ?? []) as any[];
  const statusCols = useMemo(
    () => columns.filter((c: any) => c.kind === "status"),
    [columns],
  );
  const numberCols = useMemo(
    () => columns.filter((c: any) => c.kind === "number"),
    [columns],
  );
  const selectedStatusCol = statusCols.find((c: any) => c.id === columnId);

  const canSubmit = (() => {
    if (!boardId) return false;
    if (kind === "kpi_count") return true; // count all by default
    if (kind === "status_breakdown") return !!columnId;
    if (kind === "numbers_sum") return !!columnId;
    if (kind === "board_link") return true;
    return false;
  })();

  const reset = () => {
    setKind("kpi_count");
    setBoardId("");
    setColumnId("");
    setStatusOptionId("");
    setLabel("");
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (!v) {
          props.onClose();
          reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add widget</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v: any) => setKind(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kpi_count">
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" /> KPI count
                  </span>
                </SelectItem>
                <SelectItem value="status_breakdown">
                  <span className="inline-flex items-center gap-2">
                    <BarChart3 className="h-3.5 w-3.5" /> Status breakdown
                  </span>
                </SelectItem>
                <SelectItem value="numbers_sum">
                  <span className="inline-flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5" /> Numbers sum
                  </span>
                </SelectItem>
                <SelectItem value="board_link">
                  <span className="inline-flex items-center gap-2">
                    <LayoutDashboard className="h-3.5 w-3.5" /> Board card
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Board</Label>
            <Select value={boardId} onValueChange={setBoardId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a board…" />
              </SelectTrigger>
              <SelectContent>
                {props.boards.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kind === "kpi_count" && boardId && (
            <>
              <div className="space-y-1.5">
                <Label>Filter by status (optional)</Label>
                <Select
                  value={columnId}
                  onValueChange={(v) => {
                    setColumnId(v);
                    setStatusOptionId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Count all items" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusCols.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedStatusCol && (
                <div className="space-y-1.5">
                  <Label>Status value</Label>
                  <Select
                    value={statusOptionId}
                    onValueChange={setStatusOptionId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a status…" />
                    </SelectTrigger>
                    <SelectContent>
                      {((selectedStatusCol.settings?.options ?? []) as any[]).map(
                        (o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {kind === "status_breakdown" && boardId && (
            <div className="space-y-1.5">
              <Label>Status column</Label>
              <Select value={columnId} onValueChange={setColumnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a status column…" />
                </SelectTrigger>
                <SelectContent>
                  {statusCols.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "numbers_sum" && boardId && (
            <div className="space-y-1.5">
              <Label>Number column</Label>
              <Select value={columnId} onValueChange={setColumnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a number column…" />
                </SelectTrigger>
                <SelectContent>
                  {numberCols.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(kind === "kpi_count" || kind === "numbers_sum") && (
            <div className="space-y-1.5">
              <Label>Label (optional)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Active tasks"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              const settings: Record<string, unknown> = { boardId };
              if (columnId) settings.columnId = columnId;
              if (statusOptionId) settings.statusOptionId = statusOptionId;
              if (label) settings.label = label;
              props
                .onCreate({ kind, settings })
                .then(reset)
                .catch((e) => toast.error(e.message ?? "Failed"));
            }}
          >
            Add widget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Avoid unused import warnings for useQueries when tree-shaken in dev
void useQueries;