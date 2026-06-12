import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------ shared types ------------ */

export type Col = {
  id: string;
  kind: string;
  title: string;
  settings: any;
  position: number;
  width: number | null;
};
export type Group = {
  id: string;
  name: string;
  color: string;
  position: number;
  collapsed: boolean;
};
export type Item = {
  id: string;
  group_id: string | null;
  title: string;
  position: number;
};
export type Val = {
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

type StatusOpt = { id: string; label: string; color: string };

function statusColumns(columns: Col[]): Col[] {
  return columns.filter((c) => c.kind === "status");
}
function dateColumns(columns: Col[]): Col[] {
  return columns.filter((c) => c.kind === "date" || c.kind === "timeline");
}

function getVal(
  values: Map<string, Map<string, Val>>,
  itemId: string,
  columnId: string,
): Val | null {
  return values.get(itemId)?.get(columnId) ?? null;
}

/* ============================================================
   KANBAN VIEW
   ============================================================ */

export function KanbanView({
  items,
  columns,
  values,
  onUpsertValue,
}: {
  items: Item[];
  columns: Col[];
  values: Map<string, Map<string, Val>>;
  onUpsertValue: (p: any) => Promise<unknown>;
}) {
  const statusCols = statusColumns(columns);
  const [statusColId, setStatusColId] = useState<string | null>(
    statusCols[0]?.id ?? null,
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  if (!statusColId) {
    return (
      <EmptyState>
        Add a Status column to enable the Kanban view.
      </EmptyState>
    );
  }
  const activeStatusColId: string = statusColId;
  const col = statusCols.find((c) => c.id === activeStatusColId)!;
  const opts: StatusOpt[] = col.settings?.options ?? [];
  const NONE = "__none";
  const lanes: { id: string; label: string; color: string }[] = [
    ...opts.map((o) => ({ id: o.id, label: o.label, color: o.color })),
    { id: NONE, label: "No status", color: "var(--muted)" },
  ];

  const byLane = new Map<string, Item[]>();
  for (const lane of lanes) byLane.set(lane.id, []);
  for (const it of items) {
    const v = getVal(values, it.id, activeStatusColId);
    const sid = v?.status_option_id ?? NONE;
    if (!byLane.has(sid)) byLane.set(NONE, byLane.get(NONE) ?? []);
    (byLane.get(sid) ?? byLane.get(NONE)!).push(it);
  }

  const dragItem = items.find((i) => i.id === dragId) ?? null;

  function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const itemId = String(e.active.id);
    const overId = e.over?.id;
    if (overId === undefined || overId === null) return;
    const newStatus = String(overId).startsWith("lane:")
      ? String(overId).slice(5)
      : null;
    const current =
      getVal(values, itemId, activeStatusColId)?.status_option_id ?? null;
    const next = newStatus === "__none" ? null : newStatus;
    if (current === next) return;
    onUpsertValue({
      itemId,
      columnId: activeStatusColId,
      status_option_id: next,
    });
  }

  return (
    <div className="flex flex-col h-full">
      {statusCols.length > 1 && (
        <div className="px-6 py-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Group by:</span>
          <select
            value={statusColId}
            onChange={(e) => setStatusColId(e.target.value)}
            className="bg-muted/50 rounded px-2 py-1 text-foreground"
          >
            {statusCols.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragId(null)}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 py-4">
          <div className="flex gap-3 h-full min-h-0">
            {lanes.map((lane) => (
              <KanbanLane
                key={lane.id}
                laneId={lane.id}
                label={lane.label}
                color={lane.color}
                items={byLane.get(lane.id) ?? []}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {dragItem ? (
            <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg w-72">
              {dragItem.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KanbanLane({
  laneId,
  label,
  color,
  items,
}: {
  laneId: string;
  label: string;
  color: string;
  items: Item[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${laneId}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-72 shrink-0 flex flex-col rounded-lg border border-border/60 bg-card/30",
        isOver && "ring-2 ring-primary/50",
      )}
    >
      <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: color }}
        />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {items.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {items.map((it) => (
          <KanbanCard key={it.id} item={it} />
        ))}
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground/60 px-2 py-4 text-center">
            Drop items here
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanCard({ item }: { item: Item }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: item.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "bg-card border border-border/60 rounded-md px-3 py-2 text-sm cursor-grab active:cursor-grabbing hover:border-border transition-colors",
        isDragging && "opacity-30",
      )}
    >
      {item.title}
    </div>
  );
}

/* ============================================================
   CALENDAR VIEW
   ============================================================ */

export function CalendarView({
  items,
  columns,
  values,
}: {
  items: Item[];
  columns: Col[];
  values: Map<string, Map<string, Val>>;
}) {
  const dCols = dateColumns(columns);
  const [colId, setColId] = useState<string | null>(dCols[0]?.id ?? null);
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));

  if (!colId) {
    return (
      <EmptyState>Add a Date or Timeline column to use the Calendar view.</EmptyState>
    );
  }

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const eventsByDay = useMemo(() => {
    const m = new Map<string, { item: Item; isStart: boolean }[]>();
    for (const d of days) m.set(format(d, "yyyy-MM-dd"), []);
    for (const it of items) {
      const v = getVal(values, it.id, colId);
      if (!v?.date_value) continue;
      const start = new Date(v.date_value);
      const end = v.date_end_value ? new Date(v.date_end_value) : start;
      for (const d of days) {
        if (isWithinInterval(d, { start, end })) {
          const k = format(d, "yyyy-MM-dd");
          m.get(k)!.push({ item: it, isStart: isSameDay(d, start) });
        }
      }
    }
    return m;
  }, [days, items, values, colId]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 flex items-center gap-3 border-b border-border/60">
        <button
          className="h-7 w-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"
          onClick={() => setMonth(subMonths(month, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          className="h-7 w-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          className="text-xs px-2 py-1 rounded hover:bg-muted text-muted-foreground"
          onClick={() => setMonth(startOfMonth(new Date()))}
        >
          Today
        </button>
        <h2 className="text-lg font-semibold tracking-tight">
          {format(month, "MMMM yyyy")}
        </h2>
        {dCols.length > 1 && (
          <select
            value={colId}
            onChange={(e) => setColId(e.target.value)}
            className="ml-auto bg-muted/50 rounded px-2 py-1 text-xs"
          >
            {dCols.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-7 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-2 py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border/40 rounded-lg overflow-hidden border border-border/60">
          {days.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const evs = eventsByDay.get(k) ?? [];
            const inMonth = isSameMonth(d, month);
            const today = isSameDay(d, new Date());
            return (
              <div
                key={k}
                className={cn(
                  "bg-card min-h-[110px] p-1.5 flex flex-col gap-1",
                  !inMonth && "bg-card/40 text-muted-foreground",
                )}
              >
                <div
                  className={cn(
                    "text-xs font-medium px-1",
                    today &&
                      "inline-grid place-items-center h-5 w-5 rounded-full bg-primary text-primary-foreground",
                  )}
                >
                  {format(d, "d")}
                </div>
                <div className="flex-1 space-y-1 overflow-hidden">
                  {evs.slice(0, 3).map((e, i) => (
                    <div
                      key={i}
                      className="text-[11px] truncate px-1.5 py-0.5 rounded bg-primary/15 text-primary"
                    >
                      {e.item.title}
                    </div>
                  ))}
                  {evs.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1.5">
                      +{evs.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   WORKLOAD VIEW
   ============================================================ */

export function WorkloadView({
  items,
  columns,
  values,
}: {
  items: Item[];
  columns: Col[];
  values: Map<string, Map<string, Val>>;
}) {
  const peopleCols = columns.filter((c) => c.kind === "people");
  const dCols = dateColumns(columns);
  const [peopleColId, setPeopleColId] = useState<string | null>(
    peopleCols[0]?.id ?? null,
  );
  const [dateColId, setDateColId] = useState<string | null>(dCols[0]?.id ?? null);
  const [weekStart, setWeekStart] = useState<Date>(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );

  if (!dateColId) {
    return (
      <EmptyState>
        Add a Date or Timeline column to use the Workload view.
      </EmptyState>
    );
  }

  const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i));

  type Row = { key: string; label: string; items: Item[] };
  const rows: Row[] = [];
  const unassigned: Item[] = [];
  const byPerson = new Map<string, Item[]>();

  for (const it of items) {
    const dv = getVal(values, it.id, dateColId);
    if (!dv?.date_value) continue;
    if (peopleColId) {
      const pv = getVal(values, it.id, peopleColId);
      const people = pv?.people_user_ids ?? [];
      if (people.length === 0) unassigned.push(it);
      else {
        for (const uid of people) {
          if (!byPerson.has(uid)) byPerson.set(uid, []);
          byPerson.get(uid)!.push(it);
        }
      }
    } else {
      unassigned.push(it);
    }
  }

  for (const [uid, list] of byPerson) {
    rows.push({ key: uid, label: uid.slice(0, 8), items: list });
  }
  if (unassigned.length) {
    rows.push({ key: "__none", label: "Unassigned", items: unassigned });
  }
  if (rows.length === 0) {
    rows.push({ key: "__none", label: "Unassigned", items: [] });
  }

  const rangeStart = weekStart;
  const rangeEnd = addDays(weekStart, 13);
  const totalDays = 14;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 flex items-center gap-3 border-b border-border/60">
        <button
          className="h-7 w-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          className="h-7 w-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          className="text-xs px-2 py-1 rounded hover:bg-muted text-muted-foreground"
          onClick={() =>
            setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
          }
        >
          Today
        </button>
        <h2 className="text-sm font-semibold tracking-tight">
          {format(rangeStart, "MMM d")} – {format(rangeEnd, "MMM d, yyyy")}
        </h2>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {peopleCols.length > 0 && (
            <>
              <span className="text-muted-foreground">People:</span>
              <select
                value={peopleColId ?? ""}
                onChange={(e) => setPeopleColId(e.target.value || null)}
                className="bg-muted/50 rounded px-2 py-1"
              >
                {peopleCols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </>
          )}
          {dCols.length > 1 && (
            <>
              <span className="text-muted-foreground">Timeline:</span>
              <select
                value={dateColId}
                onChange={(e) => setDateColId(e.target.value)}
                className="bg-muted/50 rounded px-2 py-1"
              >
                {dCols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="min-w-[900px]">
          <div
            className="grid border-b border-border/60 sticky top-0 bg-background z-10"
            style={{ gridTemplateColumns: `200px repeat(${totalDays}, 1fr)` }}
          >
            <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-r border-border/40">
              Assignee
            </div>
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className={cn(
                  "px-1 py-2 text-center text-[11px] border-r border-border/40",
                  isSameDay(d, new Date())
                    ? "text-primary font-semibold"
                    : "text-muted-foreground",
                )}
              >
                <div>{format(d, "EEE")}</div>
                <div>{format(d, "d")}</div>
              </div>
            ))}
          </div>

          {rows.map((row) => (
            <div
              key={row.key}
              className="grid border-b border-border/40 hover:bg-muted/10"
              style={{ gridTemplateColumns: `200px repeat(${totalDays}, 1fr)` }}
            >
              <div className="px-3 py-3 text-sm border-r border-border/40 flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-primary/20 text-primary text-[10px] grid place-items-center font-semibold">
                  {row.label.slice(0, 2).toUpperCase()}
                </div>
                <span className="truncate">{row.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {row.items.length}
                </span>
              </div>
              <div
                className="relative col-span-full"
                style={{ gridColumn: `2 / span ${totalDays}` }}
              >
                <div
                  className="grid h-full"
                  style={{ gridTemplateColumns: `repeat(${totalDays}, 1fr)` }}
                >
                  {days.map((d, i) => (
                    <div
                      key={i}
                      className={cn(
                        "border-r border-border/40 min-h-[60px]",
                        isSameDay(d, new Date()) && "bg-primary/5",
                      )}
                    />
                  ))}
                </div>
                <div className="absolute inset-0 p-1 flex flex-col gap-1">
                  {row.items.map((it) => {
                    const dv = getVal(values, it.id, dateColId);
                    if (!dv?.date_value) return null;
                    const s = new Date(dv.date_value);
                    const e = dv.date_end_value
                      ? new Date(dv.date_end_value)
                      : s;
                    if (e < rangeStart || s > rangeEnd) return null;
                    const startIdx = Math.max(
                      0,
                      Math.floor(
                        (+s - +rangeStart) / (1000 * 60 * 60 * 24),
                      ),
                    );
                    const endIdx = Math.min(
                      totalDays - 1,
                      Math.floor((+e - +rangeStart) / (1000 * 60 * 60 * 24)),
                    );
                    const left = `${(startIdx / totalDays) * 100}%`;
                    const width = `${((endIdx - startIdx + 1) / totalDays) * 100}%`;
                    return (
                      <div
                        key={it.id}
                        className="relative h-6"
                        title={it.title}
                      >
                        <div
                          className="absolute h-6 rounded-md bg-primary/80 text-primary-foreground text-xs px-2 flex items-center truncate shadow-sm"
                          style={{ left, width }}
                        >
                          {it.title}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------ shared bits ------------ */

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
      <div className="h-12 w-12 rounded-full bg-muted grid place-items-center mb-4">
        <Plus className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground max-w-sm">{children}</p>
    </div>
  );
}