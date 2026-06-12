import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RoleEnum = z.enum(["owner", "admin", "member", "viewer"]);

async function assertAdmin(ctx: any, workspaceId: string) {
  const { data, error } = await ctx.supabase.rpc("has_ws_role", {
    _ws: workspaceId,
    _user: ctx.userId,
    _roles: ["owner", "admin"],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: members, error } = await context.supabase
      .from("workspace_members")
      .select("user_id, role, created_at, is_locked, locked_at, locked_reason")
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (ids.length === 0) return [];
    const { data: profiles, error: pErr } = await context.supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .in("id", ids);
    if (pErr) throw new Error(pErr.message);
    const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (members ?? []).map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      created_at: m.created_at,
      is_locked: m.is_locked ?? false,
      locked_at: m.locked_at ?? null,
      locked_reason: m.locked_reason ?? null,
      profile: byId.get(m.user_id) ?? null,
    }));
  });

export const listInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.workspaceId);
    const { data: rows, error } = await context.supabase
      .from("workspace_invites")
      .select("id, email, role, token, expires_at, accepted_at, created_at")
      .eq("workspace_id", data.workspaceId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; email: string; role?: string }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        email: z.string().email().max(255),
        role: RoleEnum.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.workspaceId);
    const { data: row, error } = await context.supabase
      .from("workspace_invites")
      .upsert(
        {
          workspace_id: data.workspaceId,
          email: data.email.toLowerCase(),
          role: (data.role ?? "member") as any,
          invited_by: context.userId,
          accepted_at: null,
          // bump token on re-invite by letting default regenerate via delete+insert? upsert keeps existing token; that's ok
        },
        { onConflict: "workspace_id,email" },
      )
      .select("id, email, role, token, expires_at, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; inviteId: string }) =>
    z.object({ workspaceId: z.string().uuid(), inviteId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.workspaceId);
    const { error } = await context.supabase
      .from("workspace_invites")
      .delete()
      .eq("id", data.inviteId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; userId: string; role: string }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        userId: z.string().uuid(),
        role: RoleEnum,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.workspaceId);
    // Don't allow demoting the workspace owner via this path
    const { data: ws } = await context.supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (ws?.owner_id === data.userId && data.role !== "owner") {
      throw new Error("Cannot demote the workspace owner");
    }
    const { error } = await context.supabase
      .from("workspace_members")
      .update({ role: data.role as any })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; userId: string }) =>
    z.object({ workspaceId: z.string().uuid(), userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.workspaceId);
    const { data: ws } = await context.supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (ws?.owner_id === data.userId) {
      throw new Error("Cannot remove the workspace owner");
    }
    const { error } = await context.supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const leaveWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ws } = await context.supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (ws?.owner_id === context.userId) {
      throw new Error("Owner cannot leave. Delete the workspace or transfer ownership.");
    }
    const { error } = await context.supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Invite acceptance — uses security-definer RPC
export const getInvitePreview = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().min(10).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("get_invite_preview", {
      _token: data.token,
    });
    if (error) throw new Error(error.message);
    const r = (rows as any[])?.[0];
    if (!r) return null;
    return {
      workspaceId: r.workspace_id,
      workspaceName: r.workspace_name,
      email: r.email,
      role: r.role,
      expiresAt: r.expires_at,
      accepted: r.accepted,
    };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().min(10).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: workspaceId, error } = await context.supabase.rpc(
      "accept_workspace_invite",
      { _token: data.token },
    );
    if (error) throw new Error(error.message);
    return { workspaceId: workspaceId as string };
  });