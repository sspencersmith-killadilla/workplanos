import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workspace";

export const listMyWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workspaces")
      .select("id, name, slug, color, owner_id, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  });

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ws, error } = await context.supabase
      .from("workspaces")
      .select("id, name, slug, color, owner_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ws) throw new Error("Workspace not found");
    return ws;
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; color?: string }) =>
    z.object({ name: z.string().min(1).max(60), color: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const baseSlug = slugify(data.name);
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: ws, error } = await context.supabase
      .from("workspaces")
      .insert({ name: data.name, slug, owner_id: context.userId, color: data.color ?? "#6366f1" })
      .select("id, name, slug, color, owner_id")
      .single();
    if (error) throw new Error(error.message);
    return ws;
  });

export const getMyWorkspaceRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { role: (row?.role as string | undefined) ?? null };
  });

export const updateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name?: string; color?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(60).optional(),
        color: z.string().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("workspaces").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ws, error: wsErr } = await context.supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", data.id)
      .maybeSingle();
    if (wsErr) throw new Error(wsErr.message);
    if (!ws) throw new Error("Workspace not found");
    if (ws.owner_id !== context.userId) {
      throw new Error("Only the workspace owner can delete this workspace");
    }
    const { error } = await context.supabase.from("workspaces").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });