import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* ====================== BOARDS ====================== */

export const listBoards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("boards")
      .select("id, name, description, icon, color, position, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return rows;
  });

export const getBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [boardRes, colsRes, groupsRes, itemsRes, valuesRes, viewsRes] = await Promise.all([
      supabase
        .from("boards")
        .select("id, workspace_id, name, description, icon, color")
        .eq("id", data.id)
        .single(),
      supabase
        .from("board_columns")
        .select("id, kind, title, settings, position, width")
        .eq("board_id", data.id)
        .order("position", { ascending: true }),
      supabase
        .from("groups")
        .select("id, name, color, position, collapsed")
        .eq("board_id", data.id)
        .order("position", { ascending: true }),
      supabase
        .from("items")
        .select("id, group_id, parent_item_id, title, position, created_at, created_by, completed_at")
        .eq("board_id", data.id)
        .order("position", { ascending: true }),
      supabase
        .from("item_values")
        .select("item_id, column_id, text_value, number_value, date_value, date_end_value, link_url, link_label, status_option_id, people_user_ids")
        .in(
          "item_id",
          (
            await supabase.from("items").select("id").eq("board_id", data.id)
          ).data?.map((r: any) => r.id) ?? ["00000000-0000-0000-0000-000000000000"],
        ),
      supabase
        .from("board_views")
        .select("id, kind, name, settings, position")
        .eq("board_id", data.id)
        .order("position", { ascending: true }),
    ]);
    if (boardRes.error) throw new Error(boardRes.error.message);
    return {
      board: boardRes.data,
      columns: colsRes.data ?? [],
      groups: groupsRes.data ?? [],
      items: itemsRes.data ?? [],
      values: valuesRes.data ?? [],
      views: viewsRes.data ?? [],
    };
  });

export const createBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; name: string; color?: string }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(80),
        color: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: maxRow } = await supabase
      .from("boards")
      .select("position")
      .eq("workspace_id", data.workspaceId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pos = (maxRow?.position ?? 0) + 1024;
    const { data: board, error } = await supabase
      .from("boards")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        color: data.color ?? "#6366f1",
        position: pos,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Seed default columns, group, view
    const boardId = board.id;
    await supabase.from("board_columns").insert([
      {
        board_id: boardId,
        kind: "status",
        title: "Status",
        position: 1024,
        settings: {
          options: [
            { id: "working", label: "Working on it", color: "var(--status-working)" },
            { id: "stuck", label: "Stuck", color: "var(--status-stuck)" },
            { id: "done", label: "Done", color: "var(--status-done)" },
          ],
        },
      },
      { board_id: boardId, kind: "people", title: "Owner", position: 2048, settings: {} },
      { board_id: boardId, kind: "date", title: "Due date", position: 3072, settings: {} },
    ]);
    await supabase
      .from("groups")
      .insert([
        { board_id: boardId, name: "This week", color: "#6366f1", position: 1024 },
        { board_id: boardId, name: "Backlog", color: "#64748b", position: 2048 },
      ]);
    await supabase
      .from("board_views")
      .insert([
        { board_id: boardId, kind: "table", name: "Main Table", position: 1024 },
        { board_id: boardId, kind: "kanban", name: "Kanban", position: 2048 },
        { board_id: boardId, kind: "calendar", name: "Calendar", position: 3072 },
        { board_id: boardId, kind: "workload", name: "Workload", position: 4096 },
      ]);
    return { id: boardId };
  });

export const updateBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name?: string; description?: string; color?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(500).optional(),
        color: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("boards").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("boards").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ====================== GROUPS ====================== */

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string; name?: string; color?: string }) =>
    z
      .object({
        boardId: z.string().uuid(),
        name: z.string().min(1).max(60).optional(),
        color: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: maxRow } = await context.supabase
      .from("groups")
      .select("position")
      .eq("board_id", data.boardId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pos = (maxRow?.position ?? 0) + 1024;
    const { data: g, error } = await context.supabase
      .from("groups")
      .insert({
        board_id: data.boardId,
        name: data.name ?? "New Group",
        color: data.color ?? "#64748b",
        position: pos,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: g.id };
  });

export const updateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name?: string; color?: string; collapsed?: boolean; position?: number }) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().max(60).optional(),
        color: z.string().optional(),
        collapsed: z.boolean().optional(),
        position: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("groups").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("groups").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ====================== ITEMS ====================== */

