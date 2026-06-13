import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* ============== ITEM DETAIL ============== */

export const getItemDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string }) =>
    z.object({ itemId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const itemId = data.itemId;
    const [itemRes, commentsRes, activityRes, filesRes, subItemsRes, membersRes] =
      await Promise.all([
        supabase
          .from("items")
          .select("id, board_id, group_id, parent_item_id, title, created_by, created_at")
          .eq("id", itemId)
          .single(),
        supabase
          .from("comments")
          .select("id, item_id, author_id, body, created_at, edited_at")
          .eq("item_id", itemId)
          .order("created_at", { ascending: true }),
        supabase
          .from("item_activity")
          .select("id, kind, payload, actor_id, created_at")
          .eq("item_id", itemId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("item_files")
          .select("id, item_id, uploaded_by, name, path, mime_type, size_bytes, created_at")
          .eq("item_id", itemId)
          .order("created_at", { ascending: false }),
        supabase
          .from("items")
          .select("id, title, position, created_at, completed_at")
          .eq("parent_item_id", itemId)
          .order("position", { ascending: true }),
        Promise.resolve(null),
      ]);
    if (itemRes.error) throw new Error(itemRes.error.message);

    // Collect actor ids for profile lookups
    const actorIds = new Set<string>();
    (commentsRes.data ?? []).forEach((c: any) => c.author_id && actorIds.add(c.author_id));
    (activityRes.data ?? []).forEach((a: any) => a.actor_id && actorIds.add(a.actor_id));
    (filesRes.data ?? []).forEach((f: any) => f.uploaded_by && actorIds.add(f.uploaded_by));
    if (itemRes.data.created_by) actorIds.add(itemRes.data.created_by);

    let profiles: any[] = [];
    if (actorIds.size) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", Array.from(actorIds));
      profiles = p ?? [];
    }

    // Workspace members (for @mentions and people)
    const { data: boardRow } = await supabase
      .from("boards")
      .select("workspace_id")
      .eq("id", itemRes.data.board_id)
      .single();
    let members: any[] = [];
    if (boardRow?.workspace_id) {
      const { data: m } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", boardRow.workspace_id);
      const mids = (m ?? []).map((r: any) => r.user_id);
      if (mids.length) {
        const { data: mp } = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("id", mids);
        members = (mp ?? []).map((p: any) => ({
          ...p,
          role: (m ?? []).find((r: any) => r.user_id === p.id)?.role ?? "member",
        }));
      }
    }

    return {
      item: itemRes.data,
      comments: commentsRes.data ?? [],
      activity: activityRes.data ?? [],
      files: filesRes.data ?? [],
      subItems: subItemsRes.data ?? [],
      profiles,
      members,
    };
  });

/* ============== COMMENTS ============== */

function extractMentions(text: string, members: { id: string; full_name: string | null; email: string | null }[]) {
  const ids = new Set<string>();
  const re = /@([\w.-]+)/g;
  for (const match of text.matchAll(re)) {
    const handle = match[1].toLowerCase();
    for (const m of members) {
      const name = (m.full_name ?? "").toLowerCase().replace(/\s+/g, "");
      const emailLocal = (m.email ?? "").toLowerCase().split("@")[0];
      if (handle === name || handle === emailLocal) ids.add(m.id);
    }
  }
  return Array.from(ids);
}

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string; body: string }) =>
    z.object({ itemId: z.string().uuid(), body: z.string().min(1).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: comment, error } = await supabase
      .from("comments")
      .insert({ item_id: data.itemId, author_id: userId, body: data.body })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Activity log
    await supabase
      .from("item_activity")
      .insert({ item_id: data.itemId, actor_id: userId, kind: "comment_added", payload: { commentId: comment.id } });

    // Mentions → notifications
    const { data: itemRow } = await supabase
      .from("items")
      .select("board_id, title")
      .eq("id", data.itemId)
      .single();
    if (itemRow) {
      const { data: boardRow } = await supabase
        .from("boards")
        .select("workspace_id")
        .eq("id", itemRow.board_id)
        .single();
      if (boardRow) {
        const { data: members } = await supabase
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", boardRow.workspace_id);
        const ids = (members ?? []).map((m: any) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        const mentioned = extractMentions(data.body, profiles ?? []);
        const targets = mentioned.filter((id) => id !== userId);
        if (targets.length) {
          await supabase.from("notifications").insert(
            targets.map((uid) => ({
              user_id: uid,
              kind: "mention",
              payload: { itemId: data.itemId, commentId: comment.id, title: itemRow.title },
            })),
          );
        }
      }
    }
    return { id: comment.id };
  });

export const updateComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; body: string }) =>
    z.object({ id: z.string().uuid(), body: z.string().min(1).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("comments")
      .update({ body: data.body, edited_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("comments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============== SUB-ITEMS ============== */

export const createSubItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { parentId: string; title: string }) =>
    z.object({ parentId: z.string().uuid(), title: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: parent, error: pErr } = await supabase
      .from("items")
      .select("board_id, group_id")
      .eq("id", data.parentId)
      .single();
    if (pErr) throw new Error(pErr.message);
    const { data: maxRow } = await supabase
      .from("items")
      .select("position")
      .eq("parent_item_id", data.parentId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pos = (maxRow?.position ?? 0) + 1024;
    const { data: item, error } = await supabase
      .from("items")
      .insert({
        board_id: parent.board_id,
        group_id: parent.group_id,
        parent_item_id: data.parentId,
        title: data.title,
        position: pos,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase
      .from("item_activity")
      .insert({ item_id: data.parentId, actor_id: userId, kind: "subitem_added", payload: { childId: item.id, title: data.title } });
    return { id: item.id };
  });

/* ============== FILES ============== */

export const registerFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string; path: string; name: string; mime?: string | null; size?: number | null }) =>
    z
      .object({
        itemId: z.string().uuid(),
        path: z.string().min(1),
        name: z.string().min(1),
        mime: z.string().nullable().optional(),
        size: z.number().int().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("item_files")
      .insert({
        item_id: data.itemId,
        uploaded_by: userId,
        name: data.name,
        path: data.path,
        mime_type: data.mime ?? null,
        size_bytes: data.size ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase
      .from("item_activity")
      .insert({ item_id: data.itemId, actor_id: userId, kind: "file_added", payload: { name: data.name, path: data.path } });
    return { id: row.id };
  });

export const deleteFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("item_files")
      .select("path")
      .eq("id", data.id)
      .single();
    if (row?.path) {
      await supabase.storage.from("item-files").remove([row.path]);
    }
    const { error } = await supabase.from("item_files").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const signFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string }) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("item-files")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });