import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function maskSecret(s: string | null | undefined) {
  if (!s) return null;
  if (s.length <= 8) return "********";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export const getTessIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("workspace_integrations")
      .select("id, workspace_id, target_board_id, tess_base_url, tess_workspace_id, enabled, shared_secret, created_at, updated_at")
      .eq("workspace_id", data.workspaceId)
      .eq("kind", "tess")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return { ...row, shared_secret: maskSecret(row.shared_secret) };
  });

export const upsertTessIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      workspaceId: string;
      targetBoardId: string | null;
      tessBaseUrl?: string | null;
      tessWorkspaceId?: string | null;
      enabled?: boolean;
      rotateSecret?: boolean;
      sharedSecret?: string | null;
    }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          targetBoardId: z.string().uuid().nullable(),
          tessBaseUrl: z.string().url().nullable().optional(),
          tessWorkspaceId: z.string().max(120).nullable().optional(),
          enabled: z.boolean().optional(),
          rotateSecret: z.boolean().optional(),
          sharedSecret: z.string().min(16).max(256).nullable().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Owner check via RLS — explicit guard for clearer error
    const { data: ok } = await context.supabase.rpc("has_ws_role", {
      _ws: data.workspaceId,
      _user: context.userId,
      _roles: ["owner"],
    });
    if (!ok) throw new Error("Only workspace owners can manage integrations");

    const { data: existing } = await context.supabase
      .from("workspace_integrations")
      .select("id, shared_secret")
      .eq("workspace_id", data.workspaceId)
      .eq("kind", "tess")
      .maybeSingle();

    // Priority: explicit paste > rotate > auto-generate on first create
    const pasted = data.sharedSecret?.trim() || null;
    const newSecret = pasted
      ? pasted
      : !existing || data.rotateSecret
        ? randomToken()
        : null;
    const revealSecret = newSecret;

    if (existing) {
      const patch: any = {
        target_board_id: data.targetBoardId,
        tess_base_url: data.tessBaseUrl ?? null,
        tess_workspace_id: data.tessWorkspaceId ?? null,
      };
      if (data.enabled !== undefined) patch.enabled = data.enabled;
      if (newSecret) patch.shared_secret = newSecret;
      const { error } = await context.supabase
        .from("workspace_integrations")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("workspace_integrations").insert({
        workspace_id: data.workspaceId,
        kind: "tess",
        target_board_id: data.targetBoardId,
        tess_base_url: data.tessBaseUrl ?? null,
        tess_workspace_id: data.tessWorkspaceId ?? null,
        shared_secret: newSecret!,
        enabled: data.enabled ?? true,
        created_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }

    return { ok: true, revealSecret };
  });

export const listIntegrationDispatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("integration_dispatches")
      .select("id, item_id, direction, status_code, error, attempts, next_retry_at, payload, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ============ Integration status / health ============ */

export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ws = data.workspaceId;
    const lastSuccess = async (direction: "inbound" | "outbound") => {
      const { data: row } = await context.supabase
        .from("integration_dispatches")
        .select("created_at")
        .eq("workspace_id", ws)
        .eq("direction", direction)
        .is("error", null)
        .lt("status_code", 400)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return row?.created_at ?? null;
    };
    const [inbound, outbound, failedRes] = await Promise.all([
      lastSuccess("inbound"),
      lastSuccess("outbound"),
      context.supabase
        .from("integration_dispatches")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws)
        .not("error", "is", null),
    ]);
    return {
      lastInbound: inbound,
      lastOutbound: outbound,
      failedCount: failedRes.count ?? 0,
    };
  });

export const pingTess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_ws_role", {
      _ws: data.workspaceId,
      _user: context.userId,
      _roles: ["owner"],
    });
    if (!ok) throw new Error("Only workspace owners can test the integration");
    // Surface specific missing fields to the caller
    const { data: integ } = await context.supabase
      .from("workspace_integrations")
      .select("enabled, tess_base_url, shared_secret")
      .eq("workspace_id", data.workspaceId)
      .eq("kind", "tess")
      .maybeSingle();
    const missing: string[] = [];
    if (!integ) missing.push("integration row");
    else {
      if (!integ.enabled) missing.push("enabled");
      if (!integ.tess_base_url) missing.push("TESS base URL");
      if (!integ.shared_secret) missing.push("shared secret");
    }
    if (missing.length) {
      return { skipped: true as const, missing };
    }
    const { dispatchToTess } = await import("./tess-dispatch.server");
    const res = await dispatchToTess({
      workspaceId: data.workspaceId,
      itemId: null,
      type: "ping",
      body: { sent_at: new Date().toISOString() },
    });
    return res;
  });

