import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Trash2,
  Type,
  Hash,
  Calendar as CalIcon,
  CircleDot,
  Users,
  Link2,
  Expand,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getBoard,
  createGroup,
  updateGroup,
  deleteGroup,
  createItem,
  updateItem,
  deleteItem,
  createColumn,
  deleteColumn,
  upsertValue,
  updateBoard,
} from "@/lib/boards.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { KanbanView, CalendarView, WorkloadView } from "@/components/board/views";
import { ItemDrawer } from "@/components/board/item-drawer";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/b/$boardId")({
  component: BoardCanvas,
});

type Col = {
  id: string;
  kind: string;
  title: string;
  settings: any;
  position: number;
  width: number | null;
};
type Group = { id: string; name: string; color: string; position: number; collapsed: boolean };
type Item = { id: string; group_id: string | null; title: string; position: number };
type Val = {
  item_id: string;
  column_id: string;
  text_value: string | null;
  number_value: number | null;
  date_value: string | null;
  date_end_value: string | null;
  link_url: string | null;
  link_label: string | null;
  status_option_id: string | null;
  people_user_ids: string[] | null;
};

function BoardCanvas() {
  const { boardId, workspaceId } = Route.useParams();
  const qc = useQueryClient();

  const getBoardFn = useServerFn(getBoard);
  const createGroupFn = useServerFn(createGroup);
  const updateGroupFn = useServerFn(updateGroup);
  const deleteGroupFn = useServerFn(deleteGroup);
  const createItemFn = useServerFn(createItem);
  const updateItemFn = useServerFn(updateItem);
  const deleteItemFn = useServerFn(deleteItem);
  const createColumnFn = useServerFn(createColumn);
  const deleteColumnFn = useServerFn(deleteColumn);
  const upsertValueFn = useServerFn(upsertValue);
  const updateBoardFn = useServerFn(updateBoard);

  const key = ["board", boardId] as const;
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => getBoardFn({ data: { id: boardId } }),
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`board:${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `board_id=eq.${boardId}` }, () =>
        qc.invalidateQueries({ queryKey: key }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "groups", filter: `board_id=eq.${boardId}` }, () =>
        qc.invalidateQueries({ queryKey: key }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "board_columns", filter: `board_id=eq.${boardId}` }, () =>
        qc.invalidateQueries({ queryKey: key }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "item_values" }, () =>
        qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [boardId, qc]);

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const valuesByItem = useMemo(() => {
    const m = new Map<string, Map<string, Val>>();
    (data?.values ?? []).forEach((v: any) => {
      if (!m.has(v.item_id)) m.set(v.item_id, new Map());
      m.get(v.item_id)!.set(v.column_id, v);
    });
    return m;
  }, [data?.values]);

  const itemsByGroup = useMemo(() => {
    const m = new Map<string, Item[]>();
    (data?.items ?? []).forEach((i: any) => {
      if (i.parent_item_id) return;
      const k = i.group_id ?? "__none";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    });
    return m;
  }, [data?.items]);

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-muted-foreground">Loading board…</div>;
  }

  const columns = (data.columns ?? []) as Col[];
  const groups = (data.groups ?? []) as Group[];
  const views = (data.views ?? []) as { id: string; kind: string; name: string }[];
  const allItems = ((data.items ?? []) as any[]).filter((i) => !i.parent_item_id) as Item[];

  const tableView = views.find((v) => v.kind === "table") ?? views[0];
  const [activeViewId, setActiveViewId] = useState<string | null>(tableView?.id ?? null);
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);
  const activeView =
    views.find((v) => v.id === activeViewId) ?? tableView ?? { id: "", kind: "table", name: "Table" };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Board header */}
      <div className="border-b border-border/60 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-6 w-1 rounded" style={{ background: data.board.color ?? "#6366f1" }} />
          <InlineEdit
            value={data.board.name}
            onSave={(v) =>
              updateBoardFn({ data: { id: boardId, name: v } }).then(invalidate)
            }
            className="text-xl font-semibold tracking-tight"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border/60 p-1">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => setActiveViewId(v.id)}
              className={cn(
                "px-2.5 py-1 text-xs rounded font-medium transition-colors",
                activeView.id === v.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>

      {activeView.kind === "table" && (
        <div className="flex-1 overflow-auto px-6 py-5">
        <div className="space-y-6 min-w-fit">
          {groups.map((g) => (
            <GroupSection
              key={g.id}
              group={g}
              columns={columns}
              items={itemsByGroup.get(g.id) ?? []}
              values={valuesByItem}
              onAddItem={() =>
                createItemFn({ data: { boardId, groupId: g.id, title: "New item" } }).then(invalidate)
              }
              onDeleteGroup={() => {
                if (confirm(`Delete group "${g.name}" and all its items?`))
                  deleteGroupFn({ data: { id: g.id } }).then(invalidate);
              }}
              onUpdateGroup={(patch) =>
                updateGroupFn({ data: { id: g.id, ...patch } }).then(invalidate)
              }
              onUpdateItem={(id, title) =>
                updateItemFn({ data: { id, title } }).then(invalidate)
              }
              onDeleteItem={(id) => deleteItemFn({ data: { id } }).then(invalidate)}
              onUpsertValue={(p) => upsertValueFn({ data: p }).then(invalidate)}
              onAddColumn={(kind, title) =>
                createColumnFn({ data: { boardId, kind, title } }).then(invalidate)
              }
              onDeleteColumn={(id) =>
                deleteColumnFn({ data: { id } }).then(invalidate)
              }
              onOpenItem={setDrawerItemId}
            />
          ))}

          <button
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
            onClick={() =>
              createGroupFn({ data: { boardId, name: "New group" } }).then(invalidate)
            }
          >
            <Plus className="h-4 w-4" /> Add group
          </button>
        </div>
        </div>
      )}

      {activeView.kind === "kanban" && (
        <div className="flex-1 min-h-0">
          <KanbanView
            items={allItems}
            columns={columns}
            values={valuesByItem}
            onUpsertValue={(p) => upsertValueFn({ data: p }).then(invalidate)}
            onOpenItem={setDrawerItemId}
          />
        </div>
      )}

      {activeView.kind === "calendar" && (
        <div className="flex-1 min-h-0">
          <CalendarView items={allItems} columns={columns} values={valuesByItem} />
        </div>
      )}

      {activeView.kind === "workload" && (
        <div className="flex-1 min-h-0">
          <WorkloadView items={allItems} columns={columns} values={valuesByItem} />
        </div>
      )}
      <ItemDrawer itemId={drawerItemId} onClose={() => setDrawerItemId(null)} />
    </div>
  );
}

/* ---------------- group section ---------------- */

function GroupSection(props: {
  group: Group;
  columns: Col[];
  items: Item[];
  values: Map<string, Map<string, Val>>;
  onAddItem: () => void;
  onDeleteGroup: () => void;
  onUpdateGroup: (patch: Partial<Group>) => void;
  onUpdateItem: (id: string, title: string) => void;
  onDeleteItem: (id: string) => void;
  onUpsertValue: (p: any) => Promise<unknown>;
  onAddColumn: (kind: string, title: string) => void;
  onDeleteColumn: (id: string) => void;
  onOpenItem: (id: string) => void;
}) {
  const { group, columns, items, values } = props;
  const collapsed = group.collapsed;

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden bg-card/30">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => props.onUpdateGroup({ collapsed: !collapsed })}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button className="h-3 w-3 rounded-sm shrink-0" style={{ background: group.color }} />
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2">
            <div className="grid grid-cols-6 gap-1.5">
              {[
                "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981", "#14b8a6",
                "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#64748b",
              ].map((c) => (
                <button
                  key={c}
                  className="h-6 w-6 rounded-md border border-border/60"
                  style={{ background: c }}
                  onClick={() => props.onUpdateGroup({ color: c })}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <InlineEdit
          value={group.name}
          onSave={(v) => props.onUpdateGroup({ name: v })}
          className="font-medium text-sm"
          style={{ color: group.color }}
        />
        <span className="text-xs text-muted-foreground">{items.length} items</span>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-6 grid place-items-center rounded hover:bg-muted text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={props.onAddItem}>
                <Plus className="h-3.5 w-3.5 mr-2" /> Add item
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={props.onDeleteGroup} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                <th className="text-left font-medium px-3 py-2 sticky left-0 bg-muted/30 z-10 min-w-[280px] border-r border-border/40">
                  Item
                </th>
                {columns.map((c) => (
                  <th key={c.id} className="text-left font-medium px-3 py-2 min-w-[160px] border-r border-border/40">
                    <div className="flex items-center gap-2">
                      <ColIcon kind={c.kind} />
                      <span>{c.title}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="ml-auto opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5">
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm(`Delete column "${c.title}"?`)) props.onDeleteColumn(c.id);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete column
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </th>
                ))}
                <th className="text-left font-medium px-2 py-2 w-10">
                  <AddColumnMenu onAdd={props.onAddColumn} />
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-border/40 hover:bg-muted/20 group">
                  <td className="px-3 py-1.5 sticky left-0 bg-background z-10 border-r border-border/40 group-hover:bg-muted/20">
                    <div className="flex items-center gap-2">
                      <InlineEdit
                        value={it.title}
                        onSave={(v) => props.onUpdateItem(it.id, v)}
                        className="flex-1 text-sm"
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="opacity-0 group-hover:opacity-100 h-6 w-6 grid place-items-center rounded hover:bg-muted text-muted-foreground">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => props.onDeleteItem(it.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete item
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                  {columns.map((c) => (
                    <td key={c.id} className="px-2 py-1 border-r border-border/40 align-middle">
                      <Cell
                        column={c}
                        value={values.get(it.id)?.get(c.id) ?? null}
                        onSave={(patch) =>
                          props.onUpsertValue({ itemId: it.id, columnId: c.id, ...patch })
                        }
                      />
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
              <tr>
                <td colSpan={columns.length + 2} className="px-3 py-2 border-t border-border/40">
                  <button
                    onClick={props.onAddItem}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add item
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- cells per kind ---------------- */

function Cell({
  column,
  value,
  onSave,
}: {
  column: Col;
  value: Val | null;
  onSave: (patch: Record<string, any>) => Promise<unknown> | void;
}) {
  if (column.kind === "status") {
    const opts: { id: string; label: string; color: string }[] = column.settings?.options ?? [];
    const current = opts.find((o) => o.id === value?.status_option_id) ?? null;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "w-full h-7 rounded text-xs font-medium px-2 text-white",
              !current && "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
            style={current ? { background: current.color } : undefined}
          >
            {current?.label ?? "—"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1.5">
          <div className="space-y-1">
            {opts.map((o) => (
              <button
                key={o.id}
                className="w-full text-left text-xs text-white rounded px-2 py-1.5 font-medium hover:opacity-90"
                style={{ background: o.color }}
                onClick={() => onSave({ status_option_id: o.id })}
              >
                {o.label}
              </button>
            ))}
            <button
              className="w-full text-left text-xs text-muted-foreground rounded px-2 py-1.5 hover:bg-muted"
              onClick={() => onSave({ status_option_id: null })}
            >
              Clear
            </button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
  if (column.kind === "number") {
    return (
      <InlineEdit
        value={value?.number_value != null ? String(value.number_value) : ""}
        placeholder="—"
        onSave={(v) => {
          const n = v.trim() === "" ? null : Number(v);
          if (n !== null && Number.isNaN(n)) return;
          onSave({ number_value: n });
        }}
        className="text-sm w-full"
      />
    );
  }
  if (column.kind === "date") {
    const v = value?.date_value ? value.date_value.slice(0, 10) : "";
    return (
      <input
        type="date"
        value={v}
        onChange={(e) => onSave({ date_value: e.target.value || null })}
        className="bg-transparent text-sm w-full px-1 py-1 rounded hover:bg-muted/40 focus:bg-muted/40 outline-none"
      />
    );
  }
  if (column.kind === "link") {
    return (
      <InlineEdit
        value={value?.link_url ?? ""}
        placeholder="https://…"
        onSave={(url) => onSave({ link_url: url || null, link_label: url || null })}
        className="text-sm text-primary underline-offset-2 hover:underline"
      />
    );
  }
  if (column.kind === "people") {
    return (
      <div className="text-xs text-muted-foreground italic px-1">People picker — soon</div>
    );
  }
  // text & default
  return (
    <InlineEdit
      value={value?.text_value ?? ""}
      placeholder="—"
      onSave={(v) => onSave({ text_value: v || null })}
      className="text-sm w-full"
    />
  );
}

/* ---------------- inline edit ---------------- */

function InlineEdit({
  value,
  onSave,
  className,
  style,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (editing) {
    return (
      <input
        autoFocus
        className={cn(
          "bg-transparent outline-none w-full px-1 py-0.5 rounded ring-1 ring-primary/40 focus:ring-primary",
          className,
        )}
        style={style}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onSave(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      className={cn(
        "text-left w-full px-1 py-0.5 rounded hover:bg-muted/40 truncate",
        !value && "text-muted-foreground",
        className,
      )}
      style={style}
      onClick={() => setEditing(true)}
    >
      {value || placeholder || "—"}
    </button>
  );
}

/* ---------------- helpers ---------------- */

function ColIcon({ kind }: { kind: string }) {
  const C =
    kind === "status"
      ? CircleDot
      : kind === "people"
        ? Users
        : kind === "date" || kind === "timeline"
          ? CalIcon
          : kind === "number" || kind === "formula"
            ? Hash
            : kind === "link"
              ? Link2
              : Type;
  return <C className="h-3 w-3 text-muted-foreground" />;
}

function AddColumnMenu({ onAdd }: { onAdd: (kind: string, title: string) => void }) {
  const kinds: { kind: string; title: string; label: string }[] = [
    { kind: "text", title: "Text", label: "Text" },
    { kind: "status", title: "Status", label: "Status" },
    { kind: "people", title: "People", label: "People" },
    { kind: "date", title: "Date", label: "Date" },
    { kind: "number", title: "Number", label: "Number" },
    { kind: "link", title: "Link", label: "Link" },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="h-7 w-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"
          aria-label="Add column"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {kinds.map((k) => (
          <DropdownMenuItem key={k.kind} onClick={() => onAdd(k.kind, k.title)}>
            <ColIcon kind={k.kind} />
            <span className="ml-2">{k.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}