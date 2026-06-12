import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
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
  FileText,
  Zap,
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
import { PeoplePicker } from "@/components/board/people-picker";

type Col = {
  id: string;
  kind: string;
  title: string;
  settings: any;
  position: number;
  width: number | null;
};

type Group = {
  id: string;
  name: string;
  color: string;
  position: number;
  collapsed: boolean;
};

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

export function BoardCanvas({
  boardId,
  workspaceId,
}: {
  boardId: string;
  workspaceId: string;
}) {
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
  }, [boardId, key, qc]);

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const valuesByItem = useMemo(() => {
    const map = new Map<string, Map<string, Val>>();

    (data?.values ?? []).forEach((value: any) => {
      if (!map.has(value.item_id)) {
        map.set(value.item_id, new Map());
      }

      map.get(value.item_id)!.set(value.column_id, value);
    });

    return map;
  }, [data?.values]);

  const itemsByGroup = useMemo(() => {
    const map = new Map<string, Item[]>();

    (data?.items ?? []).forEach((item: any) => {
      if (item.parent_item_id) return;

      const groupKey = item.group_id ?? "__none";

      if (!map.has(groupKey)) {
        map.set(groupKey, []);
      }

      map.get(groupKey)!.push(item);
    });

    return map;
  }, [data?.items]);

  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-muted-foreground">Loading board…</div>;
  }

  const columns = (data.columns ?? []) as Col[];
  const groups = (data.groups ?? []) as Group[];
  const views = (data.views ?? []) as { id: string; kind: string; name: string }[];
  const allItems = ((data.items ?? []) as any[]).filter((item) => !item.parent_item_id) as Item[];
  const tableView = views.find((view) => view.kind === "table") ?? views[0];
  const activeView =
    views.find((view) => view.id === activeViewId) ??
    tableView ??
    { id: "", kind: "table", name: "Table" };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border/60 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-6 w-1 rounded" style={{ background: data.board.color ?? "#6366f1" }} />
          <InlineEdit
            value={data.board.name}
            onSave={(name) => updateBoardFn({ data: { id: boardId, name } }).then(invalidate)}
            className="text-xl font-semibold tracking-tight"
          />
        </div>

        <div className="flex items-center gap-1 rounded-md border border-border/60 p-1">
          {views.map((view) => (
            <button
              key={view.id}
              onClick={() => setActiveViewId(view.id)}
              className={cn(
                "px-2.5 py-1 text-xs rounded font-medium transition-colors",
                activeView.id === view.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              {view.name}
            </button>
          ))}
        </div>

        <Link
          to="/w/$workspaceId/b/$boardId/forms"
          params={{ workspaceId, boardId }}
          className="ml-3 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <FileText className="h-3.5 w-3.5" /> Forms
        </Link>

        <Link
          to="/w/$workspaceId/b/$boardId/automations"
          params={{ workspaceId, boardId }}
          className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <Zap className="h-3.5 w-3.5" /> Automations
        </Link>
      </div>

      {activeView.kind === "table" && (
        <div className="flex-1 overflow-auto px-6 py-5">
          <div className="space-y-6 min-w-fit">
            {groups.map((group) => (
              <GroupSection
                key={group.id}
                group={group}
                columns={columns}
                items={itemsByGroup.get(group.id) ?? []}
                values={valuesByItem}
                workspaceId={workspaceId}
                onAddItem={() =>
                  createItemFn({ data: { boardId, groupId: group.id, title: "New item" } }).then(invalidate)
                }
                onDeleteGroup={() => {
                  if (confirm(`Delete group "${group.name}" and all its items?`)) {
                    deleteGroupFn({ data: { id: group.id } }).then(invalidate);
                  }
                }}
                onUpdateGroup={(patch) =>
                  updateGroupFn({ data: { id: group.id, ...patch } }).then(invalidate)
                }
                onUpdateItem={(id, title) => updateItemFn({ data: { id, title } }).then(invalidate)}
                onDeleteItem={(id) => deleteItemFn({ data: { id } }).then(invalidate)}
                onUpsertValue={(payload) => upsertValueFn({ data: payload }).then(invalidate)}
                onAddColumn={(kind, title) =>
                  createColumnFn({ data: { boardId, kind, title } }).then(invalidate)
                }
                onDeleteColumn={(id) => deleteColumnFn({ data: { id } }).then(invalidate)}
                onOpenItem={setDrawerItemId}
              />
            ))}

            <button
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              onClick={() => createGroupFn({ data: { boardId, name: "New group" } }).then(invalidate)}
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
            onUpsertValue={(payload) => upsertValueFn({ data: payload }).then(invalidate)}
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

function GroupSection(props: {
  group: Group;
  columns: Col[];
  items: Item[];
  values: Map<string, Map<string, Val>>;
  workspaceId: string;
  onAddItem: () => void;
  onDeleteGroup: () => void;
  onUpdateGroup: (patch: Partial<Group>) => void;
  onUpdateItem: (id: string, title: string) => void;
  onDeleteItem: (id: string) => void;
  onUpsertValue: (payload: any) => Promise<unknown>;
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
                "#ef4444",
                "#f97316",
                "#f59e0b",
                "#84cc16",
                "#10b981",
                "#14b8a6",
                "#06b6d4",
                "#3b82f6",
                "#6366f1",
                "#8b5cf6",
                "#ec4899",
                "#64748b",
              ].map((color) => (
                <button
                  key={color}
                  className="h-6 w-6 rounded-md border border-border/60"
                  style={{ background: color }}
                  onClick={() => props.onUpdateGroup({ color })}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <InlineEdit
          value={group.name}
          onSave={(name) => props.onUpdateGroup({ name })}
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
                {columns.map((column) => (
                  <th
                    key={column.id}
                    className="text-left font-medium px-3 py-2 min-w-[160px] border-r border-border/40"
                  >
                    <div className="flex items-center gap-2">
                      <ColIcon kind={column.kind} />
                      <span>{column.title}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="ml-auto opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5">
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm(`Delete column "${column.title}"?`)) {
                                props.onDeleteColumn(column.id);
                              }
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
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border/40 hover:bg-muted/20 group">
                  <td className="px-3 py-1.5 sticky left-0 bg-background z-10 border-r border-border/40 group-hover:bg-muted/20">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => props.onOpenItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 h-5 w-5 grid place-items-center rounded hover:bg-muted text-muted-foreground shrink-0"
                        aria-label="Open item"
                      >
                        <Expand className="h-3 w-3" />
                      </button>
                      <InlineEdit
                        value={item.title}
                        onSave={(title) => props.onUpdateItem(item.id, title)}
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
                            onClick={() => props.onDeleteItem(item.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete item
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>

                  {columns.map((column) => (
                    <td key={column.id} className="px-2 py-1 border-r border-border/40 align-middle">
                      <Cell
                        column={column}
                        value={values.get(item.id)?.get(column.id) ?? null}
                        workspaceId={props.workspaceId}
                        onSave={(patch) => props.onUpsertValue({ itemId: item.id, columnId: column.id, ...patch })}
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

function Cell({
  column,
  value,
  workspaceId,
  onSave,
}: {
  column: Col;
  value: Val | null;
  workspaceId: string;
  onSave: (patch: Record<string, any>) => Promise<unknown> | void;
}) {
  if (column.kind === "status") {
    const options: { id: string; label: string; color: string }[] = column.settings?.options ?? [];
    const current = options.find((option) => option.id === value?.status_option_id) ?? null;

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
            {options.map((option) => (
              <button
                key={option.id}
                className="w-full text-left text-xs text-white rounded px-2 py-1.5 font-medium hover:opacity-90"
                style={{ background: option.color }}
                onClick={() => onSave({ status_option_id: option.id })}
              >
                {option.label}
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
        onSave={(nextValue) => {
          const parsed = nextValue.trim() === "" ? null : Number(nextValue);
          if (parsed !== null && Number.isNaN(parsed)) return;
          onSave({ number_value: parsed });
        }}
        className="text-sm w-full"
      />
    );
  }

  if (column.kind === "date") {
    const nextValue = value?.date_value ? value.date_value.slice(0, 10) : "";

    return (
      <input
        type="date"
        value={nextValue}
        onChange={(event) => onSave({ date_value: event.target.value || null })}
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
      <PeoplePicker
        workspaceId={workspaceId}
        value={value?.people_user_ids ?? []}
        onChange={(people_user_ids) => onSave({ people_user_ids })}
      />
    );
  }

  return (
    <InlineEdit
      value={value?.text_value ?? ""}
      placeholder="—"
      onSave={(text_value) => onSave({ text_value: text_value || null })}
      className="text-sm w-full"
    />
  );
}

function InlineEdit({
  value,
  onSave,
  className,
  style,
  placeholder,
}: {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  style?: CSSProperties;
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
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onSave(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
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

function ColIcon({ kind }: { kind: string }) {
  const Icon =
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

  return <Icon className="h-3 w-3 text-muted-foreground" />;
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
        {kinds.map((kind) => (
          <DropdownMenuItem key={kind.kind} onClick={() => onAdd(kind.kind, kind.title)}>
            <ColIcon kind={kind.kind} />
            <span className="ml-2">{kind.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}