export const retryDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dispatchId: string }) =>
    z.object({ dispatchId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("integration_dispatches")
      .select("id, workspace_id, item_id, direction, payload, attempts")
      .eq("id", data.dispatchId)
      .maybeSingle();
    if (!row) throw new Error("Dispatch not found");

    const { data: ok } = await context.supabase.rpc("has_ws_role", {
      _ws: row.workspace_id,
      _user: context.userId,
      _roles: ["owner"],
    });
    if (!ok) throw new Error("Only workspace owners can retry dispatches");
    if (row.direction !== "outbound") throw new Error("Only outbound dispatches can be retried");

    const payload = row.payload as any;
    const type = payload?.type ?? "item.updated";
    const { dispatchToTess } = await import("./tess-dispatch.server");
    const { type: _ignored, ...rest } = payload ?? {};
    return await dispatchToTess({
      workspaceId: row.workspace_id,
      itemId: row.item_id ?? null,
      type,
      body: rest,
    });
  });

/* ============ Backfill ============ */

export const backfillTessBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_ws_role", {
      _ws: data.workspaceId,
      _user: context.userId,
      _roles: ["owner"],
    });
    if (!ok) throw new Error("Only workspace owners can run a backfill");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: integ } = await supabaseAdmin
      .from("workspace_integrations")
      .select("target_board_id")
      .eq("workspace_id", data.workspaceId)
      .eq("kind", "tess")
      .maybeSingle();
    if (!integ?.target_board_id) throw new Error("No target board configured");
    const boardId = integ.target_board_id;

    // Find all TESS-linked items on this board
    const { data: items } = await supabaseAdmin
      .from("items")
      .select("id")
      .eq("board_id", boardId);
    const itemIds = (items ?? []).map((i: any) => i.id);
    if (itemIds.length === 0) return { processed: 0, skipped: 0 };

    const { data: refs } = await supabaseAdmin
      .from("item_external_refs")
      .select("item_id, external_id")
      .eq("source", "tess")
      .in("item_id", itemIds);

    const { processTessEvent } = await import("@/lib/tess-ingest.server");

    let processed = 0;
    let skipped = 0;
    for (const ref of refs ?? []) {
      // most recent inbound dispatch carrying this event id
      const { data: dispatches } = await supabaseAdmin
        .from("integration_dispatches")
        .select("payload, created_at")
        .eq("workspace_id", data.workspaceId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(200);
      const match = (dispatches ?? []).find(
        (d: any) => d?.payload?.event?.id === ref.external_id,
      );
      if (!match) {
        skipped++;
        continue;
      }
      try {
        await processTessEvent({
          boardId,
          type: (match.payload as any).type ?? "event.updated",
          event: (match.payload as any).event,
        });
        processed++;
      } catch {
        skipped++;
      }
    }
    return { processed, skipped };
  });

/* ============ Board embed token management ============ */

export const getBoardEmbedToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string }) =>
    z.object({ boardId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("boards")
      .select("id, embed_token")
      .eq("id", data.boardId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const setBoardEmbedEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string; enabled: boolean }) =>
    z.object({ boardId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = data.enabled ? randomToken() : null;
    const { error } = await context.supabase
      .from("boards")
      .update({ embed_token: token })
      .eq("id", data.boardId);
    if (error) throw new Error(error.message);
    return { token };
  });

/* ============ Public read-only embed fetch ============ */

export const fetchEmbedBoard = createServerFn({ method: "GET" })
  .inputValidator((d: { boardId: string; token: string }) =>
    z.object({ boardId: z.string().uuid(), token: z.string().min(16) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: board } = await supabaseAdmin
      .from("boards")
      .select("id, name, color, embed_token")
      .eq("id", data.boardId)
      .maybeSingle();
    if (!board || board.embed_token !== data.token) {
      throw new Error("Embed token invalid");
    }
    const [cols, groups, items, values] = await Promise.all([
      supabaseAdmin
        .from("board_columns")
        .select("id, kind, title, settings, position")
        .eq("board_id", board.id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("groups")
        .select("id, name, color, position")
        .eq("board_id", board.id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("items")
        .select("id, group_id, title, position")
        .eq("board_id", board.id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("item_values")
        .select("item_id, column_id, text_value, number_value, date_value, status_option_id")
        .in(
          "item_id",
          (
            await supabaseAdmin.from("items").select("id").eq("board_id", board.id)
          ).data?.map((r: any) => r.id) ?? ["00000000-0000-0000-0000-000000000000"],
        ),
    ]);
    return {
      board: { id: board.id, name: board.name, color: board.color },
      columns: cols.data ?? [],
      groups: groups.data ?? [],
      items: items.data ?? [],
      values: values.data ?? [],
    };
  });