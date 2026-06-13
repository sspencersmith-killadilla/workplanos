import { useEffect, useMemo, useState } from "react";
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
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ExternalLink,
  CalendarDays,
  LayoutGrid,
  Rows3,
} from "lucide-react";
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
  onOpenItem,
}: {
  items: Item[];
  columns: Col[];
  values: Map<string, Map<string, Val>>;
  onUpsertValue: (p: any) => Promise<unknown>;
  onOpenItem?: (id: string) => void;
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
                onOpenItem={onOpenItem}
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
  onOpenItem,
}: {
  laneId: string;
  label: string;
  color: string;
  items: Item[];
  onOpenItem?: (id: string) => void;
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
          <KanbanCard key={it.id} item={it} onOpen={onOpenItem} />
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

function KanbanCard({ item, onOpen }: { item: Item; onOpen?: (id: string) => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: item.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "bg-card border border-border/60 rounded-md px-3 py-2 text-sm cursor-grab active:cursor-grabbing hover:border-border transition-colors group",
        isDragging && "opacity-30",
      )}
      onDoubleClick={() => onOpen?.(item.id)}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate">{item.title}</span>
        {onOpen && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(item.id);
            }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
            aria-label="Open"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </button>
        )}
      </div>
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
  onOpenItem,
}: {
  items: Item[];
  columns: Col[];
  values: Map<string, Map<string, Val>>;
  onOpenItem?: (id: string) => void;
}) {
  const dCols = dateColumns(columns);

  // Persist the user's chosen date column per board scope. We don't have boardId here,
  // so key by the sorted set of date-column ids — stable per board.
  const storageKey = "calview:" + dCols.map((c) => c.id).sort().join(",");
  const [colId, setColId] = useStickyState<string | null>(
    storageKey,
    pickDefaultDateColumn(dCols)?.id ?? null,
  );

  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [colorMode, setColorMode] = useState<ColorMode>("pctSold");
  const [layout, setLayout] = useState<CalLayout>("all");
  const [laneBy, setLaneBy] = useState<"venue" | "assignee">("venue");

  if (!colId) {
    return (
      <EmptyState>
        Add a Date or Timeline column to use the Calendar view.
      </EmptyState>
    );
  }
  const activeColId: string = colId;
  const activeCol = dCols.find((c) => c.id === activeColId) ?? null;

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart.getTime(), gridEnd.getTime()], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Resolve a few helper columns for color/agenda rendering.
  const venueCol = columns.find((c) => c.title.toLowerCase() === "venue");
  const statusCol = columns.find((c) => c.kind === "status");
  const soldCol = columns.find((c) => c.title.toLowerCase() === "tickets sold");
  const capCol = columns.find((c) => c.title.toLowerCase() === "tickets available");
  const linkCol = columns.find((c) => c.kind === "link");
  const doorsCol = columns.find((c) => c.title.toLowerCase() === "doors");
  const showCol = columns.find((c) => c.title.toLowerCase() === "show time");
  const peopleCol = columns.find((c) => c.kind === "people");

  const itemMeta = useMemo(() => {
    const m = new Map<string, ItemMeta>();
    for (const it of items) {
      const v = getVal(values, it.id, activeColId);
      if (!v?.date_value) {
        m.set(it.id, { start: null, end: null });
        continue;
      }
      const start = parseLooseDate(v.date_value);
      const end = v.date_end_value ? parseLooseDate(v.date_end_value) : start;
      m.set(it.id, { start, end });
    }
    return m;
  }, [items, values, activeColId]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const d of days) m.set(format(d, "yyyy-MM-dd"), []);
    for (const it of items) {
      const meta = itemMeta.get(it.id);
      if (!meta?.start) continue;
      for (const d of days) {
        if (isWithinInterval(d, { start: meta.start, end: meta.end ?? meta.start })) {
          m.get(format(d, "yyyy-MM-dd"))!.push(it);
        }
      }
    }
    return m;
  }, [days, items, itemMeta]);

  // Detect "selected column has no data anywhere on the board" → suggest a switch.
  const datedItemCount = useMemo(
    () => items.filter((it) => itemMeta.get(it.id)?.start).length,
    [items, itemMeta],
  );
  const eventDateCol = dCols.find((c) => c.title.toLowerCase() === "event date");
  const suggestSwitch =
    datedItemCount === 0 &&
    eventDateCol &&
    eventDateCol.id !== activeColId;

  const colorOf = (it: Item): string =>
    eventColor(colorMode, it, { soldCol, capCol, statusCol, venueCol, values });

  const dayKey = format(selectedDay, "yyyy-MM-dd");
  const dayEvents = eventsByDay.get(dayKey) ?? [];

  const showMonth = layout === "month" || layout === "agenda" || layout === "all";
  const showAgenda = layout === "agenda" || layout === "all";
  const showTimeline = layout === "timeline" || layout === "all";

  return (
    <div className="flex flex-col h-full">
      {/* ----- Header ----- */}
      <div className="px-6 py-3 flex flex-wrap items-center gap-2 border-b border-border/60">
        <div className="flex items-center gap-1">
          <button
            className="h-7 w-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"
            onClick={() => setMonth(subMonths(month, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="h-7 w-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"
            onClick={() => setMonth(addMonths(month, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            className="text-xs px-2 py-1 rounded hover:bg-muted text-muted-foreground"
            onClick={() => {
              const now = new Date();
              setMonth(startOfMonth(now));
              setSelectedDay(now);
            }}
          >
            Today
          </button>
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          {format(month, "MMMM yyyy")}
        </h2>

        <div className="ml-auto flex items-center gap-2 text-xs">
          <label className="text-muted-foreground">Color</label>
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as ColorMode)}
            className="bg-muted/50 rounded px-2 py-1"
          >
            <option value="pctSold">% Sold</option>
            <option value="status">Status</option>
            <option value="venue">Venue</option>
          </select>

          {dCols.length > 1 && (
            <>
              <label className="text-muted-foreground">Column</label>
              <select
                value={colId}
                onChange={(e) => setColId(e.target.value)}
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

          <div className="flex items-center rounded border border-border/60 overflow-hidden">
            <LayoutTab active={layout === "month"} onClick={() => setLayout("month")} title="Month">
              <LayoutGrid className="h-3.5 w-3.5" />
            </LayoutTab>
            <LayoutTab active={layout === "agenda"} onClick={() => setLayout("agenda")} title="Month + Agenda">
              <CalendarDays className="h-3.5 w-3.5" />
            </LayoutTab>
            <LayoutTab active={layout === "timeline"} onClick={() => setLayout("timeline")} title="Month + Timeline">
              <Rows3 className="h-3.5 w-3.5" />
            </LayoutTab>
            <LayoutTab active={layout === "all"} onClick={() => setLayout("all")} title="All">
              <span className="text-[10px] px-1.5">All</span>
            </LayoutTab>
          </div>
        </div>
      </div>

      {suggestSwitch && (
        <div className="px-6 py-2 text-xs flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-900 dark:text-amber-200">
          <span>
            No dates on <strong>{activeCol?.title}</strong>. Switch to{" "}
          </span>
          <button
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 font-medium"
            onClick={() => setColId(eventDateCol!.id)}
          >
            {eventDateCol!.title}
          </button>
        </div>
      )}

      {/* ----- Body ----- */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div
          className={cn(
            "grid gap-3 p-4",
            showAgenda ? "grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1",
          )}
        >
          {/* Month grid */}
          {showMonth && (
            <div>
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
                  const selected = isSameDay(d, selectedDay);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelectedDay(d)}
                      className={cn(
                        "bg-card min-h-[110px] p-1.5 flex flex-col gap-1 text-left transition-colors",
                        "hover:bg-accent/30 focus:outline-none focus:ring-1 focus:ring-primary/50",
                        !inMonth && "bg-card/40 text-muted-foreground",
                        selected && "ring-2 ring-primary/60 ring-inset",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className={cn(
                            "text-xs font-medium px-1",
                            today &&
                              "inline-grid place-items-center h-5 w-5 rounded-full bg-primary text-primary-foreground",
                          )}
                        >
                          {format(d, "d")}
                        </div>
                        {evs.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {evs.length}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 space-y-1 overflow-hidden">
                        {evs.slice(0, 4).map((it) => (
                          <EventPill
                            key={it.id}
                            item={it}
                            color={colorOf(it)}
                            sold={numVal(values, it.id, soldCol?.id)}
                            cap={numVal(values, it.id, capCol?.id)}
                            onOpen={() => onOpenItem?.(it.id)}
                          />
                        ))}
                        {evs.length > 4 && (
                          <div className="text-[10px] text-muted-foreground px-1.5">
                            +{evs.length - 4} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agenda */}
          {showAgenda && (
            <aside className="rounded-lg border border-border/60 bg-card flex flex-col min-h-0">
              <div className="px-3 py-2 border-b border-border/60">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {format(selectedDay, "EEEE")}
                </div>
                <div className="text-base font-semibold">
                  {format(selectedDay, "MMM d, yyyy")}
                </div>
              </div>
              <div className="flex-1 overflow-auto p-2 space-y-2">
                {dayEvents.length === 0 && (
                  <div className="text-xs text-muted-foreground px-2 py-6 text-center">
                    No events on this day.
                  </div>
                )}
                {dayEvents.map((it) => {
                  const sold = numVal(values, it.id, soldCol?.id);
                  const cap = numVal(values, it.id, capCol?.id);
                  const pct = pctSold(sold, cap);
                  const venue = textVal(values, it.id, venueCol?.id);
                  const doors = textVal(values, it.id, doorsCol?.id);
                  const show = textVal(values, it.id, showCol?.id);
                  const statusLabel = statusOptionLabel(
                    values,
                    it.id,
                    statusCol,
                  );
                  const statusColor = statusOptionColor(values, it.id, statusCol);
                  const link = getVal(values, it.id, linkCol?.id ?? "")?.link_url;
                  return (
                    <div
                      key={it.id}
                      className="rounded-md border border-border/60 bg-background p-2.5 hover:border-primary/40 cursor-pointer"
                      onClick={() => onOpenItem?.(it.id)}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className="mt-1 h-2 w-2 rounded-full shrink-0"
                          style={{ background: colorOf(it) }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {it.title}
                          </div>
                          {venue && (
                            <div className="text-xs text-muted-foreground truncate">
                              {venue}
                            </div>
                          )}
                          {(doors || show) && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {doors ? `Doors ${doors}` : null}
                              {doors && show ? " · " : ""}
                              {show ? `Show ${show}` : null}
                            </div>
                          )}
                          {(sold != null || cap != null) && (
                            <div className="mt-1.5">
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full"
                                  style={{
                                    width: `${Math.min(100, pct ?? 0)}%`,
                                    background: heatmapColor(pct),
                                  }}
                                />
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {sold ?? 0}
                                {cap != null ? ` / ${cap}` : ""}
                                {pct != null ? ` · ${pct}%` : ""}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            {statusLabel && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{
                                  background: (statusColor ?? "#64748b") + "33",
                                  color: statusColor ?? undefined,
                                }}
                              >
                                {statusLabel}
                              </span>
                            )}
                            {link && (
                              <a
                                href={link}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] text-primary inline-flex items-center gap-0.5 hover:underline"
                              >
                                Open <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          )}
        </div>

        {/* Timeline strip */}
        {showTimeline && (
          <TimelineStrip
            items={items}
            itemMeta={itemMeta}
            monthStart={monthStart}
            monthEnd={monthEnd}
            laneBy={laneBy}
            setLaneBy={setLaneBy}
            venueCol={venueCol}
            peopleCol={peopleCol}
            onOpenItem={onOpenItem}
            colorOf={colorOf}
            values={values}
          />
        )}
      </div>
    </div>
  );
}

/* ---- Calendar helpers & subcomponents ---- */

type ColorMode = "pctSold" | "status" | "venue";
type CalLayout = "month" | "agenda" | "timeline" | "all";
type ItemMeta = { start: Date | null; end: Date | null };

function useStickyState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }, [key, v]);
  return [v, setV];
}

function pickDefaultDateColumn(dCols: Col[]): Col | undefined {
  if (dCols.length === 0) return undefined;
  const event = dCols.find((c) => c.title.toLowerCase() === "event date");
  if (event) return event;
  const generic = dCols.find((c) => c.title.toLowerCase().includes("date"));
  if (generic) return generic;
  return dCols[0];
}

// Parse "2026-06-18T21:00:00" (naive) safely so it lands on June 18 regardless of locale.
function parseLooseDate(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const naive = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (naive) {
    const [, y, mo, d, h, mi, se] = naive;
    return new Date(+y, +mo - 1, +d, +h, +mi, se ? +se : 0);
  }
  return new Date(s);
}

function numVal(
  values: Map<string, Map<string, Val>>,
  itemId: string,
  columnId?: string,
): number | null {
  if (!columnId) return null;
  const v = getVal(values, itemId, columnId);
  return v?.number_value ?? null;
}
function textVal(
  values: Map<string, Map<string, Val>>,
  itemId: string,
  columnId?: string,
): string | null {
  if (!columnId) return null;
  const v = getVal(values, itemId, columnId);
  return v?.text_value ?? null;
}
function pctSold(sold: number | null, cap: number | null): number | null {
  if (sold == null || cap == null || cap <= 0) return null;
  return Math.round((sold / cap) * 1000) / 10;
}
function heatmapColor(pct: number | null): string {
  if (pct == null) return "#94a3b8"; // gray
  if (pct >= 80) return "#22c55e";
  if (pct >= 40) return "#f59e0b";
  return "#ef4444";
}
function statusOptionLabel(
  values: Map<string, Map<string, Val>>,
  itemId: string,
  col: Col | undefined,
): string | null {
  if (!col) return null;
  const id = getVal(values, itemId, col.id)?.status_option_id;
  if (!id) return null;
  const opt = (col.settings?.options as StatusOpt[] | undefined)?.find(
    (o) => o.id === id,
  );
  return opt?.label ?? null;
}
function statusOptionColor(
  values: Map<string, Map<string, Val>>,
  itemId: string,
  col: Col | undefined,
): string | null {
  if (!col) return null;
  const id = getVal(values, itemId, col.id)?.status_option_id;
  if (!id) return null;
  const opt = (col.settings?.options as StatusOpt[] | undefined)?.find(
    (o) => o.id === id,
  );
  return opt?.color ?? null;
}
function hashColor(s: string): string {
  const palette = [
    "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
    "#a855f7", "#ec4899", "#14b8a6", "#8b5cf6", "#f97316",
  ];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}
function eventColor(
  mode: ColorMode,
  it: Item,
  ctx: {
    soldCol?: Col;
    capCol?: Col;
    statusCol?: Col;
    venueCol?: Col;
    values: Map<string, Map<string, Val>>;
  },
): string {
  if (mode === "status") {
    return statusOptionColor(ctx.values, it.id, ctx.statusCol) ?? "#64748b";
  }
  if (mode === "venue") {
    const v = textVal(ctx.values, it.id, ctx.venueCol?.id) ?? it.id;
    return hashColor(v);
  }
  // pctSold (default)
  const sold = numVal(ctx.values, it.id, ctx.soldCol?.id);
  const cap = numVal(ctx.values, it.id, ctx.capCol?.id);
  return heatmapColor(pctSold(sold, cap));
}

function LayoutTab({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "h-7 px-2 grid place-items-center text-muted-foreground hover:bg-muted",
        active && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </button>
  );
}

function EventPill({
  item,
  color,
  sold,
  cap,
  onOpen,
}: {
  item: Item;
  color: string;
  sold: number | null;
  cap: number | null;
  onOpen: () => void;
}) {
  const pct = pctSold(sold, cap);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      title={
        `${item.title}` +
        (pct != null ? ` — ${pct}% sold` : "") +
        (cap != null ? ` (${sold ?? 0}/${cap})` : "")
      }
      className="group rounded px-1.5 py-0.5 text-[11px] truncate cursor-pointer hover:brightness-110"
      style={{
        background: color + "26",
        color: undefined,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="truncate">{item.title}</div>
      {pct != null && (
        <div className="h-0.5 rounded-full mt-0.5 bg-muted overflow-hidden">
          <div
            className="h-full"
            style={{ width: `${Math.min(100, pct)}%`, background: color }}
          />
        </div>
      )}
    </div>
  );
}

function TimelineStrip({
  items,
  itemMeta,
  monthStart,
  monthEnd,
  laneBy,
  setLaneBy,
  venueCol,
  peopleCol,
  onOpenItem,
  colorOf,
  values,
}: {
  items: Item[];
  itemMeta: Map<string, ItemMeta>;
  monthStart: Date;
  monthEnd: Date;
  laneBy: "venue" | "assignee";
  setLaneBy: (v: "venue" | "assignee") => void;
  venueCol: Col | undefined;
  peopleCol: Col | undefined;
  onOpenItem?: (id: string) => void;
  colorOf: (it: Item) => string;
  values: Map<string, Map<string, Val>>;
}) {
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const dayW = 28; // px per day

  // Build lanes
  const laneMap = new Map<string, Item[]>();
  for (const it of items) {
    const meta = itemMeta.get(it.id);
    if (!meta?.start) continue;
    if (meta.end! < monthStart || meta.start > monthEnd) continue;
    let laneKey = "—";
    if (laneBy === "venue") {
      laneKey = textVal(values, it.id, venueCol?.id) ?? "No venue";
    } else {
      const ppl = peopleCol
        ? getVal(values, it.id, peopleCol.id)?.people_user_ids
        : null;
      laneKey = ppl && ppl.length ? ppl[0] : "Unassigned";
    }
    if (!laneMap.has(laneKey)) laneMap.set(laneKey, []);
    laneMap.get(laneKey)!.push(it);
  }
  const lanes = Array.from(laneMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const dayIndex = (d: Date) => {
    const ms = d.getTime() - monthStart.getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  };

  return (
    <div className="border-t border-border/60 bg-card">
      <div className="px-4 py-2 flex items-center gap-2 text-xs">
        <span className="font-medium">Timeline</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">Group by</span>
        <select
          value={laneBy}
          onChange={(e) => setLaneBy(e.target.value as "venue" | "assignee")}
          className="bg-muted/50 rounded px-2 py-0.5"
        >
          <option value="venue">Venue</option>
          <option value="assignee">Assignee</option>
        </select>
      </div>
      <div className="overflow-auto">
        <div style={{ minWidth: `${180 + daysInMonth.length * dayW}px` }}>
          {/* Day header */}
          <div className="flex border-b border-border/60 sticky top-0 bg-card z-10">
            <div className="w-[180px] shrink-0 px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground border-r border-border/60">
              {laneBy === "venue" ? "Venue" : "Assignee"}
            </div>
            <div className="flex">
              {daysInMonth.map((d) => {
                const today = isSameDay(d, new Date());
                return (
                  <div
                    key={d.toISOString()}
                    style={{ width: dayW }}
                    className={cn(
                      "text-[10px] text-center py-1.5 text-muted-foreground border-r border-border/30",
                      today && "text-primary font-semibold",
                    )}
                  >
                    {format(d, "d")}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Lanes */}
          {lanes.length === 0 && (
            <div className="px-4 py-6 text-xs text-muted-foreground">
              No events in this month.
            </div>
          )}
          {lanes.map(([laneKey, laneItems]) => (
            <div key={laneKey} className="flex border-b border-border/40">
              <div className="w-[180px] shrink-0 px-3 py-2 text-xs font-medium truncate border-r border-border/60 bg-card sticky left-0">
                {laneKey}
              </div>
              <div
                className="relative"
                style={{
                  width: daysInMonth.length * dayW,
                  minHeight: 32 + laneItems.length * 4,
                }}
              >
                {/* Today line */}
                {(() => {
                  const today = new Date();
                  if (today < monthStart || today > monthEnd) return null;
                  return (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-primary/40 pointer-events-none"
                      style={{ left: (dayIndex(today) + 0.5) * dayW }}
                    />
                  );
                })()}
                {laneItems.map((it, i) => {
                  const meta = itemMeta.get(it.id)!;
                  const s = meta.start! < monthStart ? monthStart : meta.start!;
                  const e =
                    (meta.end ?? meta.start!) > monthEnd
                      ? monthEnd
                      : meta.end ?? meta.start!;
                  const left = dayIndex(s) * dayW;
                  const span = Math.max(1, dayIndex(e) - dayIndex(s) + 1);
                  const color = colorOf(it);
                  return (
                    <button
                      key={it.id}
                      onClick={() => onOpenItem?.(it.id)}
                      title={it.title}
                      className="absolute text-[10px] truncate rounded px-1.5 py-0.5 text-left hover:brightness-110"
                      style={{
                        left: left + 2,
                        width: span * dayW - 4,
                        top: 4 + i * 22,
                        background: color + "33",
                        borderLeft: `3px solid ${color}`,
                      }}
                    >
                      {it.title}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
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
  const activeDateColId: string = dateColId;
  const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i));

  type Row = { key: string; label: string; items: Item[] };
  const rows: Row[] = [];
  const unassigned: Item[] = [];
  const byPerson = new Map<string, Item[]>();

  for (const it of items) {
    const dv = getVal(values, it.id, activeDateColId);
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
                    const dv = getVal(values, it.id, activeDateColId);
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