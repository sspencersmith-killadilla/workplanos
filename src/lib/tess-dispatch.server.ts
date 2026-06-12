import { createHmac } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DispatchType =
  | "item.updated"
  | "item.status_changed"
  | "item.assignee_changed"
  | "item.renamed"
  | "item.deleted"
  | "ping";

export async function dispatchToTess(args: {
  workspaceId: string;
  itemId: string | null;
  type: DispatchType;
  body: Record<string, unknown>;
}) {
  const { workspaceId, itemId, type, body } = args;
  try {
    const { data: integ } = await supabaseAdmin
      .from("workspace_integrations")
      .select("tess_base_url, shared_secret, enabled")
      .eq("workspace_id", workspaceId)
      .eq("kind", "tess")
      .maybeSingle();

    if (!integ?.enabled || !integ.tess_base_url || !integ.shared_secret) {
      return { skipped: true as const };
    }

    const payload = JSON.stringify({ type, ...body });
    const sig = createHmac("sha256", integ.shared_secret).update(payload).digest("hex");
    const url = `${integ.tess_base_url.replace(/\/$/, "")}/api/public/integrations/wpo/inbound`;

    let statusCode: number | null = null;
    let err: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wpo-workspace": workspaceId,
          "x-wpo-signature": `sha256=${sig}`,
        },
        body: payload,
      });
      statusCode = res.status;
      if (!res.ok) err = (await res.text().catch(() => null))?.slice(0, 500) ?? null;
    } catch (e: any) {
      err = e?.message ?? "fetch failed";
    }

    await supabaseAdmin.from("integration_dispatches").insert({
      workspace_id: workspaceId,
      item_id: itemId,
      direction: "outbound",
      payload: JSON.parse(payload),
      status_code: statusCode,
      error: err,
      attempts: 1,
      next_retry_at: err || (statusCode && statusCode >= 400)
        ? new Date(Date.now() + 5 * 60_000).toISOString()
        : null,
    });

    return { ok: !err && (statusCode ?? 0) < 400, statusCode, error: err };
  } catch (e: any) {
    // Never throw from dispatch — outbound sync is best-effort
    return { ok: false, error: e?.message ?? "dispatch error" };
  }
}

export async function workspaceIdForItem(itemId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("items")
    .select("board:boards(workspace_id)")
    .eq("id", itemId)
    .maybeSingle();
  return ((data as any)?.board?.workspace_id as string) ?? null;
}

export async function externalRefForItem(itemId: string) {
  const { data } = await supabaseAdmin
    .from("item_external_refs")
    .select("source, external_id")
    .eq("item_id", itemId)
    .maybeSingle();
  return data;
}