import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertSuperAdmin(ctx: any) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "super_admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: super-admin required");
}

export const isSuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (error) return false;
    return Boolean(data);
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { q?: string }) =>
    z.object({ q: z.string().max(200).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    let query = context.supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, is_locked, locked_at, locked_reason")
      .order("email", { ascending: true })
      .limit(500);
    if (data.q) {
      query = query.or(`email.ilike.%${data.q}%,full_name.ilike.%${data.q}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("user_id, role");
    const roleSet = new Set((roles ?? []).map((r: any) => `${r.user_id}:${r.role}`));
    return (rows ?? []).map((u: any) => ({
      ...u,
      is_super_admin: roleSet.has(`${u.id}:super_admin`),
    }));
  });

export const setUserLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; lock: boolean; reason?: string }) =>
    z
      .object({
        userId: z.string().uuid(),
        lock: z.boolean(),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    if (data.userId === context.userId) {
      throw new Error("You cannot lock your own account");
    }
    const patch: any = data.lock
      ? {
          is_locked: true,
          locked_at: new Date().toISOString(),
          locked_by: context.userId,
          locked_reason: data.reason ?? null,
        }
      : { is_locked: false, locked_at: null, locked_by: null, locked_reason: null };
    const { error } = await context.supabase
      .from("profiles")
      .update(patch)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    // Best-effort revoke active sessions for the locked user
    if (data.lock) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.auth.admin.signOut(data.userId);
      } catch (e) {
        // non-fatal
        console.warn("Could not revoke sessions:", (e as any)?.message);
      }
    }
    return { ok: true };
  });

export const setSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; grant: boolean }) =>
    z.object({ userId: z.string().uuid(), grant: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    if (data.grant) {
      const { error } = await context.supabase
        .from("user_roles")
        .upsert(
          { user_id: data.userId, role: "super_admin", granted_by: context.userId },
          { onConflict: "user_id,role" },
        );
      if (error) throw new Error(error.message);
    } else {
      if (data.userId === context.userId) {
        throw new Error("You cannot revoke your own super-admin role");
      }
      const { error } = await context.supabase
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "super_admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* ---------- App settings (e.g. AI keys, configurable later) ---------- */

export const getAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { data, error } = await context.supabase
      .from("app_settings")
      .select("key, value, updated_at");
    if (error) throw new Error(error.message);
    const out: Record<string, any> = {};
    for (const row of data ?? []) out[(row as any).key] = (row as any).value;
    return out;
  });

export const setAppSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; value: unknown }) =>
    z.object({ key: z.string().min(1).max(80), value: z.unknown() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { error } = await context.supabase
      .from("app_settings")
      .upsert(
        { key: data.key, value: data.value as any, updated_by: context.userId },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Self check (used by sign-in to detect lock) ---------- */

export const checkMyLock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("is_locked, locked_reason")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) return { is_locked: false, reason: null };
    return {
      is_locked: Boolean((data as any)?.is_locked),
      reason: (data as any)?.locked_reason ?? null,
    };
  });