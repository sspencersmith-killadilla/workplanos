import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Settings2, Target, Users, CircleDot, Zap } from "lucide-react";
import { toast } from "sonner";
import { getBoard, updateColumn } from "@/lib/boards.functions";
import {
  listKpis,
  createKpi,
  updateKpi,
  deleteKpi,
  listExternals,
  createExternal,
  updateExternal,
  deleteExternal,
} from "@/lib/customizations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/b/$boardId/customize")({
  component: CustomizePage,
});

function CustomizePage() {
  const { workspaceId, boardId } = Route.useParams();
  const getBoardFn = useServerFn(getBoard);
  const boardQ = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => getBoardFn({ data: { id: boardId } }),
  });

  if (boardQ.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!boardQ.data) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border/60 px-6 py-3 flex items-center gap-3 shrink-0">
        <Link
          to="/w/$workspaceId/b/$boardId"
          params={{ workspaceId, boardId }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to board
        </Link>
        <div className="h-4 w-px bg-border" />
        <h1 className="font-semibold tracking-tight flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" /> Customize ·{" "}
          <span className="text-muted-foreground">{boardQ.data.board.name}</span>
        </h1>
        <Link
          to="/w/$workspaceId/b/$boardId/automations"
          params={{ workspaceId, boardId }}
          className="ml-auto text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <Zap className="h-3.5 w-3.5" /> Edit automations
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-10">
          <KpisSection boardId={boardId} board={boardQ.data} />
          <StatusesSection boardId={boardId} board={boardQ.data} />
          <ExternalsSection boardId={boardId} />
          <AutomationsHintSection workspaceId={workspaceId} boardId={boardId} />
        </div>
      </div>
    </div>
  );
}

/* -------------------- KPIs -------------------- */