export const createItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { boardId: string; groupId: string | null; title?: string; parentId?: string | null }) =>
      z
        .object({
          boardId: z.string().uuid(),
          groupId: z.string().uuid().nullable(),
          title: z.string().max(200).optional(),
          parentId: z.string().uuid().nullable().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: maxRow } = await context.supabase
      .from("items")
      .select("position")
      .eq("board_id", data.boardId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pos = (maxRow?.position ?? 0) + 1024;
    const { data: item, error } = await context.supabase
      .from("items")
      .insert({
        board_id: data.boardId,
        group_id: data.groupId,
        parent_item_id: data.parentId ?? null,
        title: data.title ?? "New item",
        position: pos,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: item.id };
  });

export const updateItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id: string; title?: string; groupId?: string | null; position?: number }) =>
      z
        .object({
          id: z.string().uuid(),
          title: z.string().min(1).max(300).optional(),
          groupId: z.string().uuid().nullable().optional(),
          position: z.number().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, groupId, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (groupId !== undefined) patch.group_id = groupId;
    const { error } = await context.supabase.from("items").update(patch as any).eq("id", id);
    if (error) throw new Error(error.message);
    if (rest.title !== undefined) {
      await context.supabase
        .from("item_activity")
        .insert({ item_id: id, actor_id: context.userId, kind: "title_changed", payload: { title: rest.title } });
      // Outbound: notify TESS when a linked item is renamed
      try {
        const { dispatchToTess, externalRefForItem, workspaceIdForItem } = await import(
          "./tess-dispatch.server"
        );
        const ref = await externalRefForItem(id);
        if (ref?.source === "tess") {
          const wsId = await workspaceIdForItem(id);
          if (wsId) {
            await dispatchToTess({
              workspaceId: wsId,
              itemId: id,
              type: "item.renamed",
              body: { external_id: ref.external_id, title: rest.title },
            });
          }
        }
      } catch {}
    }
    if (groupId !== undefined) {
      await context.supabase
        .from("item_activity")
        .insert({ item_id: id, actor_id: context.userId, kind: "group_changed", payload: { groupId } });
    }
    return { ok: true };
  });

export const deleteItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Capture link info BEFORE delete so we can notify TESS
    let tessRef: { external_id: string } | null = null;
    let wsId: string | null = null;
    try {
      const { externalRefForItem, workspaceIdForItem } = await import("./tess-dispatch.server");
      const ref = await externalRefForItem(data.id);
      if (ref?.source === "tess") {
        tessRef = { external_id: ref.external_id };
        wsId = await workspaceIdForItem(data.id);
      }
    } catch {}

    const { error } = await context.supabase.from("items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    if (tessRef && wsId) {
      try {
        const { dispatchToTess } = await import("./tess-dispatch.server");
        await dispatchToTess({
          workspaceId: wsId,
          itemId: null,
          type: "item.deleted",
          body: { external_id: tessRef.external_id },
        });
      } catch {}
    }
    return { ok: true };
  });

export const setItemCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; completed: boolean }) =>
    z.object({ id: z.string().uuid(), completed: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const completed_at = data.completed ? new Date().toISOString() : null;
    const { error } = await context.supabase
      .from("items")
      .update({ completed_at })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("item_activity").insert({
      item_id: data.id,
      actor_id: context.userId,
      kind: data.completed ? "completed" : "reopened",
      payload: {},
    });
    return { ok: true, completed_at };
  });

/* ====================== COLUMNS ====================== */

export const createColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { boardId: string; kind: string; title: string; settings?: Record<string, unknown> }) =>
      z
        .object({
          boardId: z.string().uuid(),
          kind: z.enum(["text", "status", "people", "date", "timeline", "number", "formula", "link"]),
          title: z.string().min(1).max(60),
          settings: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: maxRow } = await context.supabase
      .from("board_columns")
      .select("position")
      .eq("board_id", data.boardId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pos = (maxRow?.position ?? 0) + 1024;
    let settings = data.settings ?? {};
    if (data.kind === "status" && !("options" in settings)) {
      settings = {
        options: [
          { id: "working", label: "Working on it", color: "var(--status-working)" },
          { id: "stuck", label: "Stuck", color: "var(--status-stuck)" },
          { id: "done", label: "Done", color: "var(--status-done)" },
        ],
      };
    }
    const { data: c, error } = await context.supabase
      .from("board_columns")
      .insert({
        board_id: data.boardId,
        kind: data.kind as any,
        title: data.title,
        settings: settings as any,
        position: pos,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: c.id };
  });

export const updateColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id: string; title?: string; settings?: Record<string, unknown>; width?: number }) =>
      z
        .object({
          id: z.string().uuid(),
          title: z.string().min(1).max(60).optional(),
          settings: z.record(z.string(), z.unknown()).optional(),
          width: z.number().int().min(60).max(800).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("board_columns").update(patch as any).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("board_columns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ====================== CELL VALUES ====================== */

export const upsertValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      itemId: string;
      columnId: string;
      text_value?: string | null;
      number_value?: number | null;
      date_value?: string | null;
      date_end_value?: string | null;
      link_url?: string | null;
      link_label?: string | null;
      status_option_id?: string | null;
      people_user_ids?: string[] | null;
    }) =>
      z
        .object({
          itemId: z.string().uuid(),
          columnId: z.string().uuid(),
          text_value: z.string().nullable().optional(),
          number_value: z.number().nullable().optional(),
          date_value: z.string().nullable().optional(),
          date_end_value: z.string().nullable().optional(),
          link_url: z.string().nullable().optional(),
          link_label: z.string().nullable().optional(),
          status_option_id: z.string().nullable().optional(),
          people_user_ids: z.array(z.string().uuid()).nullable().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { itemId, columnId, ...rest } = data;
    const payload = { item_id: itemId, column_id: columnId, ...rest, updated_at: new Date().toISOString() };
    const { error } = await context.supabase
      .from("item_values")
      .upsert(payload, { onConflict: "item_id,column_id" });
    if (error) throw new Error(error.message);

    // Outbound dispatch — fire-and-forget to TESS if this item is linked
    try {
      const { dispatchToTess, externalRefForItem, workspaceIdForItem } = await import(
        "./tess-dispatch.server"
      );
      const ref = await externalRefForItem(itemId);
      if (ref?.source === "tess") {
        const wsId = await workspaceIdForItem(itemId);
        if (wsId) {
          // Resolve human-friendly fields for typed events
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: col } = await supabaseAdmin
            .from("board_columns")
            .select("kind, title, settings")
            .eq("id", columnId)
            .maybeSingle();

          let type: "item.updated" | "item.status_changed" | "item.assignee_changed" =
            "item.updated";
          const changes: Record<string, unknown> = { columnId, columnTitle: col?.title };

          if (col?.kind === "status" && rest.status_option_id !== undefined) {
            type = "item.status_changed";
            const options: any[] = (col.settings as any)?.options ?? [];
            const match = options.find((o) => o.id === rest.status_option_id);
            changes.status_option_id = rest.status_option_id;
            changes.status_label = match?.label ?? null;
          } else if (col?.kind === "people" && rest.people_user_ids !== undefined) {
            type = "item.assignee_changed";
            const ids = rest.people_user_ids ?? [];
            if (ids.length > 0) {
              const { data: profs } = await supabaseAdmin
                .from("profiles")
                .select("id, email")
                .in("id", ids);
              changes.assignee_emails = (profs ?? []).map((p: any) => p.email).filter(Boolean);
            } else {
              changes.assignee_emails = [];
            }
          } else {
            Object.assign(changes, rest);
          }

          await dispatchToTess({
            workspaceId: wsId,
            itemId,
            type,
            body: { external_id: ref.external_id, changes },
          });
        }
      }
    } catch {
      // never block a value update on external sync
    }

    // Run synchronous automations matching this status change
    if (rest.status_option_id !== undefined) {
      try {
        const { data: item } = await context.supabase
          .from("items")
          .select("board_id")
          .eq("id", itemId)
          .single();
        if (item) {
          const { data: rules } = await context.supabase
            .from("automation_rules")
            .select("id, trigger, actions")
            .eq("board_id", item.board_id)
            .eq("enabled", true);
          for (const rule of rules ?? []) {
            const trig = (rule as any).trigger;
            if (trig?.kind === "status_change" && trig.columnId === columnId && trig.optionId === rest.status_option_id) {
              for (const action of (rule as any).actions ?? []) {
                if (action.kind === "set_status") {
                  await context.supabase.from("item_values").upsert(
                    { item_id: itemId, column_id: action.columnId, status_option_id: action.optionId },
                    { onConflict: "item_id,column_id" },
                  );
                } else if (action.kind === "notify") {
                  await context.supabase.from("notifications").insert({
                    user_id: context.userId,
                    kind: "automation",
                    payload: { message: action.message ?? "Automation fired", item_id: itemId },
                  });
                }
              }
              await context.supabase
                .from("automation_runs")
                .insert({ rule_id: rule.id, item_id: itemId, status: "ok" });
            }
          }
        }
      } catch (e) {
        // swallow — do not block the value update
      }
    }

    return { ok: true };
  });