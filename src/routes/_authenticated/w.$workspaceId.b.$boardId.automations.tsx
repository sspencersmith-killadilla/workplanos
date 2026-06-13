import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Zap, Bell, CircleDot, Users } from "lucide-react";
import { getBoard } from "@/lib/boards.functions";
import {
  listAutomations,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  listAutomationRuns,
} from "@/lib/automations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_authenticated/w/$workspaceId/b/$boardId/automations",
)({
  component: AutomationsPage,
});

type StatusCol = {
  id: string;
  title: string;
  kind: string;
  settings: { options?: { id: string; label: string; color?: string }[] };
};

function AutomationsPage() {
  const { workspaceId, boardId } = Route.useParams();
  const qc = useQueryClient();

  const getBoardFn = useServerFn(getBoard);
  const listFn = useServerFn(listAutomations);
  const createFn = useServerFn(createAutomation);
  const updateFn = useServerFn(updateAutomation);
  const deleteFn = useServerFn(deleteAutomation);
  const listRunsFn = useServerFn(listAutomationRuns);

  const boardQ = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => getBoardFn({ data: { id: boardId } }),
  });

  const rulesKey = ["automations", boardId] as const;
  const rulesQ = useQuery({
    queryKey: rulesKey,
    queryFn: () => listFn({ data: { boardId } }),
  });
  const runsQ = useQuery({
    queryKey: ["automation-runs", boardId],
    queryFn: () => listRunsFn({ data: { boardId } }),
  });

  const statusCols = useMemo(
    () =>
      ((boardQ.data?.columns ?? []) as any[]).filter(
        (c) => c.kind === "status",
      ) as StatusCol[],
    [boardQ.data?.columns],
  );
  const allCols = useMemo(
    () => ((boardQ.data?.columns ?? []) as any[]),
    [boardQ.data?.columns],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: rulesKey });
    qc.invalidateQueries({ queryKey: ["automation-runs", boardId] });
  };

  const createMut = useMutation({
    mutationFn: () => {
      const firstCol = statusCols[0];
      const firstOpt = firstCol?.settings?.options?.[0];
      if (!firstCol || !firstOpt) {
        throw new Error("Add a status column with options first.");
      }
      return createFn({
        data: {
          boardId,
          name: "New automation",
          trigger: {
            kind: "status_change",
            columnId: firstCol.id,
            optionId: firstOpt.id,
          },
          actions: [{ kind: "notify", message: "An item status changed" }],
        },
      });
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  if (boardQ.isLoading || rulesQ.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading automations…</div>;
  }

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
          <Zap className="h-4 w-4 text-primary" /> Automations ·{" "}
          <span className="text-muted-foreground">{boardQ.data?.board.name}</span>
        </h1>
        <div className="ml-auto">
          <Button
            size="sm"
            disabled={createMut.isPending || statusCols.length === 0}
            onClick={() => createMut.mutate()}
          >
            <Plus className="h-4 w-4 mr-1.5" /> New rule
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {statusCols.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground text-center">
              Add a <strong>Status</strong> column on the board to start
              creating automations.
            </div>
          )}

          {(rulesQ.data ?? []).length === 0 && statusCols.length > 0 && (
            <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
              <Zap className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No automations yet. Create a rule to react to status changes.
              </p>
            </div>
          )}

          {(rulesQ.data ?? []).map((rule: any) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              statusCols={statusCols}
              allCols={allCols}
              onSave={async (patch) => {
                await updateFn({ data: { id: rule.id, ...patch } });
                invalidate();
              }}
              onDelete={async () => {
                if (confirm(`Delete automation "${rule.name}"?`)) {
                  await deleteFn({ data: { id: rule.id } });
                  invalidate();
                }
              }}
            />
          ))}

          <div>
            <h2 className="text-sm font-semibold mb-2">Recent runs</h2>
            <div className="rounded-lg border border-border/60 divide-y divide-border/60 text-sm bg-card/30">
              {(runsQ.data ?? []).length === 0 && (
                <p className="p-4 text-xs text-muted-foreground text-center">
                  No runs yet. Rules fire when an item's status matches the
                  trigger.
                </p>
              )}
              {(runsQ.data ?? []).map((r: any) => (
                <div
                  key={r.id}
                  className="p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        r.status === "ok" ? "bg-emerald-500" : "bg-destructive"
                      }`}
                    />
                    <span className="truncate font-medium">{r.rule_name}</span>
                    {r.error && (
                      <span className="text-xs text-destructive truncate">
                        {r.error}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(r.ran_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleCard(props: {
  rule: any;
  statusCols: StatusCol[];
  onSave: (patch: any) => Promise<void>;
  onDelete: () => void;
}) {
  const { rule, statusCols } = props;
  const [name, setName] = useState<string>(rule.name);
  const [trigger, setTrigger] = useState(rule.trigger);
  const [actions, setActions] = useState<any[]>(
    Array.isArray(rule.actions) ? rule.actions : [],
  );
  const [enabled, setEnabled] = useState<boolean>(!!rule.enabled);
  const [saving, setSaving] = useState(false);

  const triggerCol = statusCols.find((c) => c.id === trigger?.columnId);

  const save = async (overrides: Partial<{ enabled: boolean }> = {}) => {
    setSaving(true);
    try {
      await props.onSave({
        name,
        trigger,
        actions,
        enabled: overrides.enabled ?? enabled,
      });
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="font-medium border-0 px-0 shadow-none focus-visible:ring-0 h-7"
        />
        <div className="ml-auto flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              setEnabled(v);
              save({ enabled: v });
            }}
          />
          <span className="text-xs text-muted-foreground">
            {enabled ? "On" : "Off"}
          </span>
          <Button variant="ghost" size="icon" onClick={props.onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Trigger */}
        <div className="rounded-lg border border-border/60 p-3 bg-muted/20">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            When
          </Label>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Select
              value={trigger?.kind ?? "status_change"}
              onValueChange={(v) => {
                if (v === "status_change") {
                  const col = statusCols[0];
                  setTrigger({ kind: "status_change", columnId: col?.id ?? "", optionId: col?.settings?.options?.[0]?.id ?? "" });
                } else if (v === "column_changed") {
                  setTrigger({ kind: "column_changed", columnId: statusCols[0]?.id ?? "" });
                } else {
                  setTrigger({ kind: v });
                }
              }}
            >
              <SelectTrigger className="w-56 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="status_change">Status changes to…</SelectItem>
                <SelectItem value="column_changed">A specific column changes</SelectItem>
                <SelectItem value="item_created">An item is created</SelectItem>
                <SelectItem value="item_updated">Any item value is updated</SelectItem>
                <SelectItem value="comment_added">A comment is added</SelectItem>
                <SelectItem value="activity_added">Any activity happens</SelectItem>
              </SelectContent>
            </Select>

            {trigger?.kind === "status_change" && (
              <>
                <span>on</span>
                <Select
                  value={trigger.columnId}
                  onValueChange={(v) => {
                    const col = statusCols.find((c) => c.id === v);
                    const firstOpt = col?.settings?.options?.[0]?.id ?? "";
                    setTrigger({ kind: "status_change", columnId: v, optionId: firstOpt });
                  }}
                >
                  <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusCols.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>to</span>
                <Select
                  value={trigger.optionId}
                  onValueChange={(v) => setTrigger({ ...trigger, optionId: v })}
                >
                  <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(triggerCol?.settings?.options ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {trigger?.kind === "column_changed" && (
              <>
                <span>:</span>
                <Select
                  value={trigger.columnId}
                  onValueChange={(v) => setTrigger({ kind: "column_changed", columnId: v })}
                >
                  <SelectTrigger className="w-56 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {((props as any).allColumns ?? []).length > 0
                      ? (props as any).allColumns.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                        ))
                      : statusCols.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Then
          </Label>
          <div className="mt-2 space-y-2">
            {actions.map((a, i) => (
              <ActionRow
                key={i}
                action={a}
                statusCols={statusCols}
                onChange={(next) =>
                  setActions((s) => s.map((x, idx) => (idx === i ? next : x)))
                }
                onRemove={() =>
                  setActions((s) => s.filter((_, idx) => idx !== i))
                }
              />
            ))}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setActions((s) => [
                    ...s,
                    { kind: "notify", message: "Status changed" },
                  ])
                }
              >
                <Bell className="h-3.5 w-3.5 mr-1.5" /> Notify
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setActions((s) => [
                    ...s,
                    { kind: "notify_people", message: "You were notified" },
                  ])
                }
              >
                <Users className="h-3.5 w-3.5 mr-1.5" /> Notify assignees
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={statusCols.length === 0}
                onClick={() => {
                  const col = statusCols[0];
                  const opt = col?.settings?.options?.[0];
                  if (!col || !opt) return;
                  setActions((s) => [
                    ...s,
                    {
                      kind: "set_status",
                      columnId: col.id,
                      optionId: opt.id,
                    },
                  ]);
                }}
              >
                <CircleDot className="h-3.5 w-3.5 mr-1.5" /> Set status
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActionRow(props: {
  action: any;
  statusCols: StatusCol[];
  onChange: (next: any) => void;
  onRemove: () => void;
}) {
  const { action, statusCols } = props;
  if (action.kind === "notify") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-16">Notify:</span>
        <Input
          value={action.message ?? ""}
          onChange={(e) => props.onChange({ ...action, message: e.target.value })}
          placeholder="Notification message"
          className="h-8"
        />
        <Button variant="ghost" size="icon" onClick={props.onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    );
  }
  const col = statusCols.find((c) => c.id === action.columnId);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground w-16">Set:</span>
      <Select
        value={action.columnId}
        onValueChange={(v) => {
          const c = statusCols.find((x) => x.id === v);
          const optId = c?.settings?.options?.[0]?.id ?? "";
          props.onChange({ kind: "set_status", columnId: v, optionId: optId });
        }}
      >
        <SelectTrigger className="w-40 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusCols.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm">to</span>
      <Select
        value={action.optionId}
        onValueChange={(v) => props.onChange({ ...action, optionId: v })}
      >
        <SelectTrigger className="w-40 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(col?.settings?.options ?? []).map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" onClick={props.onRemove}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}