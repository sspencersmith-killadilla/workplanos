import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const payloadSchema = z.object({
  type: z.enum(["event.created", "event.updated", "event.cancelled", "gig.assigned"]),
  event: z.object({
    id: z.string().min(1),
    title: z.string().max(500).optional(),
    starts_at: z.string().optional(),
    ends_at: z.string().nullable().optional(),
    doors_at: z.string().nullable().optional(),
    venue: z.string().max(500).optional(),
    status: z.string().max(120).optional(),
    assignee_email: z.string().email().optional(),
    tickets_available: z.number().nullable().optional(),
    tickets_sold: z.number().nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    url: z.string().url().optional(),
    genre: z.string().max(120).optional(),
    promoter: z.string().max(200).optional(),
    support_acts: z.string().max(500).optional(),
    settlement_total: z.number().nullable().optional(),
    currency: z.string().max(8).optional(),
  }),
});

function verifySignature(secret: string, body: string, header: string | null) {
  if (!header) return false;
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/integrations/tess/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const workspaceId = request.headers.get("x-tess-workspace");
        const signature = request.headers.get("x-tess-signature");
        const raw = await request.text();
        if (!workspaceId) return new Response("Missing workspace header", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // TESS may send either WPO's workspace_id (correct) or its own
        // department/workspace UUID (what its UI shows). Accept both by
        // also matching against the tess_workspace_id we stored.
        const { data: integ } = await supabaseAdmin
          .from("workspace_integrations")
          .select("id, workspace_id, target_board_id, shared_secret, enabled, tess_workspace_id")
          .eq("kind", "tess")
          .or(`workspace_id.eq.${workspaceId},tess_workspace_id.eq.${workspaceId}`)
          .maybeSingle();

        if (!integ || !integ.enabled) return new Response("Not found", { status: 404 });
        if (!verifySignature(integ.shared_secret, raw, signature)) {
          return new Response("Invalid signature", { status: 401 });
        }

        // Lightweight health check from the TESS side
        let preview: any;
        try { preview = JSON.parse(raw); } catch { preview = null; }
        if (preview?.type === "ping") {
          await supabaseAdmin.from("integration_dispatches").insert({
            workspace_id: integ.workspace_id,
            item_id: null,
            direction: "inbound",
            payload: { type: "ping" } as any,
            status_code: 200,
          });
          return Response.json({ ok: true, pong: true });
        }

        let parsed: z.infer<typeof payloadSchema>;
        try {
          parsed = payloadSchema.parse(JSON.parse(raw));
        } catch (e: any) {
          return new Response(`Invalid payload: ${e?.message ?? "bad json"}`, { status: 400 });
        }

        if (!integ.target_board_id) {
          return new Response("Integration has no target board", { status: 409 });
        }

        try {
          const { processTessEvent } = await import("@/lib/tess-ingest.server");
          const result = await processTessEvent({
            boardId: integ.target_board_id,
            type: parsed.type,
            event: parsed.event,
          });
          await supabaseAdmin.from("integration_dispatches").insert({
            workspace_id: integ.workspace_id,
            item_id: result.itemId,
            direction: "inbound",
            payload: parsed as any,
            status_code: 200,
          });
          return Response.json({ ok: true, item_id: result.itemId, deleted: result.deleted ?? false });
        } catch (e: any) {
          await supabaseAdmin.from("integration_dispatches").insert({
            workspace_id: integ.workspace_id,
            item_id: null,
            direction: "inbound",
            payload: parsed as any,
            status_code: 500,
            error: (e?.message ?? "ingest failed").slice(0, 500),
          });
          return new Response(e?.message ?? "ingest failed", { status: 500 });
        }
      },
    },
  },
});