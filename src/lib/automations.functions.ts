import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const triggerSchema = z.object({
  kind: z.literal("status_change"),
  columnId: z.string().uuid(),
  optionId: z.string().min(1),
});

const actionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("set_status"),
    columnId: z.string().uuid(),
    optionId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("notify"),
    message: z.string().min(1).max(280),
  }),
]);

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string }) =>
    z.object({ boardId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("automation_rules")
      .select("id, name, trigger, actions, enabled, created_at")
      .eq("board_id", data.boardId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { boardId: string; name: string; trigger: unknown; actions: unknown[] }) =>
      z
        .object({
          boardId: z.string().uuid(),
          name: z.string().min(1).max(120),
          trigger: triggerSchema,
          actions: z.array(actionSchema).min(1),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("automation_rules")
      .insert({
        board_id: data.boardId,
        name: data.name,
        trigger: data.trigger as any,
        actions: data.actions as any,
        enabled: true,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      name?: string;
      trigger?: unknown;
      actions?: unknown[];
      enabled?: boolean;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          name: z.string().min(1).max(120).optional(),
          trigger: triggerSchema.optional(),
          actions: z.array(actionSchema).min(1).optional(),
          enabled: z.boolean().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("automation_rules")
      .update(patch as any)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("automation_rules")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAutomationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string }) =>
    z.object({ boardId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Limit to rules belonging to this board
    const { data: rules } = await context.supabase
      .from("automation_rules")
      .select("id, name")
      .eq("board_id", data.boardId);
    const ids = (rules ?? []).map((r) => r.id);
    if (!ids.length) return [];
    const { data: runs, error } = await context.supabase
      .from("automation_runs")
      .select("id, rule_id, item_id, status, error, ran_at")
      .in("rule_id", ids)
      .order("ran_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const nameById = new Map((rules ?? []).map((r) => [r.id, r.name]));
    return (runs ?? []).map((r: any) => ({ ...r, rule_name: nameById.get(r.rule_id) ?? "Rule" }));
  });