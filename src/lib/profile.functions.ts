import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { full_name?: string; avatar_url?: string }) =>
    z
      .object({
        full_name: z.string().min(1).max(80).optional(),
        avatar_url: z.string().url().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: { full_name?: string; avatar_url?: string | null } = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
    const { data: row, error } = await context.supabase
      .from("profiles")
      .update(patch)
      .eq("id", context.userId)
      .select("id, email, full_name, avatar_url")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });