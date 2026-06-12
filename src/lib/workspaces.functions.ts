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