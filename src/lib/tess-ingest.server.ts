import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TessEvent = {
  id: string;
  title?: string;
  starts_at?: string;
  ends_at?: string | null;
  doors_at?: string | null;
  venue?: string;
  status?: string;
  assignee_email?: string | null;
  tickets_available?: number | null;
  tickets_sold?: number | null;
  notes?: string | null;
  url?: string;
  // Extended (optional) — kept in Notes auto-block for v1
  genre?: string;
  promoter?: string;
  support_acts?: string;
  settlement_total?: number | null;
  currency?: string;
};

type ColumnKind =
  | "text"
  | "status"
  | "people"
  | "date"
  | "timeline"
  | "number"
  | "formula"
  | "link";

type CanonKey =
  | "date"
  | "doors"
  | "show"
  | "venue"
  | "status"
  | "assignee"
  | "sold"
  | "available"
  | "pctSold"
  | "link"
  | "notes";

const CANONICAL: Record<CanonKey, { title: string; kind: ColumnKind; settings?: any }> = {
  date: { title: "Event date", kind: "date" },
  doors: { title: "Doors", kind: "text" },
  show: { title: "Show time", kind: "text" },
  venue: { title: "Venue", kind: "text" },
  status: { title: "Status", kind: "status", settings: { options: [] } },
  assignee: { title: "Assignee", kind: "people" },
  sold: { title: "Tickets sold", kind: "number" },
  available: { title: "Tickets available", kind: "number" },
  pctSold: { title: "% Sold", kind: "number" },
  link: { title: "TESS Link", kind: "link" },
  notes: { title: "Notes", kind: "text" },
};

const STATUS_PALETTE = [
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ef4444",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#64748b",
];
const GROUP_PALETTE = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
  "#f97316",
  "#22c55e",
  "#64748b",
];

