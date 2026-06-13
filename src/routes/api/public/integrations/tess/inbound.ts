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

function formatTime(iso: string): string {
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

        const ev = parsed.event;

        // Find or create the linked item
        const { data: existingRef } = await supabaseAdmin
          .from("item_external_refs")
          .select("item_id")
          .eq("source", "tess")
          .eq("external_id", ev.id)
          .maybeSingle();

        let itemId = existingRef?.item_id ?? null;

        if (parsed.type === "event.cancelled" && itemId) {
          await supabaseAdmin.from("items").delete().eq("id", itemId);
          await supabaseAdmin.from("integration_dispatches").insert({
            workspace_id: integ.workspace_id,
            item_id: null,
            direction: "inbound",
            payload: parsed as any,
            status_code: 200,
          });
          return new Response("ok");
        }

        if (!itemId) {
          // need a group — first group on the board, create one if none
          let { data: group } = await supabaseAdmin
            .from("groups")
            .select("id")
            .eq("board_id", integ.target_board_id)
            .order("position", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!group) {
            const { data: g } = await supabaseAdmin
              .from("groups")
              .insert({
                board_id: integ.target_board_id,
                name: "From TESS",
                color: "#6366f1",
                position: 0,
              })
              .select("id")
              .single();
            group = g;
          }
          const { data: newItem, error: insErr } = await supabaseAdmin
            .from("items")
            .insert({
              board_id: integ.target_board_id,
              group_id: group!.id,
              title: ev.title ?? "Untitled event",
              position: Date.now(),
            })
            .select("id")
            .single();
          if (insErr) return new Response(insErr.message, { status: 500 });
          itemId = newItem.id;
          await supabaseAdmin.from("item_external_refs").insert({
            item_id: itemId,
            source: "tess",
            external_id: ev.id,
            external_kind: "event",
            external_url: ev.url ?? null,
          });
        } else if (ev.title) {
          await supabaseAdmin.from("items").update({ title: ev.title }).eq("id", itemId);
        }

        // Map known columns by title (case-insensitive)
        const { data: cols } = await supabaseAdmin
          .from("board_columns")
          .select("id, kind, title, settings")
          .eq("board_id", integ.target_board_id);

        const byTitle = new Map(
          (cols ?? []).map((c: any) => [c.title.toLowerCase(), c]),
        );

        async function upsertValue(colId: string, patch: Record<string, any>) {
          await supabaseAdmin
            .from("item_values")
            .upsert(
              { item_id: itemId!, column_id: colId, ...patch, updated_at: new Date().toISOString() },
              { onConflict: "item_id,column_id" },
            );
        }

        if (ev.starts_at) {
          const dateCol =
            byTitle.get("due date") ||
            byTitle.get("due") ||
            byTitle.get("event date") ||
            byTitle.get("date") ||
            byTitle.get("starts at") ||
            byTitle.get("when");
          if (dateCol) await upsertValue(dateCol.id, { date_value: ev.starts_at });
        }
        if (ev.venue) {
          const venueCol = byTitle.get("venue") || byTitle.get("location");
          if (venueCol) await upsertValue(venueCol.id, { text_value: ev.venue });
        }
        if (ev.status) {
          const statusCol = byTitle.get("status");
          if (statusCol && statusCol.kind === "status") {
            const options: any[] = (statusCol.settings as any)?.options ?? [];
            const match = options.find(
              (o) => (o.label ?? "").toLowerCase() === ev.status!.toLowerCase(),
            );
            if (match) await upsertValue(statusCol.id, { status_option_id: match.id });
          }
        }
        if (ev.assignee_email) {
          const peopleCol =
            byTitle.get("owner") ||
            byTitle.get("assignee") ||
            byTitle.get("people");
          if (peopleCol && peopleCol.kind === "people") {
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .ilike("email", ev.assignee_email)
              .maybeSingle();
            if (prof) await upsertValue(peopleCol.id, { people_user_ids: [prof.id] });
          }
        }

        // Link column ← TESS event URL
        if (ev.url) {
          const linkCol =
            byTitle.get("link") ||
            byTitle.get("tess link") ||
            byTitle.get("event link") ||
            byTitle.get("url");
          if (linkCol) {
            if (linkCol.kind === "link") {
              await upsertValue(linkCol.id, { link_url: ev.url, link_label: ev.title ?? ev.url });
            } else {
              await upsertValue(linkCol.id, { text_value: ev.url });
            }
          }
        }

        // Notes column ← consolidated auto-block (preserves manual notes outside markers)
        const autoLines: string[] = [];
        if (ev.venue) autoLines.push(`Location: ${ev.venue}`);
        if (ev.doors_at) autoLines.push(`Doors: ${formatTime(ev.doors_at)}`);
        if (ev.starts_at) {
          autoLines.push(
            ev.ends_at
              ? `Show: ${formatTime(ev.starts_at)} – ${formatTime(ev.ends_at)}`
              : `Show: ${formatTime(ev.starts_at)}`,
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
        if (ev.notes) autoLines.push("", ev.notes);

        if (autoLines.length > 0) {
          const notesCol =
            byTitle.get("notes") ||
            byTitle.get("details") ||
            byTitle.get("info");
          if (notesCol) {
            const { data: existingVal } = await supabaseAdmin
              .from("item_values")
              .select("text_value")
              .eq("item_id", itemId!)
              .eq("column_id", notesCol.id)
              .maybeSingle();
            const prior = (existingVal as any)?.text_value ?? "";
            const autoBlock =
              `<!-- tess:auto -->\n${autoLines.join("\n")}\n<!-- /tess:auto -->`;
            const next = mergeAutoBlock(prior, autoBlock);
            await upsertValue(notesCol.id, { text_value: next });
          }
        }

        await supabaseAdmin.from("item_activity").insert({
          item_id: itemId,
          actor_id: null,
          kind: "system",
          payload: { source: "tess", type: parsed.type } as any,
        });

        await supabaseAdmin.from("integration_dispatches").insert({
          workspace_id: integ.workspace_id,
          item_id: itemId,
          direction: "inbound",
          payload: parsed as any,
          status_code: 200,
        });

        return Response.json({ ok: true, item_id: itemId });
      },
    },
  },
});