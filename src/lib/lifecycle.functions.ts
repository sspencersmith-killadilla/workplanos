import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const archiveBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; archived: boolean }) =>
    z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("boards")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; archived: boolean }) =>
    z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("items")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const exportBoardCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string }) =>
    z.object({ boardId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [colsR, itemsR, valsR] = await Promise.all([
      context.supabase
        .from("board_columns")
        .select("id, title, kind, position")
        .eq("board_id", data.boardId)
        .order("position"),
      context.supabase
        .from("items")
        .select("id, title, group_id")
        .eq("board_id", data.boardId)
        .is("archived_at", null)
        .order("position"),
      context.supabase
        .from("item_values")
        .select("item_id, column_id, text_value, number_value, date_value, status_option_id, link_url, people_user_ids"),
    ]);
    if (colsR.error) throw new Error(colsR.error.message);
    if (itemsR.error) throw new Error(itemsR.error.message);
    if (valsR.error) throw new Error(valsR.error.message);

    const cols = colsR.data ?? [];
    const items = itemsR.data ?? [];
    const itemIds = new Set(items.map((i: any) => i.id));
    const vmap = new Map<string, Map<string, any>>();
    for (const v of valsR.data ?? []) {
      if (!itemIds.has(v.item_id)) continue;
      if (!vmap.has(v.item_id)) vmap.set(v.item_id, new Map());
      vmap.get(v.item_id)!.set(v.column_id, v);
    }
    const esc = (s: any) => {
      const str = s == null ? "" : String(s);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const header = ["Title", ...cols.map((c: any) => c.title)].map(esc).join(",");
    const lines = items.map((it: any) => {
      const vs = vmap.get(it.id);
      return [
        esc(it.title),
        ...cols.map((c: any) => {
          const v = vs?.get(c.id);
          if (!v) return "";
          if (c.kind === "number") return esc(v.number_value);
          if (c.kind === "date") return esc(v.date_value);
          if (c.kind === "link") return esc(v.link_url);
          if (c.kind === "status") return esc(v.status_option_id);
          if (c.kind === "people") return esc((v.people_user_ids ?? []).join(";"));
          return esc(v.text_value);
        }),
      ].join(",");
    });
    return { csv: [header, ...lines].join("\n") };
  });

export const updateComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; body: string }) =>
    z.object({ id: z.string().uuid(), body: z.string().min(1).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("comments")
      .update({ body: data.body, edited_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("author_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("comments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });