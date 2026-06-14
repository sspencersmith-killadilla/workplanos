import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("organization_members")
      .select("role, organizations:organization_id ( id, name, slug, color, primary_domain, logo_url, plan )")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row: any) => ({ ...row.organizations, role: row.role }))
      .filter((o: any) => o.id)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  });

export const getOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase
      .from("organizations")
      .select("id, name, slug, color, primary_domain, logo_url, plan, settings, created_at")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!org) throw new Error("Organization not found");
    const { data: me } = await context.supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", org.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    return { ...org, role: (me?.role as string | undefined) ?? null };
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name?: string; color?: string; logo_url?: string | null; primary_domain?: string | null }) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        color: z.string().max(20).optional(),
        logo_url: z.string().url().nullable().optional(),
        primary_domain: z.string().max(253).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("organizations").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOrgMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("organization_members")
      .select("user_id, role, created_at, profiles:user_id ( id, full_name, email, avatar_url )")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      user_id: r.user_id,
      role: r.role,
      created_at: r.created_at,
      full_name: r.profiles?.full_name ?? null,
      email: r.profiles?.email ?? null,
      avatar_url: r.profiles?.avatar_url ?? null,
    }));
  });

export const updateOrgMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; userId: string; role: "owner" | "admin" | "billing" | "member" }) =>
    z
      .object({
        organizationId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(["owner", "admin", "billing", "member"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) {
      throw new Error("You cannot change your own role");
    }
    const { error } = await context.supabase
      .from("organization_members")
      .update({ role: data.role })
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeOrgMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; userId: string }) =>
    z.object({ organizationId: z.string().uuid(), userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ Domains ============ */

export const listOrgDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("org_domains")
      .select("id, domain, verified_at, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addOrgDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; domain: string }) =>
    z
      .object({
        organizationId: z.string().uuid(),
        domain: z
          .string()
          .min(3)
          .max(253)
          .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Enter a valid domain (e.g. city.gov)"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const domain = data.domain.toLowerCase().trim();
    const { error } = await context.supabase.from("org_domains").insert({
      organization_id: data.organizationId,
      domain,
      // For Phase 1 we auto-verify on insert; a real verification flow comes later.
      verified_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeOrgDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("org_domains").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ Department requests ============ */

export const listDepartmentRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("department_requests")
      .select(
        "id, name, reason, status, requested_by, decided_by, decided_at, created_workspace_id, created_at, requester:requested_by ( id, full_name, email )",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createDepartmentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; name: string; reason?: string }) =>
    z
      .object({
        organizationId: z.string().uuid(),
        name: z.string().min(1).max(80),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("department_requests").insert({
      organization_id: data.organizationId,
      requested_by: context.userId,
      name: data.name,
      reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const decideDepartmentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean }) =>
    z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: req, error: reqErr } = await context.supabase
      .from("department_requests")
      .select("id, organization_id, name, status")
      .eq("id", data.id)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("Request already decided");

    let createdWorkspaceId: string | null = null;
    if (data.approve) {
      const baseSlug =
        req.name
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || "department";
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: ws, error: wsErr } = await context.supabase
        .from("workspaces")
        .insert({
          name: req.name,
          slug,
          owner_id: context.userId,
          color: "#6366f1",
          organization_id: req.organization_id,
        })
        .select("id")
        .single();
      if (wsErr) throw new Error(wsErr.message);
      createdWorkspaceId = ws.id;
    }

    const { error: updErr } = await context.supabase
      .from("department_requests")
      .update({
        status: data.approve ? "approved" : "rejected",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        created_workspace_id: createdWorkspaceId,
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, workspaceId: createdWorkspaceId };
  });

/* ============ Audit log ============ */

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("audit_log")
      .select("id, action, target_type, target_id, metadata, created_at, actor:actor_id ( id, full_name, email )")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });