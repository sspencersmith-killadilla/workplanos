import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* ====================== KPIs ====================== */

const metricEnum = z.enum(["count_items", "sum_column", "avg_column", "count_with_status"]);
const periodEnum = z.enum(["all_time", "month", "quarter", "year"]);

export const listKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string }) =>
    z.object({ boardId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("board_kpis")
      .select(
        "id, board_id, name, metric, column_id, status_column_id, status_option_id, target, unit, period, position",
      )
      .eq("board_id", data.boardId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createKpi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string; name?: string }) =>
    z
      .object({ boardId: z.string().uuid(), name: z.string().max(120).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: maxRow } = await (context.supabase as any)
      .from("board_kpis")
      .select("position")
      .eq("board_id", data.boardId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pos = (maxRow?.position ?? 0) + 1024;
    const { data: row, error } = await (context.supabase as any)
      .from("board_kpis")
      .insert({
        board_id: data.boardId,
        name: data.name ?? "New KPI",
        metric: "count_items",
        target: 0,
        period: "all_time",
        position: pos,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateKpi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      name?: string;
      metric?: string;
      column_id?: string | null;
      status_column_id?: string | null;
      status_option_id?: string | null;
      target?: number;
      unit?: string | null;
      period?: string;
      position?: number;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          name: z.string().min(1).max(120).optional(),
          metric: metricEnum.optional(),
          column_id: z.string().uuid().nullable().optional(),
          status_column_id: z.string().uuid().nullable().optional(),
          status_option_id: z.string().nullable().optional(),
          target: z.number().optional(),
          unit: z.string().max(20).nullable().optional(),
          period: periodEnum.optional(),
          position: z.number().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await (context.supabase as any)
      .from("board_kpis")
      .update(patch as any)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteKpi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("board_kpis")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ====================== External assignees ====================== */

export const listExternals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string }) =>
    z.object({ boardId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("board_external_assignees")
      .select("id, board_id, name, email, avatar_url")
      .eq("board_id", data.boardId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createExternal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string; name: string; email?: string }) =>
    z
      .object({
        boardId: z.string().uuid(),
        name: z.string().min(1).max(120),
        email: z.string().email().max(200).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any)
      .from("board_external_assignees")
      .insert({
        board_id: data.boardId,
        name: data.name,
        email: data.email || null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateExternal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name?: string; email?: string | null }) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        email: z.string().email().max(200).nullable().optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    if ((patch as any).email === "") (patch as any).email = null;
    const { error } = await (context.supabase as any)
      .from("board_external_assignees")
      .update(patch as any)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteExternal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("board_external_assignees")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });