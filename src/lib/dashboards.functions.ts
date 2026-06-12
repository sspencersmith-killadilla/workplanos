import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listDashboards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("dashboards")
      .select("id, name, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [dashRes, widgetsRes] = await Promise.all([
      context.supabase
        .from("dashboards")
        .select("id, workspace_id, name, layout")
        .eq("id", data.id)
        .single(),
      context.supabase
        .from("dashboard_widgets")
        .select("id, kind, settings, position, created_at")
        .eq("dashboard_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    if (dashRes.error) throw new Error(dashRes.error.message);
    return { dashboard: dashRes.data, widgets: widgetsRes.data ?? [] };
  });

export const createDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; name: string }) =>
    z
      .object({ workspaceId: z.string().uuid(), name: z.string().min(1).max(80) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("dashboards")
      .insert({ workspace_id: data.workspaceId, name: data.name })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id: string; name?: string; layout?: unknown }) =>
      z
        .object({
          id: z.string().uuid(),
          name: z.string().min(1).max(80).optional(),
          layout: z.unknown().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("dashboards")
      .update(patch as any)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("dashboards")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const widgetKind = z.enum([
  "kpi_count",
  "status_breakdown",
  "numbers_sum",
  "board_link",
]);

export const createWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { dashboardId: string; kind: string; settings: Record<string, unknown> }) =>
      z
        .object({
          dashboardId: z.string().uuid(),
          kind: widgetKind,
          settings: z.record(z.string(), z.unknown()),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("dashboard_widgets")
      .insert({
        dashboard_id: data.dashboardId,
        kind: data.kind,
        settings: data.settings as any,
        position: { w: 1, h: 1 } as any,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id: string; settings?: Record<string, unknown>; position?: Record<string, unknown> }) =>
      z
        .object({
          id: z.string().uuid(),
          settings: z.record(z.string(), z.unknown()).optional(),
          position: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("dashboard_widgets")
      .update(patch as any)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("dashboard_widgets")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ----- Compute ----- */

export const computeWidget = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { widgetId: string }) =>
    z.object({ widgetId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: widget, error: wErr } = await supabase
      .from("dashboard_widgets")
      .select("id, kind, settings")
      .eq("id", data.widgetId)
      .single();
    if (wErr) throw new Error(wErr.message);
    const settings = (widget.settings as any) ?? {};
    const boardId = settings.boardId as string | undefined;

    if (widget.kind === "board_link") {
      if (!boardId) return { kind: widget.kind, board: null };
      const { data: b } = await supabase
        .from("boards")
        .select("id, name, color")
        .eq("id", boardId)
        .maybeSingle();
      const { count } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("board_id", boardId);
      return { kind: widget.kind, board: b, count: count ?? 0 };
    }

    if (!boardId) return { kind: widget.kind, empty: true };

    if (widget.kind === "kpi_count") {
      const statusOption = settings.statusOptionId as string | undefined;
      const columnId = settings.columnId as string | undefined;
      if (statusOption && columnId) {
        const { data: rows } = await supabase
          .from("item_values")
          .select("item_id, items!inner(board_id)")
          .eq("column_id", columnId)
          .eq("status_option_id", statusOption)
          .eq("items.board_id", boardId);
        return { kind: widget.kind, value: rows?.length ?? 0 };
      }
      const { count } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("board_id", boardId);
      return { kind: widget.kind, value: count ?? 0 };
    }

    if (widget.kind === "status_breakdown") {
      const columnId = settings.columnId as string | undefined;
      if (!columnId) return { kind: widget.kind, empty: true };
      const { data: col } = await supabase
        .from("board_columns")
        .select("settings")
        .eq("id", columnId)
        .single();
      const options = ((col?.settings as any)?.options ?? []) as {
        id: string;
        label: string;
        color?: string;
      }[];
      const { data: vals } = await supabase
        .from("item_values")
        .select("status_option_id, items!inner(board_id)")
        .eq("column_id", columnId)
        .eq("items.board_id", boardId);
      const counts = new Map<string, number>();
      for (const v of vals ?? []) {
        const k = (v as any).status_option_id ?? "__unset";
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return {
        kind: widget.kind,
        buckets: options.map((o) => ({
          id: o.id,
          label: o.label,
          color: o.color ?? "#64748b",
          count: counts.get(o.id) ?? 0,
        })),
        unset: counts.get("__unset") ?? 0,
      };
    }

    if (widget.kind === "numbers_sum") {
      const columnId = settings.columnId as string | undefined;
      if (!columnId) return { kind: widget.kind, empty: true };
      const { data: vals } = await supabase
        .from("item_values")
        .select("number_value, items!inner(board_id)")
        .eq("column_id", columnId)
        .eq("items.board_id", boardId);
      const sum = (vals ?? []).reduce(
        (acc: number, v: any) => acc + (Number(v.number_value) || 0),
        0,
      );
      return { kind: widget.kind, value: sum, count: vals?.length ?? 0 };
    }

    return { kind: widget.kind, empty: true };
  });