function fmtHHMM(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

const AUTO_RE = /<!-- tess:auto -->[\s\S]*?<!-- \/tess:auto -->/;
function mergeAutoBlock(prior: string, autoBlock: string): string {
  if (!prior) return autoBlock;
  if (AUTO_RE.test(prior)) return prior.replace(AUTO_RE, autoBlock);
  return `${autoBlock}\n\n${prior}`;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

async function ensureColumns(boardId: string): Promise<Record<CanonKey, any>> {
  const { data: existing } = await supabaseAdmin
    .from("board_columns")
    .select("id, kind, title, settings, position")
    .eq("board_id", boardId);

  const byTitle = new Map<string, any>(
    (existing ?? []).map((c: any) => [c.title.toLowerCase(), c]),
  );
  let nextPos =
    (existing ?? []).reduce((m: number, c: any) => Math.max(m, c.position ?? 0), 0) + 1;

  const out: any = {};
  for (const [key, def] of Object.entries(CANONICAL) as [CanonKey, any][]) {
    let col = byTitle.get(def.title.toLowerCase());
    if (!col) {
      const { data: inserted, error } = await supabaseAdmin
        .from("board_columns")
        .insert({
          board_id: boardId,
          title: def.title,
          kind: def.kind,
          settings: def.settings ?? {},
          position: nextPos++,
        })
        .select("id, kind, title, settings, position")
        .single();
      if (error) throw new Error(`ensureColumns(${def.title}): ${error.message}`);
      col = inserted;
    }
    out[key] = col;
  }
  return out;
}

async function ensureStatusOption(col: any, label: string): Promise<string> {
  const settings = (col.settings as any) ?? {};
  const options: any[] = Array.isArray(settings.options) ? settings.options : [];
  const match = options.find(
    (o) => (o.label ?? "").toLowerCase() === label.toLowerCase(),
  );
  if (match) return match.id;
  const id = crypto.randomUUID();
  const color = STATUS_PALETTE[hashStr(label) % STATUS_PALETTE.length];
  options.push({ id, label, color });
  await supabaseAdmin
    .from("board_columns")
    .update({ settings: { ...settings, options } })
    .eq("id", col.id);
  col.settings = { ...settings, options };
  return id;
}

async function ensureMonthGroup(boardId: string, dateIso: string | undefined): Promise<string> {
  const name = dateIso
    ? (() => {
        const d = new Date(dateIso);
        if (isNaN(d.getTime())) return "Unscheduled";
        return new Intl.DateTimeFormat("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(d);
      })()
    : "Unscheduled";

  const { data: existing } = await supabaseAdmin
    .from("groups")
    .select("id, name")
    .eq("board_id", boardId)
    .eq("name", name)
    .maybeSingle();
  if (existing) return existing.id;

  let position = 999999;
  if (dateIso) {
    const d = new Date(dateIso);
    if (!isNaN(d.getTime())) {
      position = d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
    }
  }
  const color = GROUP_PALETTE[position % GROUP_PALETTE.length];
  const { data: created, error } = await supabaseAdmin
    .from("groups")
    .insert({ board_id: boardId, name, color, position })
    .select("id")
    .single();
  if (error) throw new Error(`ensureMonthGroup: ${error.message}`);
  return created.id;
}

async function upsertValue(itemId: string, columnId: string, patch: Record<string, any>) {
  await supabaseAdmin
    .from("item_values")
    .upsert(
      {
        item_id: itemId,
        column_id: columnId,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id,column_id" },
    );
}

export async function processTessEvent(args: {
  boardId: string;
  type: "event.created" | "event.updated" | "event.cancelled" | "gig.assigned";
  event: TessEvent;
}): Promise<{ itemId: string | null; deleted?: boolean }> {
  const { boardId, type, event: ev } = args;

  // Look up linked item
  const { data: existingRef } = await supabaseAdmin
    .from("item_external_refs")
    .select("item_id")
    .eq("source", "tess")
    .eq("external_id", ev.id)
    .maybeSingle();
  let itemId = existingRef?.item_id ?? null;

  if (type === "event.cancelled") {
    if (itemId) await supabaseAdmin.from("items").delete().eq("id", itemId);
    return { itemId: null, deleted: true };
  }

  const cols = await ensureColumns(boardId);
  const targetGroupId = await ensureMonthGroup(boardId, ev.starts_at);

  if (!itemId) {
    const { data: newItem, error: insErr } = await supabaseAdmin
      .from("items")
      .insert({
        board_id: boardId,
        group_id: targetGroupId,
        title: ev.title ?? "Untitled event",
        position: Date.now(),
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    itemId = newItem.id;
    await supabaseAdmin.from("item_external_refs").insert({
      item_id: itemId,
      source: "tess",
      external_id: ev.id,
      external_kind: "event",
      external_url: ev.url ?? null,
    });
  } else {
    const patch: any = {};
    if (ev.title) patch.title = ev.title;
    patch.group_id = targetGroupId;
    await supabaseAdmin.from("items").update(patch).eq("id", itemId);
  }

  // Event date
  if (ev.starts_at) await upsertValue(itemId!, cols.date.id, { date_value: ev.starts_at });

  // Doors
  if (ev.doors_at) await upsertValue(itemId!, cols.doors.id, { text_value: fmtHHMM(ev.doors_at) });

  // Show time
  if (ev.starts_at) {
    const show = ev.ends_at
      ? `${fmtHHMM(ev.starts_at)}–${fmtHHMM(ev.ends_at)}`
      : fmtHHMM(ev.starts_at);
    await upsertValue(itemId!, cols.show.id, { text_value: show });
  }

  if (ev.venue) await upsertValue(itemId!, cols.venue.id, { text_value: ev.venue });

  if (ev.status) {
    const optId = await ensureStatusOption(cols.status, ev.status);
    await upsertValue(itemId!, cols.status.id, { status_option_id: optId });
  }

  if (ev.assignee_email) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", ev.assignee_email)
      .maybeSingle();
    if (prof) {
      await upsertValue(itemId!, cols.assignee.id, { people_user_ids: [prof.id] });
    }
  }

  if (ev.tickets_sold != null) {
    await upsertValue(itemId!, cols.sold.id, { number_value: ev.tickets_sold });
  }
  if (ev.tickets_available != null) {
    await upsertValue(itemId!, cols.available.id, { number_value: ev.tickets_available });
  }
  if (ev.tickets_available != null && ev.tickets_available > 0 && ev.tickets_sold != null) {
    const pct = Math.round((ev.tickets_sold / ev.tickets_available) * 1000) / 10;
    await upsertValue(itemId!, cols.pctSold.id, { number_value: pct });
  }

  if (ev.url) {
    await upsertValue(itemId!, cols.link.id, {
      link_url: ev.url,
      link_label: ev.title ?? ev.url,
    });
  }

  // Notes auto-block
  const autoLines: string[] = [];
  if (ev.venue) autoLines.push(`Location: ${ev.venue}`);
  if (ev.doors_at) autoLines.push(`Doors: ${fmtHHMM(ev.doors_at)}`);
  if (ev.starts_at) {
    autoLines.push(
      ev.ends_at
        ? `Show: ${fmtHHMM(ev.starts_at)} – ${fmtHHMM(ev.ends_at)}`
        : `Show: ${fmtHHMM(ev.starts_at)}`,
    );
  }
  if (ev.tickets_available != null || ev.tickets_sold != null) {
    const sold = ev.tickets_sold ?? 0;
    const cap = ev.tickets_available ?? null;
    autoLines.push(
      cap != null
        ? `Tickets: ${sold.toLocaleString()} / ${cap.toLocaleString()} sold`
        : `Tickets sold: ${sold.toLocaleString()}`,
    );
  }
  if (ev.genre) autoLines.push(`Genre: ${ev.genre}`);
  if (ev.promoter) autoLines.push(`Promoter: ${ev.promoter}`);
  if (ev.support_acts) autoLines.push(`Support: ${ev.support_acts}`);
  if (ev.settlement_total != null) {
    autoLines.push(
      `Settlement: ${ev.settlement_total.toLocaleString()}${ev.currency ? " " + ev.currency : ""}`,
    );
  }
  if (ev.notes) autoLines.push("", ev.notes);

  if (autoLines.length > 0) {
    const { data: existingVal } = await supabaseAdmin
      .from("item_values")
      .select("text_value")
      .eq("item_id", itemId!)
      .eq("column_id", cols.notes.id)
      .maybeSingle();
    const prior = (existingVal as any)?.text_value ?? "";
    const autoBlock = `<!-- tess:auto -->\n${autoLines.join("\n")}\n<!-- /tess:auto -->`;
    await upsertValue(itemId!, cols.notes.id, {
      text_value: mergeAutoBlock(prior, autoBlock),
    });
  }

  await supabaseAdmin.from("item_activity").insert({
    item_id: itemId,
    actor_id: null,
    kind: "system",
    payload: { source: "tess", type } as any,
  });

  return { itemId };
}