function KpisSection({ boardId, board }: { boardId: string; board: any }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listKpis);
  const createFn = useServerFn(createKpi);
  const updateFn = useServerFn(updateKpi);
  const deleteFn = useServerFn(deleteKpi);

  const kpisQ = useQuery({
    queryKey: ["kpis", boardId],
    queryFn: () => listFn({ data: { boardId } }),
  });

  const numberCols = (board.columns ?? []).filter((c: any) => c.kind === "number");
  const statusCols = (board.columns ?? []).filter((c: any) => c.kind === "status");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["kpis", boardId] });
  const createMut = useMutation({
    mutationFn: () => createFn({ data: { boardId } }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const computeActual = (kpi: any) => {
    const items = board.items ?? [];
    const values = board.values ?? [];
    if (kpi.metric === "count_items") return items.length;
    if (kpi.metric === "sum_column" && kpi.column_id) {
      return values
        .filter((v: any) => v.column_id === kpi.column_id)
        .reduce((acc: number, v: any) => acc + (Number(v.number_value) || 0), 0);
    }
    if (kpi.metric === "avg_column" && kpi.column_id) {
      const rows = values.filter((v: any) => v.column_id === kpi.column_id && v.number_value != null);
      if (!rows.length) return 0;
      return rows.reduce((a: number, v: any) => a + Number(v.number_value), 0) / rows.length;
    }
    if (kpi.metric === "count_with_status" && kpi.status_column_id && kpi.status_option_id) {
      return values.filter(
        (v: any) => v.column_id === kpi.status_column_id && v.status_option_id === kpi.status_option_id,
      ).length;
    }
    return 0;
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> KPIs &amp; targets
        </h2>
        <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New KPI
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Set numeric targets so you can see how the board is tracking against goals.
      </p>

      <div className="space-y-3">
        {(kpisQ.data ?? []).length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground text-center">
            No KPIs yet. Click <strong>New KPI</strong> to create one.
          </div>
        )}
        {(kpisQ.data ?? []).map((kpi: any) => {
          const actual = computeActual(kpi);
          const pct = kpi.target > 0 ? Math.min(100, (actual / kpi.target) * 100) : 0;
          return (
            <div key={kpi.id} className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={kpi.name}
                  onChange={(e) =>
                    qc.setQueryData(["kpis", boardId], (old: any[] | undefined) =>
                      (old ?? []).map((k) => (k.id === kpi.id ? { ...k, name: e.target.value } : k)),
                    )
                  }
                  onBlur={(e) => updateFn({ data: { id: kpi.id, name: e.target.value } }).then(invalidate)}
                  className="font-medium border-0 px-0 shadow-none focus-visible:ring-0 h-7"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Delete KPI "${kpi.name}"?`)) {
                      deleteFn({ data: { id: kpi.id } }).then(invalidate);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Metric</Label>
                  <Select
                    value={kpi.metric}
                    onValueChange={(v) => updateFn({ data: { id: kpi.id, metric: v } }).then(invalidate)}
                  >
                    <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="count_items">Count of items</SelectItem>
                      <SelectItem value="sum_column">Sum of a number column</SelectItem>
                      <SelectItem value="avg_column">Average of a number column</SelectItem>
                      <SelectItem value="count_with_status">Count items with status</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(kpi.metric === "sum_column" || kpi.metric === "avg_column") && (
                  <div>
                    <Label className="text-xs">Column</Label>
                    <Select
                      value={kpi.column_id ?? ""}
                      onValueChange={(v) => updateFn({ data: { id: kpi.id, column_id: v } }).then(invalidate)}
                    >
                      <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Pick a column" /></SelectTrigger>
                      <SelectContent>
                        {numberCols.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {kpi.metric === "count_with_status" && (
                  <>
                    <div>
                      <Label className="text-xs">Status column</Label>
                      <Select
                        value={kpi.status_column_id ?? ""}
                        onValueChange={(v) => updateFn({ data: { id: kpi.id, status_column_id: v, status_option_id: null } }).then(invalidate)}
                      >
                        <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Pick" /></SelectTrigger>
                        <SelectContent>
                          {statusCols.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Status option</Label>
                      <Select
                        value={kpi.status_option_id ?? ""}
                        onValueChange={(v) => updateFn({ data: { id: kpi.id, status_option_id: v } }).then(invalidate)}
                      >
                        <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Pick" /></SelectTrigger>
                        <SelectContent>
                          {(statusCols.find((c: any) => c.id === kpi.status_column_id)?.settings?.options ?? []).map((o: any) => (
                            <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div>
                  <Label className="text-xs">Target</Label>
                  <Input
                    type="number"
                    defaultValue={kpi.target}
                    onBlur={(e) => updateFn({ data: { id: kpi.id, target: Number(e.target.value) || 0 } }).then(invalidate)}
                    className="h-8 mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Unit (optional)</Label>
                  <Input
                    defaultValue={kpi.unit ?? ""}
                    placeholder="$, tickets…"
                    onBlur={(e) => updateFn({ data: { id: kpi.id, unit: e.target.value || null } }).then(invalidate)}
                    className="h-8 mt-1"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current</span>
                  <span className="font-medium">
                    {fmt(actual)}{kpi.unit ? ` ${kpi.unit}` : ""} / {fmt(kpi.target)}{kpi.unit ? ` ${kpi.unit}` : ""}
                  </span>
                </div>
                <Progress value={pct} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function fmt(n: number) {
  if (n == null || Number.isNaN(n)) return "0";
  return Math.round(n * 100) / 100 + "";
}

/* -------------------- Statuses -------------------- */

const COLORS = ["#22c55e", "#eab308", "#ef4444", "#3b82f6", "#a855f7", "#ec4899", "#6366f1", "#06b6d4", "#f97316", "#64748b"];

function StatusesSection({ boardId, board }: { boardId: string; board: any }) {
  const qc = useQueryClient();
  const updateColFn = useServerFn(updateColumn);
  const statusCols = (board.columns ?? []).filter((c: any) => c.kind === "status");

  const save = async (col: any, options: any[]) => {
    await updateColFn({ data: { id: col.id, settings: { ...col.settings, options } } });
    qc.invalidateQueries({ queryKey: ["board", boardId] });
  };

  return (
    <section>
      <h2 className="font-semibold flex items-center gap-2 mb-3">
        <CircleDot className="h-4 w-4 text-primary" /> Status columns
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Rename status options and change their colors. Used by the board, automations and KPIs.
      </p>

      {statusCols.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground text-center">
          No status columns on this board.
        </div>
      )}

      <div className="space-y-4">
        {statusCols.map((col: any) => {
          const options: any[] = col.settings?.options ?? [];
          return (
            <div key={col.id} className="rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Input
                  defaultValue={col.title}
                  onBlur={(e) =>
                    updateColFn({ data: { id: col.id, title: e.target.value } }).then(() =>
                      qc.invalidateQueries({ queryKey: ["board", boardId] }),
                    )
                  }
                  className="font-medium border-0 px-0 shadow-none focus-visible:ring-0 h-7 w-auto"
                />
              </div>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <Select
                      value={opt.color}
                      onValueChange={(v) => {
                        const next = options.map((o, idx) => (idx === i ? { ...o, color: v } : o));
                        save(col, next);
                      }}
                    >
                      <SelectTrigger className="h-8 w-12 p-1">
                        <div className="h-5 w-full rounded" style={{ background: opt.color }} />
                      </SelectTrigger>
                      <SelectContent>
                        {COLORS.map((c) => (
                          <SelectItem key={c} value={c}>
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded" style={{ background: c }} />
                              <span className="text-xs">{c}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      defaultValue={opt.label}
                      onBlur={(e) => {
                        const next = options.map((o, idx) => (idx === i ? { ...o, label: e.target.value } : o));
                        save(col, next);
                      }}
                      className="h-8 flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Delete option "${opt.label}"?`)) {
                          save(col, options.filter((_, idx) => idx !== i));
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    save(col, [
                      ...options,
                      { id: `opt_${Date.now()}`, label: "New option", color: COLORS[options.length % COLORS.length] },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add option
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------- Externals -------------------- */

function ExternalsSection({ boardId }: { boardId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listExternals);
  const createFn = useServerFn(createExternal);
  const updateFn = useServerFn(updateExternal);
  const deleteFn = useServerFn(deleteExternal);
  const extQ = useQuery({
    queryKey: ["externals", boardId],
    queryFn: () => listFn({ data: { boardId } }),
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["externals", boardId] });

  const add = async () => {
    if (!name.trim()) return;
    try {
      await createFn({ data: { boardId, name: name.trim(), email: email.trim() || undefined } });
      setName("");
      setEmail("");
      invalidate();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  };

  return (
    <section>
      <h2 className="font-semibold flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-primary" /> External assignees
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        People who aren't workspace members but can be tagged in the People column (vendors, freelancers, contacts).
      </p>

      <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/60">
        {(extQ.data ?? []).map((e: any) => (
          <div key={e.id} className="flex items-center gap-2 p-3">
            <Input
              defaultValue={e.name}
              onBlur={(ev) => updateFn({ data: { id: e.id, name: ev.target.value } }).then(invalidate)}
              className="h-8 max-w-xs"
            />
            <Input
              defaultValue={e.email ?? ""}
              placeholder="Email (optional)"
              onBlur={(ev) => updateFn({ data: { id: e.id, email: ev.target.value } }).then(invalidate)}
              className="h-8 max-w-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              onClick={() => {
                if (confirm(`Delete ${e.name}?`)) {
                  deleteFn({ data: { id: e.id } }).then(invalidate);
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2 p-3 bg-muted/20">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 max-w-xs"
          />
          <Input
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-8 max-w-sm"
          />
          <Button size="sm" onClick={add} disabled={!name.trim()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>
    </section>
  );
}

/* -------------------- Automations hint -------------------- */

function AutomationsHintSection({ workspaceId, boardId }: { workspaceId: string; boardId: string }) {
  return (
    <section>
      <h2 className="font-semibold flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-primary" /> Automations
      </h2>
      <div className="rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
        Automations now support more triggers (item created, item updated, specific column changed, comment added, activity added)
        and a <strong>Notify assignees</strong> action. Open the{" "}
        <Link
          to="/w/$workspaceId/b/$boardId/automations"
          params={{ workspaceId, boardId }}
          className="text-primary underline"
        >
          Automations editor
        </Link>{" "}
        to configure them.
      </div>
    </section>
  );
}