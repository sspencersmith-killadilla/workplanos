import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 40) || "form"
  );
}

/* ---------- Admin (auth) ---------- */

export const listForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string }) =>
    z.object({ boardId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("forms")
      .select("id, slug, title, description, fields, is_published, redirect_url, created_at")
      .eq("board_id", data.boardId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { boardId: string; title: string }) =>
    z
      .object({ boardId: z.string().uuid(), title: z.string().min(1).max(120) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const base = slugify(data.title);
    const slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: row, error } = await context.supabase
      .from("forms")
      .insert({
        board_id: data.boardId,
        title: data.title,
        slug,
        fields: { groupId: null, items: [] } as any,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      title?: string;
      description?: string | null;
      fields?: unknown;
      is_published?: boolean;
      redirect_url?: string | null;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          title: z.string().min(1).max(120).optional(),
          description: z.string().max(500).nullable().optional(),
          fields: z.unknown().optional(),
          is_published: z.boolean().optional(),
          redirect_url: z
            .string()
            .max(500)
            .url()
            .refine((u) => /^https?:\/\//i.test(u), {
              message: "Only http(s) URLs are allowed",
            })
            .nullable()
            .optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("forms").update(patch as any).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("forms").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { formId: string }) => z.object({ formId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("form_submissions")
      .select("id, payload, submitted_at, item_id")
      .eq("form_id", data.formId)
      .order("submitted_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ---------- Public (no auth) ---------- */

export const getPublicForm = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) =>
    z.object({ slug: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: form, error } = await supabaseAdmin
      .from("forms")
      .select("id, board_id, title, description, fields, is_published, redirect_url")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!form || !form.is_published) {
      throw new Error("Form not found");
    }

    const fields = (form.fields as any) ?? { items: [] };
    const columnIds: string[] = Array.isArray(fields.items)
      ? fields.items.map((f: any) => f.columnId).filter(Boolean)
      : [];
    let columns: any[] = [];
    if (columnIds.length) {
      const { data: cols } = await supabaseAdmin
        .from("board_columns")
        .select("id, kind, title, settings")
        .in("id", columnIds);
      columns = cols ?? [];
    }
    return {
      form: {
        id: form.id,
        title: form.title,
        description: form.description,
        fields,
        redirect_url: form.redirect_url,
      },
      columns,
    };
  });

export const submitPublicForm = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string; title: string; values: Record<string, unknown> }) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        title: z.string().min(1).max(300),
        values: z.record(z.string().uuid(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: form, error: fErr } = await supabaseAdmin
      .from("forms")
      .select("id, board_id, fields, is_published")
      .eq("slug", data.slug)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!form || !form.is_published) throw new Error("Form not available");

    const fields = (form.fields as any) ?? { groupId: null, items: [] };
    const groupId: string | null = fields.groupId ?? null;

    // resolve max position
    const { data: maxRow } = await supabaseAdmin
      .from("items")
      .select("position")
      .eq("board_id", form.board_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pos = (maxRow?.position ?? 0) + 1024;

    const { data: item, error: iErr } = await supabaseAdmin
      .from("items")
      .insert({
        board_id: form.board_id,
        group_id: groupId,
        title: data.title,
        position: pos,
      })
      .select("id")
      .single();
    if (iErr) throw new Error(iErr.message);

    // load columns to know how to map values
    const colIds = (fields.items ?? []).map((f: any) => f.columnId).filter(Boolean);
    let colMap = new Map<string, { id: string; kind: string }>();
    if (colIds.length) {
      const { data: cols } = await supabaseAdmin
        .from("board_columns")
        .select("id, kind")
        .in("id", colIds);
      colMap = new Map((cols ?? []).map((c: any) => [c.id, c]));
    }

    const rows: any[] = [];
    for (const [columnId, raw] of Object.entries(data.values)) {
      const col = colMap.get(columnId);
      if (!col) continue;
      const base: any = { item_id: item.id, column_id: columnId };
      if (raw == null || raw === "") continue;
      switch (col.kind) {
        case "text":
          base.text_value = String(raw).slice(0, 2000);
          break;
        case "number":
          base.number_value = Number(raw);
          if (Number.isNaN(base.number_value)) continue;
          break;
        case "date":
          base.date_value = String(raw);
          break;
        case "status":
          base.status_option_id = String(raw);
          break;
        case "link":
          base.link_url = String(raw).slice(0, 500);
          break;
        default:
          base.text_value = String(raw).slice(0, 2000);
      }
      rows.push(base);
    }
    if (rows.length) {
      await supabaseAdmin.from("item_values").upsert(rows, { onConflict: "item_id,column_id" });
    }

    await supabaseAdmin.from("form_submissions").insert({
      form_id: form.id,
      item_id: item.id,
      payload: data.values as any,
    });

    return { ok: true };
  });